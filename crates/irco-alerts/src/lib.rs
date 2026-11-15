//! Persistent alert lifecycle and follow-up measurement tracking.

use chrono::Utc;
use irco_core::{Alert, AlertEvent, AlertState, IrcoError, Observation};
use rusqlite::{params, Connection, OptionalExtension};

pub fn init_db(connection: &Connection) -> Result<(), IrcoError> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS alerts (
                id TEXT PRIMARY KEY,
                subject_id TEXT NOT NULL,
                state TEXT NOT NULL,
                vigilance TEXT NOT NULL,
                data_class TEXT NOT NULL,
                payload_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_alert_subject ON alerts(subject_id);
            CREATE INDEX IF NOT EXISTS idx_alert_state ON alerts(state);
            CREATE TABLE IF NOT EXISTS followup_measurements (
                alert_id TEXT NOT NULL REFERENCES alerts(id),
                observation_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                value REAL NOT NULL,
                indicator TEXT NOT NULL,
                PRIMARY KEY (alert_id, observation_id)
            );",
        )
        .map_err(|error| IrcoError::Database(error.to_string()))
}

pub fn create_alert(connection: &Connection, alert: &Alert) -> Result<bool, IrcoError> {
    if alert.id.trim().is_empty() || alert.subject_id.trim().is_empty() {
        return Err(IrcoError::Validation(
            "alert ID and subject ID must be non-empty".to_owned(),
        ));
    }
    if alert.state != AlertState::Created {
        return Err(IrcoError::Alert(
            "new alerts must start in the created state".to_owned(),
        ));
    }
    let payload =
        serde_json::to_string(alert).map_err(|error| IrcoError::Alert(error.to_string()))?;
    let inserted = connection
        .execute(
            "INSERT OR IGNORE INTO alerts (id, subject_id, state, vigilance, data_class, payload_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                alert.id,
                alert.subject_id,
                state_name(&alert.state),
                serde_json::to_value(&alert.vigilance)
                    .map_err(|error| IrcoError::Alert(error.to_string()))?
                    .as_str()
                    .unwrap_or_default(),
                alert.data_quality.as_str(),
                payload
            ],
        )
        .map_err(|error| IrcoError::Alert(format!("Could not create alert: {error}")))?;
    if inserted == 0 {
        let existing = get_alert(connection, &alert.id)?;
        if existing.subject_id != alert.subject_id
            || existing.data_quality != alert.data_quality
            || existing.vigilance != alert.vigilance
            || existing.rules_triggered != alert.rules_triggered
        {
            return Err(IrcoError::Alert(format!(
                "Alert ID {} already exists with conflicting decision data",
                alert.id
            )));
        }
        return Ok(false);
    }
    Ok(true)
}

