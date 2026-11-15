//! # irco-decisions
//!
//! Deterministic rules engine for the IRCO system.
//!
//! Evaluates decision rules against observations to determine vigilance
//! levels and trigger alerts. Rules are loaded from JSON and evaluated
//! without any AI — fully deterministic and auditable.

pub mod cross;
pub mod engine;
pub mod rules;
pub mod vigilance;
