//! Offline BM25 retrieval with verifiable source and passage metadata.

use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io::{BufRead, BufReader},
    path::Path,
};

use irco_core::IrcoError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceKind {
    SourceExcerpt,
    CuratedSummary,
}

fn default_evidence_kind() -> EvidenceKind {
    EvidenceKind::CuratedSummary
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CorpusEntry {
    pub id: String,
    pub title: String,
    pub source: String,
    pub section: String,
    pub url: String,
    pub content: String,
    #[serde(default = "default_evidence_kind")]
    pub evidence_kind: EvidenceKind,
    #[serde(default)]
    pub hazard: Option<String>,
    #[serde(default)]
    pub indicators_related: Vec<String>,
    #[serde(default)]
    pub organ_systems: Vec<String>,
    #[serde(default)]
    pub document_date: Option<String>,
    #[serde(default)]
    pub extraction_date: Option<String>,
    #[serde(default)]
    pub page_numbers: Option<String>,
    #[serde(default)]
    pub confidence: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct SearchFilters<'a> {
    pub hazard: Option<&'a str>,
    pub indicator: Option<&'a str>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Citation {
    pub document_id: String,
    pub title: String,
    pub publisher: String,
    pub url: String,
    pub section: String,
    pub page_numbers: Option<String>,
    pub document_date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchHit {
    pub score: f64,
    pub evidence: String,
    pub evidence_kind: EvidenceKind,
    pub citation: Citation,
    pub hazard: Option<String>,
    pub indicators_related: Vec<String>,
    pub confidence: Option<String>,
}

pub struct KnowledgeBase {
    documents: Vec<CorpusEntry>,
    term_frequencies: Vec<HashMap<String, usize>>,
    document_frequencies: HashMap<String, usize>,
    average_document_length: f64,
}

impl KnowledgeBase {
    pub fn from_entries(documents: Vec<CorpusEntry>) -> Self {
        let term_frequencies: Vec<HashMap<String, usize>> = documents
            .iter()
            .map(|document| frequencies(&tokenize(&document.content)))
            .collect();
        let mut document_frequencies = HashMap::new();
        let mut total_length = 0usize;
        for frequencies in &term_frequencies {
            total_length += frequencies.values().sum::<usize>();
            for term in frequencies.keys() {
                *document_frequencies.entry(term.clone()).or_insert(0) += 1;
            }
        }
        let average_document_length = if documents.is_empty() {
            0.0
        } else {
            total_length as f64 / documents.len() as f64
        };
        Self {
            documents,
            term_frequencies,
            document_frequencies,
            average_document_length,
        }
    }

    pub fn load_jsonl(path: impl AsRef<Path>) -> Result<Self, IrcoError> {
        let file = File::open(path.as_ref()).map_err(|error| {
            IrcoError::Knowledge(format!(
                "Could not open corpus {}: {error}",
                path.as_ref().display()
            ))
        })?;
        let mut documents = Vec::new();
        for (index, line) in BufReader::new(file).lines().enumerate() {
            let line = line.map_err(|error| IrcoError::Knowledge(error.to_string()))?;
            if line.trim().is_empty() {
                continue;
            }
            let document: CorpusEntry = serde_json::from_str(&line).map_err(|error| {
                IrcoError::Knowledge(format!("Invalid corpus line {}: {error}", index + 1))
            })?;
            documents.push(document);
        }
        Ok(Self::from_entries(documents))
    }

    pub fn document_count(&self) -> usize {
        self.documents.len()
    }

    /// Curated corpus entries in their original order. The read-only sources
    /// endpoint exposes exactly the documents the assistant can cite.
    pub fn documents(&self) -> &[CorpusEntry] {
        &self.documents
    }

    pub fn search(&self, query: &str, filters: SearchFilters<'_>, limit: usize) -> Vec<SearchHit> {
        if limit == 0 || self.documents.is_empty() {
            return Vec::new();
        }
        let terms: HashSet<String> = tokenize(query).into_iter().collect();
        if terms.is_empty() {
            return Vec::new();
        }

        let mut results = Vec::new();
        for (index, document) in self.documents.iter().enumerate() {
            if filters
                .hazard
                .is_some_and(|hazard| document.hazard.as_deref() != Some(hazard))
                || filters.indicator.is_some_and(|indicator| {
                    !document
                        .indicators_related
                        .iter()
                        .any(|candidate| candidate == indicator)
                })
            {
                continue;
            }
            let length = self.term_frequencies[index].values().sum::<usize>() as f64;
            let mut score = 0.0;
            for term in &terms {
                let Some(&frequency) = self.term_frequencies[index].get(term) else {
                    continue;
                };
                let document_frequency = *self.document_frequencies.get(term).unwrap_or(&0) as f64;
                let documents = self.documents.len() as f64;
                let idf = (1.0
                    + (documents - document_frequency + 0.5) / (document_frequency + 0.5))
                    .ln();
                let k1 = 1.2;
                let b = 0.75;
                let normalization = frequency as f64
                    + k1 * (1.0 - b + b * length / self.average_document_length.max(f64::EPSILON));
                score += idf * frequency as f64 * (k1 + 1.0) / normalization;
            }
            if score <= 0.0 {
                continue;
            }
            results.push(SearchHit {
                score,
                evidence: document.content.clone(),
                evidence_kind: document.evidence_kind,
                citation: Citation {
                    document_id: document.id.clone(),
                    title: document.title.clone(),
                    publisher: document.source.clone(),
                    url: document.url.clone(),
                    section: document.section.clone(),
                    page_numbers: document.page_numbers.clone(),
                    document_date: document.document_date.clone(),
                },
                hazard: document.hazard.clone(),
                indicators_related: document.indicators_related.clone(),
                confidence: document.confidence.clone(),
            });
        }
        results.sort_by(|left, right| right.score.total_cmp(&left.score));
        results.truncate(limit);
        results
    }
}

fn frequencies(tokens: &[String]) -> HashMap<String, usize> {
    let mut result = HashMap::new();
    for token in tokens {
        *result.entry(token.clone()).or_insert(0) += 1;
    }
    result
}

fn tokenize(text: &str) -> Vec<String> {
    let stop_words = stop_words();
    let mut tokens = Vec::new();
    let mut current = String::new();
    for character in text.chars().flat_map(char::to_lowercase) {
        let folded = fold_accent(character);
        if folded.is_alphanumeric() {
            current.push(folded);
        } else if !current.is_empty() {
            if current.len() > 1 && !stop_words.contains(current.as_str()) {
                tokens.push(std::mem::take(&mut current));
            } else {
                current.clear();
            }
        }
    }
    if current.len() > 1 && !stop_words.contains(current.as_str()) {
        tokens.push(current);
    }
    tokens
}

fn fold_accent(character: char) -> char {
    match character {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => 'a',
        'ç' => 'c',
        'è' | 'é' | 'ê' | 'ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' => 'i',
        'ñ' => 'n',
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' => 'o',
        'ù' | 'ú' | 'û' | 'ü' => 'u',
        'ý' | 'ÿ' => 'y',
        _ => character,
    }
}

fn stop_words() -> HashSet<&'static str> {
    [
        "a", "an", "and", "are", "as", "at", "avec", "dans", "de", "des", "du", "en", "et", "for",
        "from", "in", "is", "la", "le", "les", "of", "on", "or", "par", "pour", "the", "to", "un",
        "une", "with",
    ]
    .into_iter()
    .collect()
}

#[cfg(test)]
mod tests {
    use super::{CorpusEntry, EvidenceKind, KnowledgeBase, SearchFilters};

    fn document(id: &str, content: &str, hazard: &str) -> CorpusEntry {
        CorpusEntry {
            id: id.to_owned(),
            title: format!("Document {id}"),
            source: "NASA".to_owned(),
            section: "Radiation monitoring".to_owned(),
            url: format!("https://example.test/{id}"),
            content: content.to_owned(),
            evidence_kind: EvidenceKind::CuratedSummary,
            hazard: Some(hazard.to_owned()),
            indicators_related: vec!["radiation_dose_daily".to_owned()],
            organ_systems: vec![],
            document_date: Some("2025-01-01".to_owned()),
            extraction_date: Some("2026-01-01T00:00:00Z".to_owned()),
            page_numbers: Some("12-13".to_owned()),
            confidence: Some("supported".to_owned()),
        }
    }

    #[test]
    fn search_returns_passage_and_verifiable_citation_with_filters() {
        let index = KnowledgeBase::from_entries(vec![
            document("doc-1", "Surveillance des radiations et dose", "radiation"),
            document("doc-2", "Sleep and fatigue research", "isolation"),
        ]);
        let results = index.search(
            "radiations",
            SearchFilters {
                hazard: Some("radiation"),
                indicator: Some("radiation_dose_daily"),
            },
            3,
        );
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].citation.document_id, "doc-1");
        assert_eq!(results[0].citation.page_numbers.as_deref(), Some("12-13"));
        assert_eq!(
            results[0].citation.document_date.as_deref(),
            Some("2025-01-01")
        );
        assert_eq!(results[0].evidence_kind, EvidenceKind::CuratedSummary);
        assert!(results[0].evidence.contains("dose"));
    }

    #[test]
    fn accent_folding_supports_french_queries() {
        let index = KnowledgeBase::from_entries(vec![document(
            "doc-1",
            "Données sur l’exposition",
            "radiation",
        )]);
        assert_eq!(
            index
                .search("exposition", SearchFilters::default(), 5)
                .len(),
            1
        );
    }

    #[test]
    fn empty_query_or_empty_corpus_returns_no_evidence() {
        assert!(KnowledgeBase::from_entries(vec![])
            .search("radiation", SearchFilters::default(), 1)
            .is_empty());
        assert!(KnowledgeBase::from_entries(vec![document(
            "doc-1",
            "radiation dose",
            "radiation"
        )])
        .search("the and of", SearchFilters::default(), 1)
        .is_empty());
    }

    #[test]
    fn checked_in_corpus_keeps_source_dates_in_citations() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../data/corpus.jsonl");
        let index = KnowledgeBase::load_jsonl(path).unwrap();
        let results = index.search("neutron bubble monitors", SearchFilters::default(), 5);
        let radi_n2 = results
            .iter()
            .find(|hit| hit.citation.document_id == "csa-radi-n2-monitoring")
            .unwrap();
        assert_eq!(
            radi_n2.citation.document_date.as_deref(),
            Some("2025-10-28")
        );
        assert_eq!(radi_n2.evidence_kind, EvidenceKind::CuratedSummary);
        assert!(radi_n2.evidence.contains("bubble monitors"));
    }

    #[test]
    fn checked_in_corpus_exposes_every_source_with_its_url() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../data/corpus.jsonl");
        let index = KnowledgeBase::load_jsonl(path).unwrap();
        assert_eq!(index.documents().len(), index.document_count());
        assert_eq!(index.documents().len(), 11);
        assert!(
            index
                .documents()
                .iter()
                .all(|document| document.url.starts_with("https://")),
            "every curated source must carry a public URL"
        );
        for id in [
            "noaa-swpc-realtime-feeds",
            "nasa-osdr-eda-rr1-telemetry",
            "nasa-hrp-hazards-overview",
        ] {
            assert!(
                index.documents().iter().any(|document| document.id == id),
                "missing curated source {id}"
            );
        }
    }
}
