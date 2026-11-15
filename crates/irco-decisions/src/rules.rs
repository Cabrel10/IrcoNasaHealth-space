//! Rule loading and validation.

use irco_core::{RuleCondition, RulesDocument};
use std::collections::HashSet;

/// Load rules from a JSON file.
pub fn load_rules(path: &str) -> Result<RulesDocument, irco_core::IrcoError> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| irco_core::IrcoError::RuleEval(format!("Failed to read {path}: {e}")))?;
    let document: RulesDocument = serde_json::from_str(&content)
        .map_err(|e| irco_core::IrcoError::RuleEval(format!("Failed to parse rules: {e}")))?;
    validate_rules(&document)?;
    Ok(document)
}

pub fn validate_rules(document: &RulesDocument) -> Result<(), irco_core::IrcoError> {
    if document.version != "0.1.0" {
        return Err(irco_core::IrcoError::RuleEval(format!(
            "Unsupported rules version {}",
            document.version
        )));
    }

    let mut rule_ids = HashSet::new();
    for rule in &document.rules {
        if !rule_ids.insert(&rule.rule_id) {
            return Err(irco_core::IrcoError::RuleEval(format!(
                "Duplicate rule ID {}",
                rule.rule_id
            )));
        }
        if rule.priority > 100 {
            return Err(irco_core::IrcoError::RuleEval(format!(
                "Rule {} priority must be between 0 and 100",
                rule.rule_id
            )));
        }
        if !matches!(
            rule.action.as_str(),
            "log_only"
                | "notify_crew"
                | "request_reassessment"
                | "request_new_measurement"
                | "escalate_medical"
                | "auto_followup"
        ) {
            return Err(irco_core::IrcoError::RuleEval(format!(
                "Rule {} has unsupported action {}",
                rule.rule_id, rule.action
            )));
        }
        if !matches!(
            rule.condition.kind.as_str(),
            "absolute_threshold"
                | "baseline_deviation"
                | "trend_slope"
                | "persistent_deviation"
                | "rate_of_change"
                | "missing_data"
                | "composite"
        ) {
            return Err(irco_core::IrcoError::RuleEval(format!(
                "Rule {} has unknown condition {}",
                rule.rule_id, rule.condition.kind
            )));
        }
        match rule.condition.kind.as_str() {
            "absolute_threshold" => validate_absolute(&rule.condition, &rule.rule_id)?,
            "baseline_deviation" => validate_baseline(&rule.condition, &rule.rule_id)?,
            "trend_slope" => validate_trend(&rule.condition, &rule.rule_id)?,
            "persistent_deviation" => {
                validate_persistent_deviation(&rule.condition, &rule.rule_id)?
            }
            "missing_data" => validate_missing_data(&rule.condition, &rule.rule_id)?,
            _ => {}
        }
    }
    validate_composite_rules(document)?;
    Ok(())
}

fn validate_composite_rules(document: &RulesDocument) -> Result<(), irco_core::IrcoError> {
    for rule in document
        .rules
        .iter()
        .filter(|rule| rule.condition.kind == "composite")
    {
        let sub_rules = rule
            .condition
            .params
            .get("sub_rules")
            .and_then(serde_json::Value::as_array)
            .filter(|sub_rules| !sub_rules.is_empty())
            .ok_or_else(|| {
                irco_core::IrcoError::RuleEval(format!(
                    "Rule {} requires a non-empty sub_rules array",
                    rule.rule_id
                ))
            })?;
        rule.condition
            .params
            .get("composite_operator")
            .and_then(serde_json::Value::as_str)
            .filter(|operator| matches!(*operator, "and" | "or"))
            .ok_or_else(|| {
                irco_core::IrcoError::RuleEval(format!(
                    "Rule {} requires composite_operator 'and' or 'or'",
                    rule.rule_id
                ))
            })?;
        let mut unique_sub_rules = HashSet::new();
        for sub_rule_id in sub_rules {
            let sub_rule_id = sub_rule_id.as_str().ok_or_else(|| {
                irco_core::IrcoError::RuleEval(format!(
                    "Rule {} sub_rules entries must be strings",
                    rule.rule_id
                ))
            })?;
            if !unique_sub_rules.insert(sub_rule_id) {
                return Err(irco_core::IrcoError::RuleEval(format!(
                    "Rule {} contains duplicate sub-rule {sub_rule_id}",
                    rule.rule_id
                )));
            }
            let referenced = document
                .rules
                .iter()
                .find(|candidate| candidate.rule_id == sub_rule_id)
                .ok_or_else(|| {
                    irco_core::IrcoError::RuleEval(format!(
                        "Rule {} references unknown sub-rule {sub_rule_id}",
                        rule.rule_id
                    ))
                })?;
            if referenced.condition.kind == "composite" {
                return Err(irco_core::IrcoError::RuleEval(format!(
                    "Rule {} cannot reference composite rule {sub_rule_id}",
                    rule.rule_id
                )));
            }
        }
    }
    Ok(())
}

