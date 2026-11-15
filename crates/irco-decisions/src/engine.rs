//! Rule engine orchestrator.
//!
//! Coordinates rule loading, evaluation, and result aggregation.

use irco_core::{DecisionRule, Observation};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SkippedRule {
    pub rule_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EvaluationResult {
    pub triggered: Vec<String>,
    pub skipped: Vec<SkippedRule>,
    pub evidence: Vec<RuleEvidence>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RuleEvidence {
    pub rule_id: String,
    pub detail: String,
}

/// Evaluate supported rules without turning missing inputs into healthy results.
pub fn evaluate(
    rules: &[DecisionRule],
    observation: &Observation,
) -> Result<EvaluationResult, irco_core::IrcoError> {
    let mut result = EvaluationResult::default();

    for rule in rules.iter().filter(|rule| {
        rule.enabled
            && rule.indicator == observation.indicator
            && !matches!(
                rule.condition.kind.as_str(),
                "trend_slope" | "persistent_deviation" | "missing_data" | "composite"
            )
    }) {
        if !rule.data_class_filter.is_empty()
            && !rule.data_class_filter.contains(&observation.data_class)
        {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "data_class_not_allowed".to_owned(),
            });
            continue;
        }

        if !observation
            .quality
            .as_ref()
            .is_some_and(|quality| quality.status == "valid")
        {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "observation_quality_not_valid".to_owned(),
            });
            continue;
        }

        if rule
            .context_required
            .iter()
            .any(|key| !observation.context.contains_key(key))
        {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "required_context_missing".to_owned(),
            });
            continue;
        }

        match rule.condition.kind.as_str() {
            "absolute_threshold" => {
                let min = number_param(rule, "min")?;
                let max = number_param(rule, "max")?;
                if min.zip(max).is_some_and(|(min, max)| min > max) {
                    return Err(irco_core::IrcoError::RuleEval(format!(
                        "Rule {} has min greater than max",
                        rule.rule_id
                    )));
                }

                if min.is_some_and(|threshold| observation.value < threshold)
                    || max.is_some_and(|threshold| observation.value > threshold)
                {
                    result.triggered.push(rule.rule_id.clone());
                    result.evidence.push(RuleEvidence {
                        rule_id: rule.rule_id.clone(),
                        detail: format!(
                            "value={} {}; min={:?}; max={:?}",
                            observation.value, observation.unit, min, max
                        ),
                    });
                }
            }
            "baseline_deviation" => {
                let Some(baseline) = observation
                    .context
                    .get("individual_baseline")
                    .and_then(serde_json::Value::as_f64)
                else {
                    result.skipped.push(SkippedRule {
                        rule_id: rule.rule_id.clone(),
                        reason: "numeric_individual_baseline_required".to_owned(),
                    });
                    continue;
                };
                if !baseline.is_finite() {
                    result.skipped.push(SkippedRule {
                        rule_id: rule.rule_id.clone(),
                        reason: "individual_baseline_not_finite".to_owned(),
                    });
                    continue;
                }
                let deviation_absolute = number_param(rule, "deviation_absolute")?;
                let deviation_percent = number_param(rule, "deviation_percent")?;
                if deviation_absolute.is_none() && deviation_percent.is_none() {
                    return Err(irco_core::IrcoError::RuleEval(format!(
                        "Rule {} requires deviation_absolute or deviation_percent",
                        rule.rule_id
                    )));
                }
                if deviation_absolute
                    .into_iter()
                    .chain(deviation_percent)
                    .any(|threshold| threshold < 0.0)
                {
                    return Err(irco_core::IrcoError::RuleEval(format!(
                        "Rule {} deviation thresholds must be non-negative",
                        rule.rule_id
                    )));
                }
                if deviation_percent.is_some() && baseline == 0.0 && deviation_absolute.is_none() {
                    result.skipped.push(SkippedRule {
                        rule_id: rule.rule_id.clone(),
                        reason: "percentage_deviation_requires_nonzero_baseline".to_owned(),
                    });
                    continue;
                }
                let absolute_delta = (observation.value - baseline).abs();
                let percent_delta =
                    (baseline != 0.0).then_some(absolute_delta / baseline.abs() * 100.0);
                let triggered = deviation_absolute
                    .is_some_and(|threshold| absolute_delta >= threshold)
                    || deviation_percent
                        .zip(percent_delta)
                        .is_some_and(|(threshold, percent)| percent >= threshold);
                if triggered {
                    result.triggered.push(rule.rule_id.clone());
                    result.evidence.push(RuleEvidence {
                        rule_id: rule.rule_id.clone(),
                        detail: format!(
                            "value={} {}; individual_baseline={baseline}; absolute_deviation={absolute_delta}; percent_deviation={percent_delta:?}",
                            observation.value, observation.unit
                        ),
                    });
                }
            }
            _ => {
                result.skipped.push(SkippedRule {
                    rule_id: rule.rule_id.clone(),
                    reason: format!("unsupported_condition:{}", rule.condition.kind),
                });
            }
        }
    }

    Ok(result)
}

