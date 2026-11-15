//! Provenance tracking — SHA-256 hashes, source metadata, audit trail.

/// A provenance record linking an observation to its raw source.
pub struct ProvenanceRecord {
    pub observation_id: String,
    pub source_file: String,
    pub sha256: String,
    pub collector: String,
    pub collected_at: String,
}