fn validate_absolute(condition: &RuleCondition, rule_id: &str) -> Result<(), irco_core::IrcoError> {
    let min = number_param(condition, rule_id, "min")?;
    let max = number_param(condition, rule_id, "max")?;
    if min.is_none() && max.is_none() {
        return Err(irco_core::IrcoError::RuleEval(format!(
            "Rule {rule_id} requires min or max"
        )));
    }
    if min.zip(max).is_some_and(|(min, max)| min > max) {
        return Err(irco_core::IrcoError::RuleEval(format!(
            "Rule {rule_id} has min greater than max"
        )));
    }
    Ok(())
}

fn validate_trend(condition: &RuleCondition, rule_id: &str) -> Result<(), irco_core::IrcoError> {
    let window_days = integer_param(condition, rule_id, "window_days")?;
    let min_samples = integer_param(condition, rule_id, "min_samples")?;
    let slope_threshold = number_param(condition, rule_id, "slope_threshold")?;
    let window_fits = window_days
        .checked_mul(86_400_000)
        .and_then(|millis| i64::try_from(millis).ok())
        .is_some();
    let sample_count_fits = usize::try_from(min_samples).is_ok();
    if window_days == 0
        || !window_fits
        || min_samples < 2
        || !sample_count_fits
        || slope_threshold.is_none()
    {
        return Err(irco_core::IrcoError::RuleEval(format!(
            "Rule {rule_id} requires a representable window_days >= 1, min_samples >= 2, and slope_threshold"
        )));
    }
    Ok(())
}

fn validate_baseline(condition: &RuleCondition, rule_id: &str) -> Result<(), irco_core::IrcoError> {
    let absolute = number_param(condition, rule_id, "deviation_absolute")?;
    let percent = number_param(condition, rule_id, "deviation_percent")?;
    if absolute.is_none() && percent.is_none() {
        return Err(irco_core::IrcoError::RuleEval(format!(
            "Rule {rule_id} requires deviation_absolute or deviation_percent"
        )));
    }
    if absolute
        .into_iter()
        .chain(percent)
        .any(|threshold| threshold < 0.0)
    {
        return Err(irco_core::IrcoError::RuleEval(format!(
            "Rule {rule_id} deviation thresholds must be non-negative"
        )));
    }
    Ok(())
}

fn validate_persistent_deviation(
    condition: &RuleCondition,
    rule_id: &str,
) -> Result<(), irco_core::IrcoError> {
    let window_days = integer_param(condition, rule_id, "window_days")?;
    let persistence_count = integer_param(condition, rule_id, "persistence_count")?;
    let deviation_percent = number_param(condition, rule_id, "deviation_percent")?;
    let direction = condition
        .params
        .get("deviation_direction")
        .and_then(serde_json::Value::as_str);
    let window_fits = window_days
        .checked_mul(86_400_000)
        .and_then(|millis| i64::try_from(millis).ok())
        .is_some();
    if window_days == 0
        || !window_fits
        || persistence_count < 2
        || usize::try_from(persistence_count).is_err()
        || deviation_percent.is_none_or(|value| value < 0.0)
        || !matches!(direction, Some("above" | "below" | "either"))
    {
        return Err(irco_core::IrcoError::RuleEval(format!(
            "Rule {rule_id} requires a representable window_days >= 1, persistence_count >= 2, non-negative deviation_percent, and deviation_direction"
        )));
    }
    Ok(())
}

