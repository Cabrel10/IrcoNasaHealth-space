//! Citation-preserving answer fallback. External model relays are optional and
//! must not be used to set deterministic vigilance.

use irco_knowledge::{Citation, EvidenceKind, SearchHit};
use serde::Serialize;

pub const MEDICAL_DISCLAIMER: &str = "Decision support, not a diagnosis.";

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
    use super::{compose_answer, MEDICAL_DISCLAIMER};
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
}
