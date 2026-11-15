//! JSON, JSONL, and CSV export for persisted observations.

use irco_core::{IrcoError, Observation};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportFormat {
    Json,
    Csv,
    JsonLines,
}

impl ExportFormat {
    pub fn parse(format: &str) -> Result<Self, IrcoError> {
        match format {
            "json" => Ok(Self::Json),
            "csv" => Ok(Self::Csv),
            "jsonl" => Ok(Self::JsonLines),
            _ => Err(IrcoError::Query(
                "format must be json, jsonl, or csv".to_owned(),
            )),
        }
    }
}

pub fn export_observations(
    observations: &[Observation],
    format: ExportFormat,
) -> Result<String, IrcoError> {
    match format {
        ExportFormat::Json => serde_json::to_string_pretty(observations)
            .map_err(|error| IrcoError::Internal(error.to_string())),
        ExportFormat::JsonLines => observations
            .iter()
            .map(|observation| {
                serde_json::to_string(observation)
                    .map_err(|error| IrcoError::Internal(error.to_string()))
            })
            .collect::<Result<Vec<_>, _>>()
            .map(|lines| {
                let mut output = lines.join("\n");
                if !lines.is_empty() {
                    output.push('\n');
                }
                output
            }),
        ExportFormat::Csv => export_csv(observations),
    }
}

fn export_csv(observations: &[Observation]) -> Result<String, IrcoError> {
    let mut output = String::from(
        "id,timestamp,subject_id,indicator,value,unit,source,data_class,context,provenance,quality,metadata\n",
    );
    for observation in observations {
        let fields = [
            csv_text(&observation.id),
            csv_text(&observation.timestamp.to_rfc3339()),
            csv_text(observation.subject_id.as_deref().unwrap_or("")),
            csv_text(&observation.indicator),
            observation.value.to_string(),
            csv_text(&observation.unit),
            csv_text(&observation.source),
            csv_text(observation.data_class.as_str()),
            csv_json(&observation.context)?,
            csv_json(&observation.provenance)?,
            csv_json(&observation.quality)?,
            csv_json(&observation.metadata)?,
        ];
        output.push_str(&fields.join(","));
        output.push('\n');
    }
    Ok(output)
}

fn csv_json<T: serde::Serialize>(value: &T) -> Result<String, IrcoError> {
    let value =
        serde_json::to_value(value).map_err(|error| IrcoError::Internal(error.to_string()))?;
    let value = if value.is_null() {
        String::new()
    } else {
        serde_json::to_string(&value).map_err(|error| IrcoError::Internal(error.to_string()))?
    };
    Ok(csv_text(&value))
}

fn csv_text(value: &str) -> String {
    let trimmed = value.trim_start();
    let safe = if ['=', '+', '-', '@']
        .iter()
        .any(|prefix| trimmed.starts_with(*prefix))
    {
        format!("'{value}")
    } else {
        value.to_owned()
    };
    format!("\"{}\"", safe.replace('"', "\"\""))
}

#[cfg(test)]
mod tests {
    use super::{export_observations, ExportFormat};
    use irco_core::{DataClass, Observation};
    use std::collections::HashMap;

    fn observation() -> Observation {
        Observation {
            id: "test-0001".to_owned(),
            timestamp: "2026-01-01T00:00:00Z".parse().unwrap(),
            subject_id: Some("subject-1".to_owned()),
            indicator: "heart_rate".to_owned(),
            value: 72.0,
            unit: "bpm".to_owned(),
            source: "TEST_SOURCE".to_owned(),
            data_class: DataClass::Synthetic,
            context: HashMap::new(),
            provenance: HashMap::new(),
            quality: None,
            metadata: HashMap::new(),
        }
    }

    #[test]
    fn jsonl_export_round_trips_observations() {
        let output = export_observations(&[observation()], ExportFormat::JsonLines).unwrap();
        let parsed: Observation = serde_json::from_str(output.trim()).unwrap();
        assert_eq!(parsed.id, "test-0001");
    }

    #[test]
    fn csv_escapes_cells_and_prevents_formula_execution() {
        let mut row = observation();
        row.source = "=IMPORTXML()".to_owned();
        let output = export_observations(&[row], ExportFormat::Csv).unwrap();
        assert!(output.contains("\"'=IMPORTXML()\""));
        assert!(output.ends_with('\n'));
    }
}