/// Evaluate signed linear-slope rules using only valid samples in the current
/// subject, indicator, unit, data class, and configured time window.
pub fn evaluate_temporal_rules(
    rules: &[DecisionRule],
    observations: &[Observation],
    current: &Observation,
) -> Result<EvaluationResult, irco_core::IrcoError> {
    let mut result = EvaluationResult::default();
    for rule in rules.iter().filter(|rule| {
        rule.enabled && rule.indicator == current.indicator && rule.condition.kind == "trend_slope"
    }) {
        if !rule.data_class_filter.is_empty()
            && !rule.data_class_filter.contains(&current.data_class)
        {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "data_class_not_allowed".to_owned(),
            });
            continue;
        }

        if !current
            .quality
            .as_ref()
            .is_some_and(|quality| quality.status == "valid")
        {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "observation_quality_not_valid".to_owned(),
            });
            continue;
        }
        if rule
            .context_required
            .iter()
            .any(|key| !current.context.contains_key(key))
        {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "required_context_missing".to_owned(),
            });
            continue;
        }
        let Some(subject_id) = current.subject_id.as_deref() else {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "subject_id_required".to_owned(),
            });
            continue;
        };

        let window_days = integer_param(rule, "window_days")?;
        let min_samples = integer_param(rule, "min_samples")?;
        let minimum_samples = usize::try_from(min_samples).map_err(|_| {
            irco_core::IrcoError::RuleEval(format!(
                "Rule {} min_samples is too large",
                rule.rule_id
            ))
        })?;
        let slope_threshold = number_param(rule, "slope_threshold")?.ok_or_else(|| {
            irco_core::IrcoError::RuleEval(format!(
                "Rule {} requires slope_threshold",
                rule.rule_id
            ))
        })?;
        if window_days == 0 || min_samples < 2 || !slope_threshold.is_finite() {
            return Err(irco_core::IrcoError::RuleEval(format!(
                "Rule {} has invalid trend_slope parameters",
                rule.rule_id
            )));
        }
        let window_millis = window_days
            .checked_mul(86_400_000)
            .and_then(|millis| i64::try_from(millis).ok())
            .ok_or_else(|| {
                irco_core::IrcoError::RuleEval(format!(
                    "Rule {} window_days is too large",
                    rule.rule_id
                ))
            })?;
        let cutoff = current
            .timestamp
            .timestamp_millis()
            .saturating_sub(window_millis);
        let mut samples: Vec<&Observation> = observations
            .iter()
            .filter(|observation| {
                observation.subject_id.as_deref() == Some(subject_id)
                    && observation.indicator == current.indicator
                    && observation.unit == current.unit
                    && observation.data_class == current.data_class
                    && observation.timestamp <= current.timestamp
                    && observation.timestamp.timestamp_millis() >= cutoff
                    && observation
                        .quality
                        .as_ref()
                        .is_some_and(|quality| quality.status == "valid")
                    && observation.value.is_finite()
            })
            .collect();
        samples.sort_by_key(|sample| sample.timestamp);
        if samples.len() < minimum_samples {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "insufficient_valid_samples".to_owned(),
            });
            continue;
        }
        let Some(slope) = linear_slope_per_day(&samples) else {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "insufficient_time_span".to_owned(),
            });
            continue;
        };
        let triggered = if slope_threshold >= 0.0 {
            slope >= slope_threshold
        } else {
            slope <= slope_threshold
        };
        if triggered {
            result.triggered.push(rule.rule_id.clone());
            let comparison = if slope_threshold >= 0.0 { ">=" } else { "<=" };
            result.evidence.push(RuleEvidence {
                rule_id: rule.rule_id.clone(),
                detail: format!(
                    "slope={slope:.4} {}/day; samples={}; minimum={minimum_samples}; window={window_days} days; threshold {comparison} {slope_threshold}",
                    current.unit,
                    samples.len()
                ),
            });
        }
    }

    for rule in rules.iter().filter(|rule| {
        rule.enabled
            && rule.indicator == current.indicator
            && rule.condition.kind == "persistent_deviation"
    }) {
        if !rule.data_class_filter.is_empty()
            && !rule.data_class_filter.contains(&current.data_class)
        {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "data_class_not_allowed".to_owned(),
            });
            continue;
        }
        if !current
            .quality
            .as_ref()
            .is_some_and(|quality| quality.status == "valid")
        {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "observation_quality_not_valid".to_owned(),
            });
            continue;
        }
        if rule
            .context_required
            .iter()
            .any(|key| !current.context.contains_key(key))
        {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "required_context_missing".to_owned(),
            });
            continue;
        }
        let Some(subject_id) = current.subject_id.as_deref() else {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "subject_id_required".to_owned(),
            });
            continue;
        };
        let Some(baseline) = current
            .context
            .get("individual_baseline")
            .and_then(serde_json::Value::as_f64)
        else {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "numeric_individual_baseline_required".to_owned(),
            });
            continue;
        };
        if !baseline.is_finite() || baseline == 0.0 {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "nonzero_finite_individual_baseline_required".to_owned(),
            });
            continue;
        }

        let window_days = integer_param(rule, "window_days")?;
        let persistence_count = integer_param(rule, "persistence_count")?;
        let minimum_samples = usize::try_from(persistence_count).map_err(|_| {
            irco_core::IrcoError::RuleEval(format!(
                "Rule {} persistence_count is too large",
                rule.rule_id
            ))
        })?;
        let deviation_percent = number_param(rule, "deviation_percent")?.ok_or_else(|| {
            irco_core::IrcoError::RuleEval(format!(
                "Rule {} requires deviation_percent",
                rule.rule_id
            ))
        })?;
        let direction = rule
            .condition
            .params
            .get("deviation_direction")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| {
                irco_core::IrcoError::RuleEval(format!(
                    "Rule {} requires deviation_direction",
                    rule.rule_id
                ))
            })?;
        if window_days == 0
            || persistence_count < 2
            || !deviation_percent.is_finite()
            || deviation_percent < 0.0
            || !matches!(direction, "above" | "below" | "either")
        {
            return Err(irco_core::IrcoError::RuleEval(format!(
                "Rule {} has invalid persistent_deviation parameters",
                rule.rule_id
            )));
        }
        let window_millis = window_days
            .checked_mul(86_400_000)
            .and_then(|millis| i64::try_from(millis).ok())
            .ok_or_else(|| {
                irco_core::IrcoError::RuleEval(format!(
                    "Rule {} window_days is too large",
                    rule.rule_id
                ))
            })?;
        let cutoff = current
            .timestamp
            .timestamp_millis()
            .saturating_sub(window_millis);
        let mut samples: Vec<&Observation> = observations
            .iter()
            .filter(|observation| {
                observation.subject_id.as_deref() == Some(subject_id)
                    && observation.indicator == current.indicator
                    && observation.unit == current.unit
                    && observation.data_class == current.data_class
                    && observation.timestamp <= current.timestamp
                    && observation.timestamp.timestamp_millis() >= cutoff
            })
            .collect();
        samples.sort_by_key(|sample| sample.timestamp);
        let consecutive = samples
            .iter()
            .rev()
            .take_while(|sample| {
                if !sample
                    .quality
                    .as_ref()
                    .is_some_and(|quality| quality.status == "valid")
                    || !sample.value.is_finite()
                {
                    return false;
                }
                let deviation = (sample.value - baseline) / baseline.abs() * 100.0;
                match direction {
                    "above" => deviation >= deviation_percent,
                    "below" => deviation <= -deviation_percent,
                    "either" => deviation.abs() >= deviation_percent,
                    _ => false,
                }
            })
            .count();
        if consecutive < minimum_samples {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "insufficient_consecutive_deviations".to_owned(),
            });
            continue;
        }
        let current_deviation = (current.value - baseline) / baseline.abs() * 100.0;
        result.triggered.push(rule.rule_id.clone());
        result.evidence.push(RuleEvidence {
            rule_id: rule.rule_id.clone(),
            detail: format!(
                "consecutive_deviations={consecutive}; direction={direction}; current_deviation_percent={current_deviation:.2}; threshold_percent={deviation_percent}; baseline={baseline}; window={window_days} days"
            ),
        });
    }
    Ok(result)
}

