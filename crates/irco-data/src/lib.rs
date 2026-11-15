//! # irco-data
//!
//! Data ingestion, storage, and query layer for the IRCO system.
//!
//! Uses SQLite (bundled via rusqlite) for local persistence.
//! Handles ingestion of observations, provenance tracking,
//! querying, and data export.

pub mod export;
pub mod ingest;
pub mod provenance;
pub mod query;
pub mod store;
