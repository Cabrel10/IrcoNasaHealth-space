//! Indexed observation queries with independent provenance classes.

use irco_core::{IrcoError, Observation};
use rusqlite::{params_from_iter, types::Value as SqlValue, Connection};

/// Query parameters for filtering observations.
#[derive(Debug, Clone)]
pub struct QueryParams {
    pub indicator: Option<String>,
    pub subject_id: Option<String>,
    pub source: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub data_class: Option<String>,
    pub limit: usize,
    pub offset: usize,
    pub descending: bool,
}

impl Default for QueryParams {
    fn default() -> Self {
        Self {
            indicator: None,
            subject_id: None,
            source: None,
            from: None,
            to: None,
            data_class: None,
            limit: 1000,
            offset: 0,
            descending: false,
        }
    }
}

/// Return observations matching the supplied filters, ordered by UTC timestamp.
pub fn query_observations(
    conn: &Connection,
    query: &QueryParams,
) -> Result<Vec<Observation>, IrcoError> {
    if query.limit == 0 || query.limit > 10_000 {
        return Err(IrcoError::Query(
            "limit must be between 1 and 10000".to_owned(),
        ));
    }
    if query
        .data_class
        .as_deref()
        .is_some_and(|class| !matches!(class, "measured_real" | "analog" | "synthetic"))
    {
        return Err(IrcoError::Query(
            "data_class must be measured_real, analog, or synthetic".to_owned(),
        ));
    }
    let offset = i64::try_from(query.offset)
        .map_err(|_| IrcoError::Query("offset is too large".to_owned()))?;

    let mut clauses = Vec::new();
    let mut values = Vec::new();
    add_filter(&mut clauses, &mut values, "indicator", &query.indicator)?;
    add_filter(&mut clauses, &mut values, "subject_id", &query.subject_id)?;
    add_filter(&mut clauses, &mut values, "source", &query.source)?;
    add_filter(&mut clauses, &mut values, "data_class", &query.data_class)?;
    add_filter(&mut clauses, &mut values, "timestamp >= ", &query.from)?;
    add_filter(&mut clauses, &mut values, "timestamp <= ", &query.to)?;

    let where_clause = if clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", clauses.join(" AND "))
    };
    let direction = if query.descending { "DESC" } else { "ASC" };
    let sql = format!(
        "SELECT payload_json FROM observations{where_clause} \
         ORDER BY timestamp {direction}, id {direction} LIMIT ? OFFSET ?"
    );
    values.push(SqlValue::Integer(query.limit as i64));
    values.push(SqlValue::Integer(offset));

    let mut statement = conn
        .prepare(&sql)
        .map_err(|error| IrcoError::Database(error.to_string()))?;
    let rows = statement
        .query_map(params_from_iter(values), |row| row.get::<_, String>(0))
        .map_err(|error| IrcoError::Query(error.to_string()))?;
    rows.map(|row| {
        let payload = row.map_err(|error| IrcoError::Query(error.to_string()))?;
        serde_json::from_str(&payload)
            .map_err(|error| IrcoError::Query(format!("Stored observation is invalid: {error}")))
    })
    .collect()
}

fn add_filter(
    clauses: &mut Vec<String>,
    values: &mut Vec<SqlValue>,
    column: &str,
    value: &Option<String>,
) -> Result<(), IrcoError> {
    if let Some(value) = value {
        let operator = if column.ends_with(' ') { "" } else { " = " };
        clauses.push(format!("{column}{operator}?"));
        let value = if column.starts_with("timestamp") {
            chrono::DateTime::parse_from_rfc3339(value)
                .map_err(|error| {
                    IrcoError::Query(format!("Invalid timestamp filter {value}: {error}"))
                })
                .map(|timestamp| timestamp.to_utc().to_rfc3339())?
        } else {
            value.clone()
        };
        values.push(SqlValue::Text(value));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{query_observations, QueryParams};
    use crate::{ingest::ingest_batch, store::init_db};
    use irco_core::{DataClass, Observation};
    use rusqlite::Connection;
    use std::collections::HashMap;

    fn observation(id: &str, data_class: DataClass, value: f64) -> Observation {
        Observation {
            id: id.to_owned(),
            timestamp: "2026-01-01T06:00:00Z".parse().unwrap(),
            subject_id: Some(id.to_owned()),
            indicator: "heart_rate".to_owned(),
            value,
            unit: "bpm".to_owned(),
            source: "TEST".to_owned(),
            data_class,
            context: HashMap::new(),
            provenance: HashMap::new(),
            quality: None,
            metadata: HashMap::new(),
        }
    }

    #[test]
    fn query_filters_data_classes_without_combining_them() {
        let mut connection = Connection::open_in_memory().unwrap();
        init_db(&connection).unwrap();
        ingest_batch(
            &mut connection,
            &[
                observation("real-0001", DataClass::MeasuredReal, 70.0),
                observation("analog-0001", DataClass::Analog, 71.0),
            ],
        )
        .unwrap();

        let results = query_observations(
            &connection,
            &QueryParams {
                data_class: Some("analog".to_owned()),
                ..QueryParams::default()
            },
        )
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].data_class, DataClass::Analog);
    }
}
