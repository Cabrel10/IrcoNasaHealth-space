use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// The three mandatory data classes — never mixed
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DataClass {
    MeasuredReal,
    Analog,
    Synthetic,
}

impl DataClass {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::MeasuredReal => "measured_real",
            Self::Analog => "analog",
            Self::Synthetic => "synthetic",
        }
    }
}

/// Vigilance level
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VigilanceLevel {
    Green,
    Amber,
    Red,
    NoData,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RuleStatus {
    Validated,
    Provisional,
    Illustrative,
}

/// Alert lifecycle state
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AlertState {
    Created,
    Acknowledged,
    InProgress,
    Reassessed,
    Closed,
    Escalated,
}

/// Core observation — the pivot format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Observation {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject_id: Option<String>,
    pub indicator: String,
    pub value: f64,
    pub unit: String,
    pub source: String,
    pub data_class: DataClass,
    #[serde(default)]
    pub context: HashMap<String, Value>,
    #[serde(default)]
    pub provenance: HashMap<String, Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quality: Option<ObservationQuality>,
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservationQuality {
    pub status: String,
    #[serde(default)]
    pub flags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_resolution: Option<String>,
    #[serde(flatten)]
    pub additional: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RulesDocument {
    pub version: String,
    pub rules: Vec<DecisionRule>,
}

/// Health indicator definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndicatorDef {
    pub id: String,
    pub name: String,
    pub family: String,
    pub unit: String,
    pub collection_method: String,
    pub expected_frequency: String,
    pub sources: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_range: Option<ReferenceRange>,
    pub scientific_refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferenceRange {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub source: String,
    pub status: String, // "validated" | "provisional" | "illustrative"
}

/// Decision rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionRule {
    pub rule_id: String,
    pub indicator: String,
    pub condition: RuleCondition,
    #[serde(default)]
    pub context_required: Vec<String>,
    #[serde(default)]
    pub data_class_filter: Vec<DataClass>,
    #[serde(default)]
    pub vigilance_level: Option<VigilanceLevel>,
    pub action: String,
    #[serde(default)]
    pub justification_template: Option<String>,
    #[serde(default)]
    pub scientific_reference: Option<String>,
    pub status: RuleStatus,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default = "default_priority")]
    pub priority: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleCondition {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub params: HashMap<String, Value>,
}

fn default_enabled() -> bool {
    true
}

fn default_priority() -> u8 {
    50
}

#[cfg(test)]
mod tests {
    use super::{DataClass, Observation, RulesDocument};
    use std::fs;

    #[test]
    fn pivot_fixture_deserializes_with_numeric_context() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../tests/fixtures/sample_observations.jsonl"
        );
        let contents = fs::read_to_string(path).expect("fixture should be readable");
        let observations: Vec<Observation> = contents
            .lines()
            .map(|line| serde_json::from_str(line).expect("fixture row should deserialize"))
            .collect();
        let a01_last_day = observations
            .iter()
            .find(|observation| observation.id == "a01-000370")
            .expect("A-01 final day observation should exist");

        assert_eq!(a01_last_day.data_class, DataClass::Synthetic);
        assert_eq!(a01_last_day.context["mission_day"], 124);
        assert_eq!(
            a01_last_day
                .quality
                .as_ref()
                .expect("quality is present")
                .status,
            "valid"
        );
    }

    #[test]
    fn rules_json_deserializes_to_the_versioned_contract() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let contents = fs::read_to_string(path).expect("rules should be readable");
        let rules: RulesDocument =
            serde_json::from_str(&contents).expect("rules should match Rust types");

        assert_eq!(rules.version, "0.1.0");
        assert!(!rules.rules.is_empty());
        assert!(rules
            .rules
            .iter()
            .all(|rule| rule.status == super::RuleStatus::Illustrative
                || rule.status == super::RuleStatus::Provisional
                || rule.status == super::RuleStatus::Validated));
    }
}

/// Alert
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub subject_id: String,
    pub vigilance: VigilanceLevel,
    pub state: AlertState,
    pub rules_triggered: Vec<String>,
    pub data_quality: DataClass,
    pub justification: String,
    pub suggested_action: String,
    #[serde(default)]
    pub history: Vec<AlertEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertEvent {
    pub timestamp: DateTime<Utc>,
    pub action: String,
    pub detail: String,
}