/// Detect stale series against an explicit evaluation time. Missing series
/// remain insufficient evidence because no prior valid measurement exists.
pub fn evaluate_missing_data_rules(
    rules: &[DecisionRule],
    observations: &[Observation],
    subject_id: &str,
    data_class: &irco_core::DataClass,
    as_of: chrono::DateTime<chrono::Utc>,
) -> Result<EvaluationResult, irco_core::IrcoError> {
    let mut result = EvaluationResult::default();
    for rule in rules
        .iter()
        .filter(|rule| rule.enabled && rule.condition.kind == "missing_data")
    {
        if !rule.data_class_filter.is_empty() && !rule.data_class_filter.contains(data_class) {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "data_class_not_allowed".to_owned(),
            });
            continue;
        }

        let max_gap_hours = number_param(rule, "max_gap_hours")?.ok_or_else(|| {
            irco_core::IrcoError::RuleEval(format!("Rule {} requires max_gap_hours", rule.rule_id))
        })?;
        if max_gap_hours <= 0.0 || max_gap_hours * 3_600_000.0 > i64::MAX as f64 {
            return Err(irco_core::IrcoError::RuleEval(format!(
                "Rule {} has invalid max_gap_hours",
                rule.rule_id
            )));
        }

        let latest_valid = observations
            .iter()
            .filter(|observation| {
                observation.subject_id.as_deref() == Some(subject_id)
                    && observation.indicator == rule.indicator
                    && observation.data_class == *data_class
                    && observation.timestamp <= as_of
                    && observation.value.is_finite()
                    && observation
                        .quality
                        .as_ref()
                        .is_some_and(|quality| quality.status == "valid")
            })
            .max_by_key(|observation| observation.timestamp);
        let Some(latest_valid) = latest_valid else {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "no_prior_valid_observation".to_owned(),
            });
            continue;
        };

        let gap_hours = (as_of - latest_valid.timestamp).num_milliseconds() as f64 / 3_600_000.0;
        if gap_hours >= max_gap_hours {
            result.triggered.push(rule.rule_id.clone());
            result.evidence.push(RuleEvidence {
                rule_id: rule.rule_id.clone(),
                detail: format!(
                    "last_valid_measurement={}; gap_hours={gap_hours:.2}; max_gap_hours={max_gap_hours}",
                    latest_valid.timestamp.to_rfc3339()
                ),
            });
        }
    }
    Ok(result)
}

