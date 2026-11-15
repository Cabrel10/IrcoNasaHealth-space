//! Citation-preserving answer fallback. External model relays are optional and
//! must not be used to set deterministic vigilance.

use std::{env, fs, path::PathBuf, time::Duration};

use irco_knowledge::{Citation, EvidenceKind, SearchHit};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
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

#[derive(Debug, Deserialize)]
struct AichatConfig {
    model: Option<String>,
    #[serde(default)]
    clients: Vec<AichatClient>,
}

#[derive(Debug, Deserialize)]
struct AichatClient {
    #[serde(rename = "type")]
    client_type: String,
    name: String,
    api_base: String,
    api_key: Option<String>,
    #[serde(default)]
    models: Vec<AichatModel>,
}

#[derive(Debug, Deserialize)]
struct AichatModel {
    name: String,
}

fn endpoint_from_config(config: AichatConfig) -> Option<ColabEndpoint> {
    let client = config
        .clients
        .into_iter()
        .find(|client| client.name == "local" && client.client_type == "openai-compatible")?;
    let model = client
        .models
        .first()
        .map(|model| model.name.clone())
        .or_else(|| {
            config
                .model
                .as_deref()
                .and_then(|model| model.strip_prefix("local:"))
                .map(str::to_owned)
        })?;
    if model.trim().is_empty() {
        return None;
    }

    let mut url = Url::parse(&client.api_base).ok()?;
    if url.query().is_some() || url.fragment().is_some() {
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
        api_key: client.api_key.unwrap_or_else(|| "not-needed".to_owned()),
        model,
    })
}

fn current_colab_endpoint() -> Option<ColabEndpoint> {
    let config_path = env::var_os("COLAB_AICHAT_CONFIG")
        .map(PathBuf::from)
        .or_else(|| {
            env::var_os("HOME").map(|home| {
                PathBuf::from(home)
                    .join(".config")
                    .join("aichat")
                    .join("config.yaml")
            })
        })?;
    let contents = match fs::read_to_string(&config_path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => {
            warn!(%error, "Cannot read the configured Colab endpoint file");
            return None;
        }
    };
    let config = match serde_yaml::from_str::<AichatConfig>(&contents) {
        Ok(config) => config,
        Err(_) => {
            warn!("The configured Colab endpoint file is not valid aichat YAML");
            return None;
        }
    };
    endpoint_from_config(config).or_else(|| {
        warn!("No OpenAI-compatible Colab client named local is configured");
        None
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

/// Ask the current Colab OpenAI-compatible endpoint using evidence only.
/// `None` means the deterministic extractive fallback should be used.
pub async fn answer_with_colab(question: &str, hits: &[SearchHit]) -> Option<AssistantAnswer> {
    let hits = relevant_hits(hits);
    if hits.is_empty() {
        return None;
    }
    let endpoint = current_colab_endpoint()?;
    let client = match Client::builder().timeout(Duration::from_secs(8)).build() {
        Ok(client) => client,
        Err(error) => {
            warn!(%error, "Cannot initialize Colab HTTP client");
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
        "messages": [
            {
                "role": "system",
                "content": "Tu es un assistant d'aide au médecin de vol. Explique et informe, sans diagnostiquer ni recommander de modifier la vigilance. Réponds dans la langue de la question et uniquement à partir des sources fournies. Cite chaque affirmation factuelle avec [S1], [S2], etc. N'invente aucune valeur. Les résumés ne sont pas des citations textuelles. L'état du moteur de règles est en lecture seule."
            },
            {
                "role": "user",
                "content": format!("Question: {question}\n\nSources:\n{evidence}")
            }
        ]
    });
    let response = match client
        .post(endpoint.chat_completions_url)
        .bearer_auth(endpoint.api_key)
        .json(&payload)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
    {
        Ok(response) => response,
        Err(error) => {
            warn!(%error, "Colab completion failed; using the extractive fallback");
            return None;
        }
    };
    let response = match response.json::<Value>().await {
        Ok(response) => response,
        Err(error) => {
            warn!(%error, "Colab returned invalid completion JSON; using the extractive fallback");
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
        cited_sources, compose_answer, endpoint_from_config, relevant_hits, AichatConfig,
        MEDICAL_DISCLAIMER,
    };
    use irco_knowledge::{Citation, EvidenceKind, SearchHit};

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
        let answer = compose_answer(&[SearchHit {
            score: 1.0,
            evidence: "Verified evidence passage.".to_owned(),
            evidence_kind: EvidenceKind::SourceExcerpt,
            citation: Citation {
                document_id: "source-1".to_owned(),
                title: "Test source".to_owned(),
                publisher: "NASA".to_owned(),
                url: "https://example.test/source".to_owned(),
                section: "Section 1".to_owned(),
                page_numbers: Some("4".to_owned()),
                document_date: None,
            },
            hazard: Some("radiation".to_owned()),
            indicators_related: vec![],
            confidence: Some("supported".to_owned()),
        }]);
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
    fn colab_config_resolves_the_current_openai_compatible_model() {
        let config: AichatConfig = serde_yaml::from_str(
            r#"
model: local:qwen-test
clients:
  - type: openai-compatible
    name: local
    api_base: https://colab.example.test/v1
    api_key: test-key
    models:
      - name: qwen-test
"#,
        )
        .unwrap();
        let endpoint = endpoint_from_config(config).unwrap();
        assert_eq!(
            endpoint.chat_completions_url.as_str(),
            "https://colab.example.test/v1/chat/completions"
        );
        assert_eq!(endpoint.model, "qwen-test");
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
