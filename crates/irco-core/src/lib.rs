//! # irco-core
//!
//! Shared types, configuration, and error definitions for the IRCO system.
//!
//! This crate provides the foundational data structures used across all IRCO
//! crates, including `Observation`, `DataClass`, `VigilanceLevel`, `Alert`,
//! `DecisionRule`, and `IndicatorDef`.

pub mod config;
pub mod error;
pub mod types;

pub use config::AppConfig;
pub use error::IrcoError;
pub use types::*;
