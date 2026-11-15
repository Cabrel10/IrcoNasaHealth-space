//! Data ingestion — validating and persisting pivot observations.

use irco_core::{IrcoError, Observation};
use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Default, PartialEq, Eq)]
pub struct IngestSummary {
    pub accepted: usize,
    pub duplicates_skipped: usize,
}

/// Validate observations and persist them atomically, accepting exact replays only.
pub fn ingest_batch(
    conn: &mut Connection,
    observations: &[Observation],
) -> Result<IngestSummary, IrcoError> {
    let transaction = conn
        .transaction()
        .map_err(|error| IrcoError::Database(error.to_string()))?;
    let mut summary = IngestSummary::default();

    for observation in observations {
        validate(observation)?;
        let payload = serde_json::to_string(observation)
            .map_err(|error| IrcoError::Ingestion(error.to_string()))?;
        let inserted = transaction
            .execute(
                "INSERT INTO observations (
                    id, timestamp, subject_id, indicator, value, unit, source,
                    data_class, context, provenance, metadata, quality, payload_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                 ON CONFLICT(id) DO NOTHING",
                params![
                    observation.id,
                    observation.timestamp.to_rfc3339(),
                    observation.subject_id,
                    observation.indicator,
                    observation.value,
                    observation.unit,
                    observation.source,
                    observation.data_class.as_str(),
                    serde_json::to_string(&observation.context)
                        .map_err(|error| IrcoError::Ingestion(error.to_string()))?,
                    serde_json::to_string(&observation.provenance)
                        .map_err(|error| IrcoError::Ingestion(error.to_string()))?,
                    serde_json::to_string(&observation.metadata)
                        .map_err(|error| IrcoError::Ingestion(error.to_string()))?,
                    serde_json::to_string(&observation.quality)
                        .map_err(|error| IrcoError::Ingestion(error.to_string()))?,
                    payload
                ],
            )
            .map_err(|error| IrcoError::Database(error.to_string()))?;

        if inserted == 1 {
            summary.accepted += 1;
            continue;
        }

        let existing: Option<String> = transaction
            .query_row(
                "SELECT payload_json FROM observations WHERE id = ?1",
                [&observation.id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| IrcoError::Database(error.to_string()))?;

        match existing {
            Some(existing) if existing == payload => summary.duplicates_skipped += 1,
            Some(_) => {
                return Err(IrcoError::Ingestion(format!(
                    "Observation ID {} already exists with different content",
                    observation.id
                )))
            }
            None => {
                return Err(IrcoError::Database(format!(
                    "Observation {} conflicted but could not be loaded",
                    observation.id
                )))
            }
        }
    }

    transaction
        .commit()
        .map_err(|error| IrcoError::Database(error.to_string()))?;
    Ok(summary)
}

fn validate(observation: &Observation) -> Result<(), IrcoError> {
    if !valid_identifier(&observation.id, false)
        || !valid_indicator(&observation.indicator)
        || !valid_identifier(&observation.source, true)
        || observation.unit.trim().is_empty()
        || observation.unit.len() > 32
    {
        return Err(IrcoError::Validation(
            "id, indicator, source, or unit violates the pivot schema".to_owned(),
        ));
    }
    if !observation.value.is_finite() {
        return Err(IrcoError::Validation(
            "observation value must be finite".to_owned(),
        ));
    }
    if let Some(quality) = &observation.quality {
        if !matches!(
            quality.status.as_str(),
            "valid" | "suspect" | "interpolated" | "missing_imputed"
        ) {
            return Err(IrcoError::Validation(format!(
                "unsupported quality status {}",
                quality.status
            )));
        }
    }
    if let Some(hash_value) = observation.provenance.get("sha256") {
        let Some(hash) = hash_value.as_str() else {
            return Err(IrcoError::Validation(
                "provenance.sha256 must be a string".to_owned(),
            ));
        };
        if hash.len() != 64
            || !hash
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(IrcoError::Validation(
                "provenance.sha256 must be a 64-character lowercase hexadecimal digest".to_owned(),
            ));
        }
    }
    if let Some(url) = observation
        .provenance
        .get("download_url")
        .and_then(serde_json::Value::as_str)
    {
        if !(url.starts_with("https://") || url.starts_with("http://")) {
            return Err(IrcoError::Validation(
                "provenance.download_url must be an HTTP(S) URL".to_owned(),
            ));
        }
    }
    for key in ["mission", "environment", "activity"] {
        if observation
            .context
            .get(key)
            .is_some_and(|value| !value.is_string())
        {
            return Err(IrcoError::Validation(format!(
                "context.{key} must be a string"
            )));
        }
    }
    if observation
        .context
        .get("mission_day")
        .is_some_and(|value| value.as_u64().is_none_or(|day| day == 0))
    {
        return Err(IrcoError::Validation(
            "context.mission_day must be a positive integer".to_owned(),
        ));
    }
    Ok(())
}