/// Combine already-evaluated rule IDs for the same subject and data class.
/// Composite rules never interpret measurements or create clinical thresholds.
pub fn evaluate_composite_rules(
    rules: &[DecisionRule],
    triggered_rule_ids: &[String],
    data_class: &irco_core::DataClass,
) -> Result<EvaluationResult, irco_core::IrcoError> {
    let mut result = EvaluationResult::default();
    for rule in rules
        .iter()
        .filter(|rule| rule.enabled && rule.condition.kind == "composite")
    {
        if !rule.data_class_filter.is_empty() && !rule.data_class_filter.contains(data_class) {
            result.skipped.push(SkippedRule {
                rule_id: rule.rule_id.clone(),
                reason: "data_class_not_allowed".to_owned(),
            });
            continue;
        }

        let sub_rules = rule
            .condition
            .params
            .get("sub_rules")
            .and_then(serde_json::Value::as_array)
            .ok_or_else(|| {
                irco_core::IrcoError::RuleEval(format!(
                    "Rule {} requires a sub_rules array",
                    rule.rule_id
                ))
            })?;
        let operator = rule
            .condition
            .params
            .get("composite_operator")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| {
                irco_core::IrcoError::RuleEval(format!(
                    "Rule {} requires a composite_operator",
                    rule.rule_id
                ))
            })?;
        let referenced: Vec<_> = sub_rules
            .iter()
            .map(|value| {
                value.as_str().ok_or_else(|| {
                    irco_core::IrcoError::RuleEval(format!(
                        "Rule {} sub_rules entries must be strings",
                        rule.rule_id
                    ))
                })
            })
            .collect::<Result<_, _>>()?;
        let all_triggered = !referenced.is_empty()
            && referenced
                .iter()
                .all(|id| triggered_rule_ids.iter().any(|triggered| triggered == id));
        let any_triggered = referenced
            .iter()
            .any(|id| triggered_rule_ids.iter().any(|triggered| triggered == id));
        let is_triggered = match operator {
            "and" => all_triggered,
            "or" => any_triggered,
            _ => {
                return Err(irco_core::IrcoError::RuleEval(format!(
                    "Rule {} has unsupported composite_operator {operator}",
                    rule.rule_id
                )))
            }
        };
        if is_triggered {
            result.triggered.push(rule.rule_id.clone());
            result.evidence.push(RuleEvidence {
                rule_id: rule.rule_id.clone(),
                detail: format!(
                    "composite_operator={operator}; sub_rules={}",
                    referenced.join(",")
                ),
            });
        }
    }
    Ok(result)
}

fn number_param(rule: &DecisionRule, name: &str) -> Result<Option<f64>, irco_core::IrcoError> {
    rule.condition
        .params
        .get(name)
        .map(|value| {
            let number = value.as_f64().ok_or_else(|| {
                irco_core::IrcoError::RuleEval(format!(
                    "Rule {} parameter {name} must be a number",
                    rule.rule_id
                ))
            })?;
            if !number.is_finite() {
                return Err(irco_core::IrcoError::RuleEval(format!(
                    "Rule {} parameter {name} must be finite",
                    rule.rule_id
                )));
            }
            Ok(number)
        })
        .transpose()
}

fn integer_param(rule: &DecisionRule, name: &str) -> Result<u64, irco_core::IrcoError> {
    rule.condition
        .params
        .get(name)
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| {
            irco_core::IrcoError::RuleEval(format!(
                "Rule {} parameter {name} must be a non-negative integer",
                rule.rule_id
            ))
        })
}

