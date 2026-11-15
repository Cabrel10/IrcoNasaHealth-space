//! Citation-preserving answer fallback. External model relays are optional and
//! must not be used to set deterministic vigilance.

use std::time::Duration;

use irco_knowledge::{Citation, EvidenceKind, SearchHit};
use reqwest::{Client, Url};
use serde::Serialize;
use serde_json::{json, Value};
use tracing::warn;

pub const MEDICAL_DISCLAIMER: &str = "Decision support, not a diagnosis.";
const MINIMUM_RELEVANCE_SCORE: f64 = 0.25;
const MAX_CONTEXT_HITS: usize = 5;

#[derive(Debug)]
struct ColabEndpoint {
    chat_completions_url: Url,
    api_key: String,
    model: String,
}

fn endpoint_from_parts(api_base: &str, api_key: &str, model: &str) -> Option<ColabEndpoint> {
    if api_key.is_empty() || model.trim().is_empty() {
        return None;
    }
    let mut url = Url::parse(api_base).ok()?;
    if url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return None;
    }
    let secure = url.scheme() == "https";
    let loopback_http = url.scheme() == "http"
        && url
            .host_str()
            .is_some_and(|host| matches!(host, "localhost" | "127.0.0.1" | "[::1]"));
    if !secure && !loopback_http {
        return None;
    }
    let mut path = url.path().trim_end_matches('/').to_owned();
    if !path.ends_with("/v1") {
        path.push_str("/v1");
    }
    path.push_str("/chat/completions");
    url.set_path(&path);

    Some(ColabEndpoint {
        chat_completions_url: url,
        api_key: api_key.to_owned(),
        model: model.to_owned(),
    })
}

/// Keep only evidence above the retrieval threshold and bound the prompt size.
pub fn relevant_hits(hits: &[SearchHit]) -> Vec<SearchHit> {
    hits.iter()
        .filter(|hit| hit.score >= MINIMUM_RELEVANCE_SCORE)
        .take(MAX_CONTEXT_HITS)
        .cloned()
        .collect()
}

/// Ask the registered Colab OpenAI-compatible endpoint using grounded context.
/// `None` means the deterministic extractive fallback should be used.
pub async fn answer_with_colab(
    api_base: &str,
    api_key: &str,
    model: &str,
    question: &str,
    health_context: Option<&str>,
    hits: &[SearchHit],
) -> Option<AssistantAnswer> {
    answer_with_colab_timeout(
        api_base,
        api_key,
        model,
        question,
        health_context,
        hits,
        Duration::from_secs(8),
    )
    .await
}