fn valid_indicator(value: &str) -> bool {
    let bytes = value.as_bytes();
    (2..=64).contains(&bytes.len())
        && bytes[0].is_ascii_lowercase()
        && bytes[1..]
            .iter()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'_')
}

fn valid_identifier(value: &str, uppercase: bool) -> bool {
    let bytes = value.as_bytes();
    if !(3..=64).contains(&bytes.len()) {
        return false;
    }
    let starts_valid = if uppercase {
        bytes[0].is_ascii_uppercase()
    } else {
        bytes[0].is_ascii_lowercase() || bytes[0].is_ascii_digit()
    };
    starts_valid
        && bytes[1..].iter().all(|byte| {
            if uppercase {
                byte.is_ascii_uppercase() || byte.is_ascii_digit() || *byte == b'_'
            } else {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'_' || *byte == b'-'
            }
        })
}

#[cfg(test)]
mod tests {
    use super::{ingest_batch, IngestSummary};
    use crate::store::init_db;
    use irco_core::{DataClass, Observation};
    use rusqlite::Connection;
    use std::collections::HashMap;

    fn observation(value: f64) -> Observation {
        Observation {
            id: "a01-000001".to_owned(),
            timestamp: "2026-01-01T06:00:00Z".parse().unwrap(),
            subject_id: Some("A-01".to_owned()),
            indicator: "heart_rate".to_owned(),
            value,
            unit: "bpm".to_owned(),
            source: "SYNTHETIC_A01".to_owned(),
            data_class: DataClass::Synthetic,
            context: HashMap::new(),
            provenance: HashMap::new(),
            quality: None,
            metadata: HashMap::new(),
        }
    }

    #[test]
    fn persists_observations_and_skips_exact_replays() {
        let mut connection = Connection::open_in_memory().unwrap();
        init_db(&connection).unwrap();
        let row = observation(72.0);

        assert_eq!(
            ingest_batch(&mut connection, &[row.clone(), row]).unwrap(),
            IngestSummary {
                accepted: 1,
                duplicates_skipped: 1
            }
        );
    }

    #[test]
    fn rejects_conflicting_reuse_of_an_observation_id_atomically() {
        let mut connection = Connection::open_in_memory().unwrap();
        init_db(&connection).unwrap();
        ingest_batch(&mut connection, &[observation(72.0)]).unwrap();

        assert!(ingest_batch(&mut connection, &[observation(73.0)]).is_err());
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM observations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn rejects_schema_invalid_identifiers_and_hashes() {
        let mut connection = Connection::open_in_memory().unwrap();
        init_db(&connection).unwrap();
        let mut invalid_id = observation(72.0);
        invalid_id.id = "UPPER-0001".to_owned();
        assert!(ingest_batch(&mut connection, &[invalid_id]).is_err());

        let mut invalid_hash = observation(72.0);
        invalid_hash.provenance.insert(
            "sha256".to_owned(),
            serde_json::Value::String("pending".to_owned()),
        );
        assert!(ingest_batch(&mut connection, &[invalid_hash]).is_err());
    }
}