fn linear_slope_per_day(samples: &[&Observation]) -> Option<f64> {
    if samples.len() < 2 {
        return None;
    }
    let origin = samples[0].timestamp;
    let points: Vec<(f64, f64)> = samples
        .iter()
        .map(|sample| {
            (
                (sample.timestamp - origin).num_milliseconds() as f64 / 86_400_000.0,
                sample.value,
            )
        })
        .collect();
    let mean_x = points.iter().map(|(x, _)| x).sum::<f64>() / points.len() as f64;
    let mean_y = points.iter().map(|(_, y)| y).sum::<f64>() / points.len() as f64;
    let covariance = points
        .iter()
        .map(|(x, y)| (x - mean_x) * (y - mean_y))
        .sum::<f64>();
    let variance = points
        .iter()
        .map(|(x, _)| (x - mean_x).powi(2))
        .sum::<f64>();
    (variance > 0.0).then_some(covariance / variance)
}

#[cfg(test)]
mod tests {
    use super::{
        evaluate, evaluate_composite_rules, evaluate_missing_data_rules, evaluate_temporal_rules,
    };
    use irco_core::{
        DataClass, DecisionRule, Observation, ObservationQuality, RuleCondition, RuleStatus,
        VigilanceLevel,
    };
    use serde_json::{json, Value};
    use std::{collections::HashMap, fs};

    fn observation(value: f64, data_class: DataClass) -> Observation {
        Observation {
            id: "a01-000001".to_owned(),
            timestamp: "2026-01-01T06:00:00Z".parse().unwrap(),
            subject_id: Some("A-01".to_owned()),
            indicator: "heart_rate".to_owned(),
            value,
            unit: "bpm".to_owned(),
            source: "SYNTHETIC_A01".to_owned(),
            data_class,
            context: HashMap::from([("activity".to_owned(), json!("rest"))]),
            provenance: HashMap::new(),
            quality: Some(ObservationQuality {
                status: "valid".to_owned(),
                flags: Vec::new(),
                original_resolution: None,
                additional: HashMap::new(),
            }),
            metadata: HashMap::new(),
        }
    }

    fn rule() -> DecisionRule {
        DecisionRule {
            rule_id: "HR_THRESHOLD_001".to_owned(),
            indicator: "heart_rate".to_owned(),
            condition: RuleCondition {
                kind: "absolute_threshold".to_owned(),
                params: HashMap::from([
                    ("min".to_owned(), json!(40)),
                    ("max".to_owned(), json!(100)),
                ]),
            },
            context_required: vec!["activity".to_owned()],
            data_class_filter: vec![],
            vigilance_level: Some(VigilanceLevel::Amber),
            action: "request_reassessment".to_owned(),
            justification_template: None,
            scientific_reference: None,
            status: RuleStatus::Illustrative,
            enabled: true,
            priority: 50,
        }
    }

    fn trend_rule(threshold: f64) -> DecisionRule {
        let mut rule = rule();
        rule.condition.kind = "trend_slope".to_owned();
        rule.condition.params = HashMap::from([
            ("window_days".to_owned(), json!(7)),
            ("min_samples".to_owned(), json!(3)),
            ("slope_threshold".to_owned(), json!(threshold)),
        ]);
        rule.context_required.clear();
        rule
    }

    fn persistent_rule() -> DecisionRule {
        let mut rule = rule();
        rule.condition.kind = "persistent_deviation".to_owned();
        rule.condition.params = HashMap::from([
            ("window_days".to_owned(), json!(7)),
            ("persistence_count".to_owned(), json!(3)),
            ("deviation_percent".to_owned(), json!(20)),
            ("deviation_direction".to_owned(), json!("above")),
        ]);
        rule.context_required = vec!["individual_baseline".to_owned()];
        rule
    }

    fn missing_data_rule() -> DecisionRule {
        let mut rule = rule();
        rule.condition.kind = "missing_data".to_owned();
        rule.condition.params = HashMap::from([("max_gap_hours".to_owned(), json!(36))]);
        rule.context_required.clear();
        rule.data_class_filter = vec![DataClass::Synthetic];
        rule
    }

    fn baseline_rule(absolute: Option<f64>, percent: Option<f64>) -> DecisionRule {
        let mut rule = rule();
        rule.condition.kind = "baseline_deviation".to_owned();
        rule.condition.params.clear();
        if let Some(value) = absolute {
            rule.condition
                .params
                .insert("deviation_absolute".to_owned(), json!(value));
        }
        if let Some(value) = percent {
            rule.condition
                .params
                .insert("deviation_percent".to_owned(), json!(value));
        }
        rule.context_required = vec!["individual_baseline".to_owned()];
        rule
    }