async fn answer_with_colab_timeout(
    api_base: &str,
    api_key: &str,
    model: &str,
    question: &str,
    health_context: Option<&str>,
    hits: &[SearchHit],
    timeout: Duration,
) -> Option<AssistantAnswer> {
    let hits = relevant_hits(hits);
    if hits.is_empty() {
        return None;
    }
    let endpoint = endpoint_from_parts(api_base, api_key, model)?;
    let client = match Client::builder().timeout(timeout).build() {
        Ok(client) => client,
        Err(_) => {
            warn!("Cannot initialize Colab HTTP client; using the extractive fallback");
            return None;
        }
    };

    let evidence = hits
        .iter()
        .enumerate()
        .map(|(index, hit)| {
            let kind = match hit.evidence_kind {
                EvidenceKind::SourceExcerpt => "source excerpt",
                EvidenceKind::CuratedSummary => "curated summary, not a quotation",
            };
            format!(
                "[S{}] {} — {} ({kind})\n{}",
                index + 1,
                hit.citation.title,
                hit.citation.section,
                hit.evidence
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let payload = json!({
        "model": endpoint.model,
        "temperature": 0.2,
        "top_p": 0.9,
        "max_tokens": 400,
        "seed": 42,
        "messages": [
            {
                "role": "system",
                "content": "Tu es un assistant d'aide au médecin de vol. Explique et informe, sans diagnostiquer ni recommander de modifier la vigilance. Réponds dans la langue de la question et uniquement à partir des sources fournies. Cite chaque affirmation factuelle avec [S1], [S2], etc. N'invente aucune valeur. Les résumés ne sont pas des citations textuelles. L'état du moteur de règles est en lecture seule."
            },
            {
                "role": "user",
                "content": format!(
                    "Question: {question}\n\nSources:\n{evidence}{}",
                    health_context.map_or_else(String::new, |context| format!(
                        "\n\nÉtat IRCO courant, calculé par le moteur déterministe et fourni en lecture seule. Ne le modifie pas et ne le présente pas comme une source documentaire. Référence-le avec [IRCO], pas avec [Sx]:\n{context}"
                    ))
                )
            }
        ]
    });
    let response = match client
        .post(endpoint.chat_completions_url)
        .bearer_auth(endpoint.api_key)
        .json(&payload)
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => {
            warn!("Colab completion request failed; using the extractive fallback");
            return None;
        }
    };
    let response = match response.error_for_status() {
        Ok(response) => response,
        Err(error) => {
            warn!(
                status = error.status().map(|status| status.as_u16()),
                "Colab rejected the completion request; using the extractive fallback"
            );
            return None;
        }
    };
    let response = match response.json::<Value>().await {
        Ok(response) => response,
        Err(_) => {
            warn!("Colab returned invalid completion JSON; using the extractive fallback");
            return None;
        }
    };
    let Some(answer) = response
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|answer| !answer.is_empty())
    else {
        warn!("Colab returned no text completion; using the extractive fallback");
        return None;
    };
    let Some(cited_sources) = cited_sources(answer, hits.len()) else {
        warn!("Colab completion contained missing or invalid citations; using the extractive fallback");
        return None;
    };

    Some(AssistantAnswer {
        answer: answer.to_owned(),
        citations: cited_sources
            .into_iter()
            .map(|index| hits[index - 1].citation.clone())
            .collect(),
        source_not_found: false,
        disclaimer: MEDICAL_DISCLAIMER,
        provider: "colab_openai",
    })
}

fn cited_sources(answer: &str, source_count: usize) -> Option<Vec<usize>> {
    let mut remaining = answer;
    let mut citations = Vec::new();
    while let Some(start) = remaining.find("[S") {
        let reference = &remaining[start + 2..];
        let digits = reference.bytes().take_while(u8::is_ascii_digit).count();
        if digits == 0 || reference.as_bytes().get(digits) != Some(&b']') {
            return None;
        }
        let index = reference[..digits].parse::<usize>().ok()?;
        if index == 0 || index > source_count {
            return None;
        }
        if !citations.contains(&index) {
            citations.push(index);
        }
        remaining = &reference[digits + 1..];
    }
    (!citations.is_empty()).then_some(citations)
}

#[derive(Debug, Clone, Serialize)]
pub struct AssistantAnswer {
    pub answer: String,
    pub citations: Vec<Citation>,
    pub source_not_found: bool,
    pub disclaimer: &'static str,
    pub provider: &'static str,
}

/// Compose a transparent extractive answer. No source evidence means no
/// scientific claim is made.
pub fn compose_answer(hits: &[SearchHit]) -> AssistantAnswer {
    let Some(first) = hits.first() else {
        return AssistantAnswer {
            answer:
                "Source not found. No scientific explanation is available from the local corpus."
                    .to_owned(),
            citations: Vec::new(),
            source_not_found: true,
            disclaimer: MEDICAL_DISCLAIMER,
            provider: "extractive_fallback",
        };
    };

    let evidence_label = match first.evidence_kind {
        EvidenceKind::SourceExcerpt => "this source excerpt",
        EvidenceKind::CuratedSummary => "this curated source summary",
    };
    AssistantAnswer {
        answer: format!(
            "The local scientific corpus contains {evidence_label}: {}",
            first.evidence
        ),
        citations: hits.iter().map(|hit| hit.citation.clone()).collect(),
        source_not_found: false,
        disclaimer: MEDICAL_DISCLAIMER,
        provider: "extractive_fallback",
    }
}

#[cfg(test)]
mod tests {
    use super::{
        answer_with_colab, answer_with_colab_timeout, cited_sources, compose_answer,
        endpoint_from_parts, relevant_hits, MEDICAL_DISCLAIMER,
    };
    use irco_knowledge::{Citation, EvidenceKind, SearchHit};
    use serde_json::{json, Value};
    use std::{
        io::{BufRead, BufReader, Read, Write},
        net::TcpListener,
        sync::mpsc::{self, Receiver},
        thread::{self, JoinHandle},
    };

    fn test_hit(score: f64) -> SearchHit {
        SearchHit {
            score,
            evidence: "Verified evidence passage.".to_owned(),
            evidence_kind: EvidenceKind::SourceExcerpt,
            citation: Citation {
                document_id: "source-1".to_owned(),
                title: "Test source".to_owned(),
                publisher: "NASA".to_owned(),
                url: "https://example.test/source".to_owned(),
                section: "Section 1".to_owned(),
                page_numbers: None,
                document_date: None,
            },
            hazard: None,
            indicators_related: vec![],
            confidence: Some("supported".to_owned()),
        }
    }

    fn mock_completion(content: &'static str) -> (String, Receiver<Value>, JoinHandle<()>) {
        mock_response(
            "200 OK",
            json!({"choices": [{"message": {"content": content}}]}).to_string(),
        )
    }

    fn mock_response(
        status: &'static str,
        response_body: String,
    ) -> (String, Receiver<Value>, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (sender, receiver) = mpsc::channel();
        let task = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = Vec::new();
            reader.read_until(b'\n', &mut line).unwrap();
            let mut content_length = 0;
            loop {
                line.clear();
                reader.read_until(b'\n', &mut line).unwrap();
                if line == b"\r\n" || line.is_empty() {
                    break;
                }
                if let Some(value) = line
                    .strip_prefix(b"Content-Length:")
                    .or_else(|| line.strip_prefix(b"content-length:"))
                {
                    content_length = std::str::from_utf8(value)
                        .unwrap()
                        .trim()
                        .parse::<usize>()
                        .unwrap();
                }
            }
            let mut request_body = vec![0; content_length];
            reader.read_exact(&mut request_body).unwrap();
            sender
                .send(serde_json::from_slice(&request_body).unwrap())
                .unwrap();
            write!(
                stream,
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response_body}",
                response_body.len(),
            )
            .unwrap();
        });
        (format!("http://{address}/v1"), receiver, task)
    }

    #[test]
    fn no_evidence_never_generates_a_scientific_answer() {
        let answer = compose_answer(&[]);
        assert!(answer.source_not_found);
        assert!(answer.answer.contains("Source not found"));
        assert!(answer.citations.is_empty());
        assert_eq!(answer.disclaimer, MEDICAL_DISCLAIMER);
    }

    #[test]
    fn returned_passage_keeps_its_citation() {
        let answer = compose_answer(&[test_hit(1.0)]);
        assert!(answer.answer.contains("Verified evidence passage"));
        assert!(answer.answer.contains("source excerpt"));
        assert_eq!(answer.citations[0].document_id, "source-1");
        assert!(!answer.source_not_found);
        assert_eq!(answer.disclaimer, MEDICAL_DISCLAIMER);
    }

    #[test]
    fn curated_summary_is_not_presented_as_a_source_excerpt() {
        let answer = compose_answer(&[SearchHit {
            score: 1.0,
            evidence: "Curated summary of source material.".to_owned(),
            evidence_kind: EvidenceKind::CuratedSummary,
            citation: Citation {
                document_id: "source-2".to_owned(),
                title: "Test source".to_owned(),
                publisher: "CSA".to_owned(),
                url: "https://example.test/source-2".to_owned(),
                section: "Section 1".to_owned(),
                page_numbers: None,
                document_date: Some("2025-01-01".to_owned()),
            },
            hazard: None,
            indicators_related: vec![],
            confidence: Some("supported".to_owned()),
        }]);
        assert!(answer.answer.contains("curated source summary"));
        assert!(!answer.answer.contains("source excerpt"));
    }

    #[test]
    fn registered_colab_endpoint_resolves_openai_compatible_route() {
        let endpoint =
            endpoint_from_parts("https://colab.example.test/v1", "test-key", "qwen-test").unwrap();
        assert_eq!(
            endpoint.chat_completions_url.as_str(),
            "https://colab.example.test/v1/chat/completions"
        );
        assert_eq!(endpoint.model, "qwen-test");
    }

    #[tokio::test]
    async fn registered_chat_receives_grounded_health_context_and_seed() {
        let (api_base, request, task) =
            mock_completion("This is supported by the source [S1]. Current state [IRCO].");
        let answer = answer_with_colab(
            &api_base,
            "test-key",
            "qwen-test",
            "Explain this state",
            Some(r#"{"vigilance":"yellow"}"#),
            &[test_hit(0.8)],
        )
        .await
        .unwrap();
        let payload = request.recv().unwrap();
        task.join().unwrap();
        assert_eq!(answer.provider, "colab_openai");
        assert_eq!(answer.citations[0].document_id, "source-1");
        assert_eq!(payload["model"], "qwen-test");
        assert_eq!(payload["seed"], 42);
        assert!(payload["messages"][1]["content"]
            .as_str()
            .unwrap()
            .contains("vigilance"));
        assert_eq!(payload["messages"][0]["role"], "system");
    }

    #[tokio::test]
    async fn registered_chat_rejects_invented_citations() {
        let (api_base, request, task) = mock_completion("Unsupported claim [S2].");
        assert!(answer_with_colab(
            &api_base,
            "test-key",
            "qwen-test",
            "Question",
            None,
            &[test_hit(0.8)],
        )
        .await
        .is_none());
        request.recv().unwrap();
        task.join().unwrap();
    }

    #[tokio::test]
    async fn registered_chat_falls_back_on_provider_errors_and_malformed_json() {
        for (status, body) in [
            ("503 Service Unavailable", r#"{"error":"offline"}"#),
            ("200 OK", "{malformed"),
        ] {
            let (api_base, request, task) = mock_response(status, body.to_owned());
            assert!(answer_with_colab(
                &api_base,
                "test-key",
                "qwen-test",
                "Question",
                None,
                &[test_hit(0.8)],
            )
            .await
            .is_none());
            request.recv().unwrap();
            task.join().unwrap();
        }
    }

    #[tokio::test]
    async fn registered_chat_times_out_to_the_local_fallback() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let task = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            thread::sleep(std::time::Duration::from_millis(100));
            drop(stream);
        });
        assert!(answer_with_colab_timeout(
            &format!("http://{address}/v1"),
            "test-key",
            "qwen-test",
            "Question",
            None,
            &[test_hit(0.8)],
            std::time::Duration::from_millis(20),
        )
        .await
        .is_none());
        task.join().unwrap();
    }

    #[tokio::test]
    async fn registered_chat_does_not_call_colab_without_relevant_sources() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let api_base = format!("http://{}/v1", listener.local_addr().unwrap());
        assert!(answer_with_colab(
            &api_base,
            "test-key",
            "qwen-test",
            "Question",
            None,
            &[test_hit(0.1)],
        )
        .await
        .is_none());
        assert!(listener.accept().is_err());
    }

    #[test]
    fn relevant_evidence_obeys_the_minimum_score_and_context_limit() {
        let hits: Vec<_> = (0..7)
            .map(|index| SearchHit {
                score: if index == 0 { 0.1 } else { 0.5 },
                evidence: format!("Evidence {index}"),
                evidence_kind: EvidenceKind::SourceExcerpt,
                citation: Citation {
                    document_id: format!("source-{index}"),
                    title: "Test source".to_owned(),
                    publisher: "NASA".to_owned(),
                    url: format!("https://example.test/{index}"),
                    section: "Section 1".to_owned(),
                    page_numbers: None,
                    document_date: None,
                },
                hazard: None,
                indicators_related: vec![],
                confidence: None,
            })
            .collect();
        let filtered = relevant_hits(&hits);
        assert_eq!(filtered.len(), 5);
        assert!(filtered.iter().all(|hit| hit.score >= 0.25));
    }

    #[test]
    fn colab_citations_must_reference_available_sources() {
        assert_eq!(
            cited_sources("Supported by [S2] and [S1].", 2),
            Some(vec![2, 1])
        );
        assert_eq!(cited_sources("Unsupported [S3].", 2), None);
        assert_eq!(cited_sources("No citations.", 2), None);
    }
}
