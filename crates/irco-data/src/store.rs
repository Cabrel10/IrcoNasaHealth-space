//! SQLite-backed observation store.

use rusqlite::Connection;

/// Initialize the database schema.
pub fn init_db(conn: &Connection) -> Result<(), irco_core::IrcoError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS observations (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            subject_id TEXT,
            indicator TEXT NOT NULL,
            value REAL NOT NULL,
            unit TEXT NOT NULL,
            source TEXT NOT NULL,
            data_class TEXT NOT NULL,
            context TEXT DEFAULT '{}',
            provenance TEXT DEFAULT '{}',
            metadata TEXT DEFAULT '{}',
            quality TEXT NOT NULL DEFAULT 'null',
            payload_json TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_obs_indicator ON observations(indicator);
        CREATE INDEX IF NOT EXISTS idx_obs_timestamp ON observations(timestamp);
        CREATE INDEX IF NOT EXISTS idx_obs_subject ON observations(subject_id);
        CREATE INDEX IF NOT EXISTS idx_obs_class ON observations(data_class);
        CREATE TABLE IF NOT EXISTS routine_completions (
            subject_id TEXT NOT NULL,
            task_id TEXT NOT NULL,
            completion_date TEXT NOT NULL,
            completed_at TEXT NOT NULL,
            PRIMARY KEY (subject_id, task_id, completion_date)
        );
        ",
    )
    .map_err(|e| irco_core::IrcoError::Database(e.to_string()))?;

    if !has_column(conn, "quality")? {
        conn.execute(
            "ALTER TABLE observations ADD COLUMN quality TEXT NOT NULL DEFAULT 'null'",
            [],
        )
        .map_err(|error| irco_core::IrcoError::Database(error.to_string()))?;
    }
    if !has_column(conn, "payload_json")? {
        conn.execute(
            "ALTER TABLE observations ADD COLUMN payload_json TEXT NOT NULL DEFAULT ''",
            [],
        )
        .map_err(|error| irco_core::IrcoError::Database(error.to_string()))?;
    }
    conn.execute(
        "UPDATE observations
         SET payload_json = json_object(
             'id', id,
             'timestamp', timestamp,
             'subject_id', subject_id,
             'indicator', indicator,
             'value', value,
             'unit', unit,
             'source', source,
             'data_class', data_class,
             'context', json(context),
             'provenance', json(provenance),
             'quality', json(quality),
             'metadata', json(metadata)
         )
         WHERE payload_json = ''",
        [],
    )
    .map_err(|error| irco_core::IrcoError::Database(error.to_string()))?;
    Ok(())
}

fn has_column(conn: &Connection, target: &str) -> Result<bool, irco_core::IrcoError> {
    let mut statement = conn
        .prepare("PRAGMA table_info(observations)")
        .map_err(|error| irco_core::IrcoError::Database(error.to_string()))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| irco_core::IrcoError::Database(error.to_string()))?;
    for column in columns {
        if column.map_err(|error| irco_core::IrcoError::Database(error.to_string()))? == target {
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::init_db;
    use rusqlite::Connection;

    #[test]
    fn migrates_the_original_observations_table() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE observations (
                    id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, subject_id TEXT,
                    indicator TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL,
                    source TEXT NOT NULL, data_class TEXT NOT NULL,
                    context TEXT DEFAULT '{}', provenance TEXT DEFAULT '{}',
                    metadata TEXT DEFAULT '{}'
                 );
                 INSERT INTO observations (
                    id, timestamp, indicator, value, unit, source, data_class
                 ) VALUES (
                    'old-000001', '2026-01-01T00:00:00+00:00', 'heart_rate',
                    70, 'bpm', 'TEST', 'synthetic'
                 );",
            )
            .unwrap();

        init_db(&connection).unwrap();
        let payload: String = connection
            .query_row(
                "SELECT payload_json FROM observations WHERE id = 'old-000001'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let observation: serde_json::Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(observation["quality"], serde_json::Value::Null);
        assert_eq!(observation["data_class"], "synthetic");
    }
}