    fn dated_observation(value: f64, day: u32, data_class: DataClass) -> Observation {
        let mut observation = observation(value, data_class);
        observation.timestamp = format!("2026-01-{day:02}T00:00:00Z").parse().unwrap();
        observation
    }

    #[test]
    fn absolute_threshold_is_deterministic_for_all_data_classes() {
        let rule = rule();
        let rules = [rule];

        assert_eq!(
            evaluate(&rules, &observation(99.0, DataClass::Synthetic))
                .unwrap()
                .triggered,
            Vec::<String>::new()
        );
        assert_eq!(
            evaluate(&rules, &observation(101.0, DataClass::Synthetic))
                .unwrap()
                .triggered,
            vec!["HR_THRESHOLD_001"]
        );
        assert_eq!(
            evaluate(&rules, &observation(101.0, DataClass::MeasuredReal))
                .unwrap()
                .triggered,
            vec!["HR_THRESHOLD_001"]
        );
    }

    #[test]
    fn unsupported_conditions_are_reported_instead_of_treated_as_healthy() {
        let mut rule = rule();
        rule.condition.kind = "rate_of_change".to_owned();

        let result = evaluate(&[rule], &observation(80.0, DataClass::Analog)).unwrap();
        assert!(result.triggered.is_empty());
        assert_eq!(
            result.skipped[0].reason,
            "unsupported_condition:rate_of_change"
        );
    }

    #[test]
    fn signed_trend_thresholds_trigger_on_the_configured_direction() {
        let mut rising = vec![
            dated_observation(60.0, 1, DataClass::Synthetic),
            dated_observation(62.0, 2, DataClass::Synthetic),
            dated_observation(64.0, 3, DataClass::Synthetic),
        ];
        rising.push(dated_observation(1000.0, 4, DataClass::Synthetic));
        let result = evaluate_temporal_rules(&[trend_rule(2.0)], &rising, &rising[2]).unwrap();
        assert_eq!(result.triggered, vec!["HR_THRESHOLD_001"]);
        assert!(result.evidence[0].detail.contains("slope=2.0000"));

        let falling = vec![
            dated_observation(64.0, 1, DataClass::Synthetic),
            dated_observation(62.0, 2, DataClass::Synthetic),
            dated_observation(60.0, 3, DataClass::Synthetic),
        ];
        let result = evaluate_temporal_rules(&[trend_rule(-2.0)], &falling, &falling[2]).unwrap();
        assert_eq!(result.triggered, vec!["HR_THRESHOLD_001"]);
    }

    #[test]
    fn baseline_deviation_uses_explicit_context_and_configured_limits() {
        let mut observation = observation(72.0, DataClass::Synthetic);
        observation
            .context
            .insert("individual_baseline".to_owned(), json!(60.0));

        let absolute = evaluate(&[baseline_rule(Some(10.0), None)], &observation).unwrap();
        assert_eq!(absolute.triggered, vec!["HR_THRESHOLD_001"]);
        assert!(absolute.evidence[0]
            .detail
            .contains("individual_baseline=60"));

        let percentage = evaluate(&[baseline_rule(None, Some(20.0))], &observation).unwrap();
        assert_eq!(percentage.triggered, vec!["HR_THRESHOLD_001"]);

        observation
            .context
            .insert("individual_baseline".to_owned(), json!(0.0));
        let result = evaluate(&[baseline_rule(None, Some(20.0))], &observation).unwrap();
        assert!(result.triggered.is_empty());
        assert_eq!(
            result.skipped[0].reason,
            "percentage_deviation_requires_nonzero_baseline"
        );
    }

    #[test]
    fn trend_rules_do_not_mix_data_classes_or_count_suspect_samples() {
        let history = vec![
            dated_observation(60.0, 1, DataClass::Analog),
            dated_observation(62.0, 2, DataClass::Analog),
            dated_observation(80.0, 1, DataClass::Synthetic),
        ];
        let result = evaluate_temporal_rules(&[trend_rule(1.0)], &history, &history[2]).unwrap();
        assert!(result.triggered.is_empty());
        assert_eq!(result.skipped[0].reason, "insufficient_valid_samples");

        let mut suspect = dated_observation(64.0, 3, DataClass::Synthetic);
        suspect.quality.as_mut().unwrap().status = "suspect".to_owned();
        let mut valid = history;
        valid.push(suspect.clone());
        let result = evaluate_temporal_rules(&[trend_rule(1.0)], &valid, &suspect).unwrap();
        assert!(result.triggered.is_empty());
        assert_eq!(result.skipped[0].reason, "observation_quality_not_valid");
    }

