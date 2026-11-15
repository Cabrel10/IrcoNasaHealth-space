use thiserror::Error;

/// Unified error type for the IRCO system
#[derive(Debug, Error)]
pub enum IrcoError {
    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Ingestion error: {0}")]
    Ingestion(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Query error: {0}")]
    Query(String),

    #[error("Rule evaluation error: {0}")]
    RuleEval(String),

    #[error("Alert error: {0}")]
    Alert(String),

    #[error("Knowledge error: {0}")]
    Knowledge(String),

    #[error("AI gateway error: {0}")]
    AiGateway(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Internal error: {0}")]
    Internal(String),
}