pub fn get_alert(connection: &Connection, alert_id: &str) -> Result<Alert, IrcoError> {
    let payload: Option<String> = connection
        .query_row(
            "SELECT payload_json FROM alerts WHERE id = ?1",
            [alert_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| IrcoError::Database(error.to_string()))?;
    let payload = payload.ok_or_else(|| IrcoError::NotFound(format!("alert {alert_id}")))?;
    serde_json::from_str(&payload)
        .map_err(|error| IrcoError::Alert(format!("Stored alert is invalid: {error}")))
}

pub fn list_alerts(
    connection: &Connection,
    subject_id: Option<&str>,
    limit: usize,
    offset: usize,
) -> Result<Vec<Alert>, IrcoError> {
    if limit == 0 || limit > 1000 {
        return Err(IrcoError::Query(
            "alert limit must be between 1 and 1000".to_owned(),
        ));
    }
    let offset = i64::try_from(offset)
        .map_err(|_| IrcoError::Query("alert offset is too large".to_owned()))?;
    let mut statement = if subject_id.is_some() {
        connection.prepare(
            "SELECT payload_json FROM alerts WHERE subject_id = ?1
             ORDER BY rowid DESC LIMIT ?2 OFFSET ?3",
        )
    } else {
        connection.prepare("SELECT payload_json FROM alerts ORDER BY rowid DESC LIMIT ?1 OFFSET ?2")
    }
    .map_err(|error| IrcoError::Database(error.to_string()))?;
    let payloads = if let Some(subject_id) = subject_id {
        statement
            .query_map(params![subject_id, limit as i64, offset], |row| {
                row.get::<_, String>(0)
            })
            .map_err(|error| IrcoError::Query(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| IrcoError::Query(error.to_string()))?
    } else {
        statement
            .query_map(params![limit as i64, offset], |row| row.get::<_, String>(0))
            .map_err(|error| IrcoError::Query(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| IrcoError::Query(error.to_string()))?
    };
    payloads
        .into_iter()
        .map(|payload| {
            serde_json::from_str(&payload)
                .map_err(|error| IrcoError::Alert(format!("Stored alert is invalid: {error}")))
        })
        .collect()
}

pub fn transition_alert(
    connection: &Connection,
    alert_id: &str,
    next: AlertState,
    detail: &str,
) -> Result<Alert, IrcoError> {
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| IrcoError::Database(error.to_string()))?;
    let mut alert = get_alert(&transaction, alert_id)?;
    if !valid_transition(&alert.state, &next) {
        return Err(IrcoError::Alert(format!(
            "Invalid alert transition: {} -> {}",
            state_name(&alert.state),
            state_name(&next)
        )));
    }
    alert.state = next;
    alert.history.push(AlertEvent {
        timestamp: Utc::now(),
        action: state_name(&alert.state).to_owned(),
        detail: detail.to_owned(),
    });
    let payload =
        serde_json::to_string(&alert).map_err(|error| IrcoError::Alert(error.to_string()))?;
    transaction
        .execute(
            "UPDATE alerts SET state = ?2, payload_json = ?3 WHERE id = ?1",
            params![alert.id, state_name(&alert.state), payload],
        )
        .map_err(|error| IrcoError::Database(error.to_string()))?;
    transaction
        .commit()
        .map_err(|error| IrcoError::Database(error.to_string()))?;
    Ok(alert)
}

pub fn record_followup_measurement(
    connection: &Connection,
    alert_id: &str,
    observation: &Observation,
) -> Result<usize, IrcoError> {
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| IrcoError::Database(error.to_string()))?;
    let mut alert = get_alert(&transaction, alert_id)?;
    if alert.state == AlertState::Closed || alert.state == AlertState::Escalated {
        return Err(IrcoError::Alert(
            "closed or escalated alerts cannot accept follow-up measurements".to_owned(),
        ));
    }
    if observation.subject_id.as_deref() != Some(alert.subject_id.as_str())
        || observation.data_class != alert.data_quality
    {
        return Err(IrcoError::Alert(
            "follow-up measurement must match alert subject and data class".to_owned(),
        ));
    }

    transaction
        .execute(
            "INSERT OR IGNORE INTO followup_measurements
             (alert_id, observation_id, timestamp, value, indicator)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                alert_id,
                observation.id,
                observation.timestamp.to_rfc3339(),
                observation.value,
                observation.indicator
            ],
        )
        .map_err(|error| IrcoError::Database(error.to_string()))?;
    let count: usize = transaction
        .query_row(
            "SELECT COUNT(*) FROM followup_measurements WHERE alert_id = ?1",
            [alert_id],
            |row| row.get(0),
        )
        .map_err(|error| IrcoError::Database(error.to_string()))?;
    alert.history.push(AlertEvent {
        timestamp: Utc::now(),
        action: "followup_measurement".to_owned(),
        detail: format!(
            "Recorded {} measurement; follow-up count is {count}",
            observation.id
        ),
    });
    let payload =
        serde_json::to_string(&alert).map_err(|error| IrcoError::Alert(error.to_string()))?;
    transaction
        .execute(
            "UPDATE alerts SET payload_json = ?2 WHERE id = ?1",
            params![alert_id, payload],
        )
        .map_err(|error| IrcoError::Database(error.to_string()))?;
    transaction
        .commit()
        .map_err(|error| IrcoError::Database(error.to_string()))?;
    Ok(count)
}