fn validate_missing_data(
    condition: &RuleCondition,
    rule_id: &str,
) -> Result<(), irco_core::IrcoError> {
    let max_gap_hours = number_param(condition, rule_id, "max_gap_hours")?;
    if max_gap_hours.is_none_or(|hours| hours <= 0.0 || hours * 3_600_000.0 > i64::MAX as f64) {
        return Err(irco_core::IrcoError::RuleEval(format!(
            "Rule {rule_id} requires a representable max_gap_hours greater than zero"
        )));
    }
    Ok(())
}

fn number_param(
    condition: &RuleCondition,
    rule_id: &str,
    name: &str,
) -> Result<Option<f64>, irco_core::IrcoError> {
    condition
        .params
        .get(name)
        .map(|value| {
            let number = value.as_f64().ok_or_else(|| {
                irco_core::IrcoError::RuleEval(format!(
                    "Rule {rule_id} parameter {name} must be a number"
                ))
            })?;
            if !number.is_finite() {
                return Err(irco_core::IrcoError::RuleEval(format!(
                    "Rule {rule_id} parameter {name} must be finite"
                )));
            }
            Ok(number)
        })
        .transpose()
}

fn integer_param(
    condition: &RuleCondition,
    rule_id: &str,
    name: &str,
) -> Result<u64, irco_core::IrcoError> {
    condition
        .params
        .get(name)
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| {
            irco_core::IrcoError::RuleEval(format!(
                "Rule {rule_id} parameter {name} must be a non-negative integer"
            ))
        })
}

#[cfg(test)]
mod tests {
    use super::{load_rules, validate_rules};

    #[test]
    fn loads_the_versioned_rules_document() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let rules = load_rules(path).expect("rules.json should match the Rust contract");
        assert_eq!(rules.version, "0.1.0");
        assert!(!rules.rules.is_empty());
        assert!(rules.rules.iter().all(|rule| !rule.rule_id.is_empty()));
    }

    #[test]
    fn rejects_invalid_trend_configuration_before_runtime() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let mut rules = load_rules(path).unwrap();
        let trend = rules
            .rules
            .iter_mut()
            .find(|rule| rule.condition.kind == "trend_slope")
            .unwrap();
        trend
            .condition
            .params
            .insert("min_samples".to_owned(), serde_json::json!(1));
        assert!(validate_rules(&rules).is_err());
    }

    #[test]
    fn rejects_duplicate_rule_ids() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let mut rules = load_rules(path).unwrap();
        rules.rules.push(rules.rules[0].clone());
        assert!(validate_rules(&rules).is_err());
    }

    #[test]
    fn rejects_baseline_deviation_without_a_threshold() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let mut rules = load_rules(path).unwrap();
        rules.rules[0].condition.kind = "baseline_deviation".to_owned();
        rules.rules[0].condition.params.clear();
        assert!(validate_rules(&rules).is_err());
    }

    #[test]
    fn rejects_persistent_deviation_without_valid_temporal_parameters() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let mut rules = load_rules(path).unwrap();
        let persistent = rules
            .rules
            .iter_mut()
            .find(|rule| rule.condition.kind == "persistent_deviation")
            .unwrap();
        persistent.condition.params.insert(
            "deviation_direction".to_owned(),
            serde_json::json!("sideways"),
        );
        assert!(validate_rules(&rules).is_err());
    }

    #[test]
    fn rejects_missing_data_rules_with_non_positive_gap() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let mut rules = load_rules(path).unwrap();
        let missing_data = rules
            .rules
            .iter_mut()
            .find(|rule| rule.condition.kind == "missing_data")
            .unwrap();
        missing_data
            .condition
            .params
            .insert("max_gap_hours".to_owned(), serde_json::json!(0));
        assert!(validate_rules(&rules).is_err());
    }

    #[test]
    fn rejects_composites_with_unknown_references() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let mut rules = load_rules(path).unwrap();
        let composite = rules
            .rules
            .iter_mut()
            .find(|rule| rule.condition.kind == "composite")
            .unwrap();
        composite
            .condition
            .params
            .insert("sub_rules".to_owned(), serde_json::json!(["UNKNOWN_RULE"]));
        assert!(validate_rules(&rules).is_err());
    }
}