    #[test]
    fn persistent_deviation_requires_consecutive_valid_readings_in_one_series() {
        let mut history: Vec<_> = [73.0, 75.0, 78.0]
            .into_iter()
            .enumerate()
            .map(|(index, value)| {
                let mut sample = dated_observation(value, index as u32 + 1, DataClass::Synthetic);
                sample
                    .context
                    .insert("individual_baseline".to_owned(), json!(60.0));
                sample
            })
            .collect();
        let current = history.last().unwrap().clone();
        let result = evaluate_temporal_rules(&[persistent_rule()], &history, &current).unwrap();
        assert_eq!(result.triggered, vec!["HR_THRESHOLD_001"]);
        assert!(result.evidence[0]
            .detail
            .contains("consecutive_deviations=3"));

        history[1].value = 70.0;
        let current = history.last().unwrap().clone();
        let result = evaluate_temporal_rules(&[persistent_rule()], &history, &current).unwrap();
        assert!(result.triggered.is_empty());
        assert_eq!(
            result.skipped[0].reason,
            "insufficient_consecutive_deviations"
        );
    }

    #[test]
    fn persistent_deviation_never_counts_other_classes_or_suspect_rows() {
        let mut history: Vec<_> = [73.0, 75.0, 78.0]
            .into_iter()
            .enumerate()
            .map(|(index, value)| {
                let mut sample = dated_observation(value, index as u32 + 1, DataClass::Synthetic);
                sample
                    .context
                    .insert("individual_baseline".to_owned(), json!(60.0));
                sample
            })
            .collect();
        history[0].data_class = DataClass::Analog;
        history[1].quality.as_mut().unwrap().status = "suspect".to_owned();
        let current = history.last().unwrap().clone();
        let result = evaluate_temporal_rules(&[persistent_rule()], &history, &current).unwrap();
        assert!(result.triggered.is_empty());
        assert_eq!(
            result.skipped[0].reason,
            "insufficient_consecutive_deviations"
        );

        let mut history: Vec<_> = (1..=5)
            .map(|day| {
                let mut sample = dated_observation(75.0, day, DataClass::Synthetic);
                sample
                    .context
                    .insert("individual_baseline".to_owned(), json!(60.0));
                sample
            })
            .collect();
        history[3].quality.as_mut().unwrap().status = "suspect".to_owned();
        let current = history.last().unwrap().clone();
        let result = evaluate_temporal_rules(&[persistent_rule()], &history, &current).unwrap();
        assert!(result.triggered.is_empty());
        assert_eq!(
            result.skipped[0].reason,
            "insufficient_consecutive_deviations"
        );
    }

    #[test]
    fn missing_or_non_valid_quality_cannot_trigger_a_rule() {
        let mut suspect = observation(150.0, DataClass::Synthetic);
        suspect.quality.as_mut().unwrap().status = "suspect".to_owned();

        let result = evaluate(&[rule()], &suspect).unwrap();
        assert!(result.triggered.is_empty());
        assert_eq!(result.skipped[0].reason, "observation_quality_not_valid");

        suspect.quality = None;
        let result = evaluate(&[rule()], &suspect).unwrap();
        assert!(result.triggered.is_empty());
        assert_eq!(result.skipped[0].reason, "observation_quality_not_valid");
    }

    #[test]
    fn missing_data_triggers_at_the_configured_gap_from_last_valid_sample() {
        let history = [dated_observation(72.0, 1, DataClass::Synthetic)];
        let rule = missing_data_rule();

        let fresh = evaluate_missing_data_rules(
            std::slice::from_ref(&rule),
            &history,
            "A-01",
            &DataClass::Synthetic,
            "2026-01-02T11:59:00Z".parse().unwrap(),
        )
        .unwrap();
        assert!(fresh.triggered.is_empty());

        let stale = evaluate_missing_data_rules(
            &[rule],
            &history,
            "A-01",
            &DataClass::Synthetic,
            "2026-01-02T12:00:00Z".parse().unwrap(),
        )
        .unwrap();
        assert_eq!(stale.triggered, vec!["HR_THRESHOLD_001"]);
        assert!(stale.evidence[0].detail.contains("gap_hours=36.00"));
    }

    #[test]
    fn missing_data_rules_are_not_misreported_as_unsupported_point_rules() {
        let result = evaluate(
            &[missing_data_rule()],
            &observation(72.0, DataClass::Synthetic),
        )
        .unwrap();
        assert!(result.triggered.is_empty());
        assert!(result.skipped.is_empty());
    }

    #[test]
    fn composite_rules_are_not_misreported_as_unsupported_point_rules() {
        let mut composite = rule();
        composite.condition.kind = "composite".to_owned();
        composite.condition.params = HashMap::from([
            ("sub_rules".to_owned(), json!(["HR_THRESHOLD_001"])),
            ("composite_operator".to_owned(), json!("and")),
        ]);
        let result = evaluate(&[composite], &observation(72.0, DataClass::Synthetic)).unwrap();
        assert!(result.triggered.is_empty());
        assert!(result.skipped.is_empty());
    }