fn valid_transition(from: &AlertState, to: &AlertState) -> bool {
    matches!(
        (from, to),
        (AlertState::Created, AlertState::Acknowledged)
            | (AlertState::Created, AlertState::InProgress)
            | (AlertState::Created, AlertState::Closed)
            | (AlertState::Acknowledged, AlertState::InProgress)
            | (AlertState::Acknowledged, AlertState::Reassessed)
            | (AlertState::Acknowledged, AlertState::Escalated)
            | (AlertState::Acknowledged, AlertState::Closed)
            | (AlertState::InProgress, AlertState::Reassessed)
            | (AlertState::InProgress, AlertState::Escalated)
            | (AlertState::InProgress, AlertState::Closed)
            | (AlertState::Reassessed, AlertState::InProgress)
            | (AlertState::Reassessed, AlertState::Escalated)
            | (AlertState::Reassessed, AlertState::Closed)
            | (AlertState::Escalated, AlertState::Closed)
    )
}

fn state_name(state: &AlertState) -> &'static str {
    match state {
        AlertState::Created => "created",
        AlertState::Acknowledged => "acknowledged",
        AlertState::InProgress => "in_progress",
        AlertState::Reassessed => "reassessed",
        AlertState::Closed => "closed",
        AlertState::Escalated => "escalated",
    }
}

#[cfg(test)]
mod tests {
    use super::{create_alert, get_alert, init_db, record_followup_measurement, transition_alert};
    use chrono::Utc;
    use irco_core::{Alert, AlertState, DataClass, Observation, VigilanceLevel};
    use rusqlite::Connection;
    use std::collections::HashMap;

    fn alert() -> Alert {
        Alert {
            id: "alert-0001".to_owned(),
            created_at: Utc::now(),
            subject_id: "A-01".to_owned(),
            vigilance: VigilanceLevel::Amber,
            state: AlertState::Created,
            rules_triggered: vec!["HR_THRESHOLD_001".to_owned()],
            data_quality: DataClass::Synthetic,
            justification: "Illustrative test rule".to_owned(),
            suggested_action: "Request reassessment".to_owned(),
            history: Vec::new(),
        }
    }

    fn measurement(sequence: u32) -> Observation {
        Observation {
            id: format!("a01-{sequence:06}"),
            timestamp: Utc::now(),
            subject_id: Some("A-01".to_owned()),
            indicator: "heart_rate".to_owned(),
            value: 80.0,
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
    fn lifecycle_and_three_followups_persist() {
        let connection = Connection::open_in_memory().unwrap();
        init_db(&connection).unwrap();
        create_alert(&connection, &alert()).unwrap();
        transition_alert(
            &connection,
            "alert-0001",
            AlertState::Acknowledged,
            "Crew acknowledged",
        )
        .unwrap();
        for sequence in 1..=3 {
            assert_eq!(
                record_followup_measurement(&connection, "alert-0001", &measurement(sequence))
                    .unwrap(),
                sequence as usize
            );
        }
        let result = transition_alert(
            &connection,
            "alert-0001",
            AlertState::Reassessed,
            "Trend reviewed",
        )
        .unwrap();
        assert_eq!(result.state, AlertState::Reassessed);
        assert_eq!(result.history.len(), 5);
        assert!(transition_alert(
            &connection,
            "alert-0001",
            AlertState::Created,
            "Cannot reopen as created"
        )
        .is_err());
        assert_eq!(
            get_alert(&connection, "alert-0001").unwrap().history.len(),
            5
        );
    }
}
