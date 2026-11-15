//! # irco-health
//!
//! Health analysis engine for the IRCO system.
//!
//! Processes observations through temporal analysis, baseline comparison,
//! correlation detection, anomaly detection, and contextual enrichment.

pub mod anomalies;
pub mod baseline;
pub mod context;
pub mod correlations;
pub mod indicators;
pub mod temporal;