    #[test]
    fn missing_data_ignores_invalid_other_class_and_future_samples() {
        let mut analog = dated_observation(70.0, 3, DataClass::Analog);
        let valid = dated_observation(69.0, 1, DataClass::Synthetic);
        let mut suspect = dated_observation(71.0, 2, DataClass::Synthetic);
        suspect.quality.as_mut().unwrap().status = "suspect".to_owned();
        let future = dated_observation(72.0, 4, DataClass::Synthetic);
        let result = evaluate_missing_data_rules(
            &[missing_data_rule()],
            &[valid, analog.clone(), suspect, future],
            "A-01",
            &DataClass::Synthetic,
            "2026-01-03T00:00:00Z".parse().unwrap(),
        )
        .unwrap();
        assert_eq!(result.triggered, vec!["HR_THRESHOLD_001"]);

        analog.timestamp = "2026-01-01T00:00:00Z".parse().unwrap();
        let result = evaluate_missing_data_rules(
            &[missing_data_rule()],
            &[analog],
            "A-01",
            &DataClass::Synthetic,
            "2026-01-03T00:00:00Z".parse().unwrap(),
        )
        .unwrap();
        assert!(result.triggered.is_empty());
        assert_eq!(result.skipped[0].reason, "no_prior_valid_observation");

        let result = evaluate_missing_data_rules(
            &[missing_data_rule()],
            &[],
            "A-01",
            &DataClass::Analog,
            "2026-01-03T00:00:00Z".parse().unwrap(),
        )
        .unwrap();
        assert_eq!(result.skipped[0].reason, "data_class_not_allowed");
    }

    #[test]
    fn missing_data_without_a_prior_valid_sample_is_insufficient_evidence() {
        let mut invalid = dated_observation(72.0, 1, DataClass::Synthetic);
        invalid.quality.as_mut().unwrap().status = "suspect".to_owned();
        let result = evaluate_missing_data_rules(
            &[missing_data_rule()],
            &[invalid],
            "A-01",
            &DataClass::Synthetic,
            "2026-01-03T00:00:00Z".parse().unwrap(),
        )
        .unwrap();
        assert!(result.triggered.is_empty());
        assert_eq!(result.skipped[0].reason, "no_prior_valid_observation");
    }

    #[test]
    fn composite_rules_combine_only_configured_rule_ids() {
        let first = rule();
        let mut second = rule();
        second.rule_id = "HR_THRESHOLD_002".to_owned();
        let mut composite = rule();
        composite.rule_id = "HR_COMPOSITE_001".to_owned();
        composite.condition.kind = "composite".to_owned();
        composite.condition.params = HashMap::from([
            (
                "sub_rules".to_owned(),
                json!(["HR_THRESHOLD_001", "HR_THRESHOLD_002"]),
            ),
            ("composite_operator".to_owned(), json!("and")),
        ]);
        composite.data_class_filter = vec![DataClass::Synthetic];
        let rules = [first, second, composite];

        let partial = evaluate_composite_rules(
            &rules,
            &["HR_THRESHOLD_001".to_owned()],
            &DataClass::Synthetic,
        )
        .unwrap();
        assert!(partial.triggered.is_empty());

        let complete = evaluate_composite_rules(
            &rules,
            &["HR_THRESHOLD_001".to_owned(), "HR_THRESHOLD_002".to_owned()],
            &DataClass::Synthetic,
        )
        .unwrap();
        assert_eq!(complete.triggered, vec!["HR_COMPOSITE_001"]);
        assert!(complete.evidence[0]
            .detail
            .contains("composite_operator=and"));

        let wrong_class = evaluate_composite_rules(
            &rules,
            &["HR_THRESHOLD_001".to_owned(), "HR_THRESHOLD_002".to_owned()],
            &DataClass::Analog,
        )
        .unwrap();
        assert!(wrong_class.triggered.is_empty());
        assert_eq!(wrong_class.skipped[0].reason, "data_class_not_allowed");
    }

    #[test]
    fn loaded_demo_rules_have_explicit_validation_status() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let rules: Value = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
        let configured_rules = rules["rules"].as_array().unwrap();
        assert!(configured_rules
            .iter()
            .all(|rule| rule["status"].is_string()));
        assert!(configured_rules
            .iter()
            .filter(|rule| rule["enabled"] == true)
            .all(|rule| rule["status"] == "illustrative"
                && rule["data_class_filter"] == json!(["synthetic"])));
        let missing_data = configured_rules
            .iter()
            .find(|rule| rule["condition"]["type"] == "missing_data")
            .unwrap();
        assert_eq!(missing_data["enabled"], true);
        assert_eq!(missing_data["data_class_filter"], json!(["synthetic"]));
        assert!(configured_rules
            .iter()
            .filter(|rule| rule["condition"]["type"] == "composite")
            .all(|rule| rule["enabled"] == false));
    }
}
