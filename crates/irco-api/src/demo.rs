use chrono::{DateTime, Duration, TimeZone, Utc};
use irco_core::{DataClass, DecisionRule, Observation, ObservationQuality, VigilanceLevel};
use irco_decisions::{
    engine::{
        evaluate, evaluate_composite_rules, evaluate_missing_data_rules, evaluate_temporal_rules,
    },
    vigilance::compute_vigilance,
};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

pub const SCENARIO_DAYS: u32 = 124;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DemoScenario {
    A01,
    Nominal,
    Dropout,
}

impl DemoScenario {
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "a01" => Some(Self::A01),
            "nominal" => Some(Self::Nominal),
            "dropout" => Some(Self::Dropout),
            _ => None,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::A01 => "a01",
            Self::Nominal => "nominal",
            Self::Dropout => "dropout",
        }
    }
}

#[derive(Debug, Serialize)]
pub struct DemoReplay {
    pub scenario: &'static str,
    pub mission_day: u32,
    pub timestamp: DateTime<Utc>,
    pub observations: Vec<Observation>,
    pub missing_indicators: Vec<String>,
    pub data_class: &'static str,
    pub disclaimer: &'static str,
}

#[derive(Debug, Serialize)]
pub struct EvaluatedDemoReplay {
    #[serde(flatten)]
    pub replay: DemoReplay,
    pub vigilance: VigilanceLevel,
    pub triggered_rules: Vec<String>,
}

pub fn replay(scenario: DemoScenario, day: u32) -> Result<DemoReplay, String> {
    if !(1..=SCENARIO_DAYS).contains(&day) {
        return Err(format!("day must be between 1 and {SCENARIO_DAYS}"));
    }
    let timestamp = Utc
        .with_ymd_and_hms(2026, 1, 1, 6, 0, 0)
        .single()
        .expect("fixed demo timestamp is valid")
        + Duration::days(i64::from(day - 1));
    let (subject, source, values) = match scenario {
        DemoScenario::A01 => {
            let progress =
                (f64::from(day.saturating_sub(95)) / f64::from(SCENARIO_DAYS - 95)).clamp(0.0, 1.0);
            (
                "A-01",
                "SYNTHETIC_A01",
                [
                    ("heart_rate", round1(62.0 + 46.0 * progress), "bpm"),
                    ("sleep_duration", round1(7.8 - 3.6 * progress), "hours"),
                    ("fatigue_score", round1(2.0 + 6.0 * progress), "score"),
                    ("spo2", round1(98.0 - 10.0 * progress), "%"),
                ],
            )
        }
        DemoScenario::Nominal => (
            "N-01",
            "SYNTHETIC_NOMINAL",
            [
                ("heart_rate", 68.0, "bpm"),
                ("sleep_duration", 7.5, "hours"),
                ("fatigue_score", 2.0, "score"),
                ("spo2", 98.0, "%"),
            ],
        ),
        DemoScenario::Dropout => (
            "D-01",
            "SYNTHETIC_DROPOUT",
            [
                ("heart_rate", 68.0, "bpm"),
                ("sleep_duration", 7.5, "hours"),
                ("fatigue_score", 2.0, "score"),
                ("spo2", 98.0, "%"),
            ],
        ),
    };

    let missing_indicators = match scenario {
        DemoScenario::Dropout if (21..=23).contains(&day) => vec!["heart_rate".to_owned()],
        DemoScenario::Dropout if day == 45 => vec!["sleep_duration".to_owned()],
        _ => Vec::new(),
    };
    let observations = values
        .into_iter()
        .filter(|(indicator, _, _)| {
            !missing_indicators
                .iter()
                .any(|missing| missing == indicator)
        })
        .map(|(indicator, value, unit)| {
            let mut context = HashMap::new();
            context.insert("mission".to_owned(), Value::String("IRCO-DEMO".to_owned()));
            context.insert(
                "environment".to_owned(),
                Value::String("simulation".to_owned()),
            );
            context.insert("mission_day".to_owned(), Value::from(day));
            context.insert("activity".to_owned(), Value::String("rest".to_owned()));
            if scenario == DemoScenario::A01 && indicator == "heart_rate" {
                context.insert("individual_baseline".to_owned(), Value::from(62.0));
            }
            Observation {
                id: format!("{}-day{day:03}-{indicator}", scenario.name()),
                timestamp,
                subject_id: Some(subject.to_owned()),
                indicator: indicator.to_owned(),
                value,
                unit: unit.to_owned(),
                source: source.to_owned(),
                data_class: DataClass::Synthetic,
                context,
                provenance: HashMap::from([
                    (
                        "dataset".to_owned(),
                        Value::String(format!("irco-demo-{}", scenario.name())),
                    ),
                    (
                        "license".to_owned(),
                        Value::String("IRCO-internal".to_owned()),
                    ),
                ]),
                quality: Some(ObservationQuality {
                    status: "valid".to_owned(),
                    flags: Vec::new(),
                    original_resolution: Some("daily".to_owned()),
                    additional: HashMap::new(),
                }),
                metadata: HashMap::new(),
            }
        })
        .collect();

    Ok(DemoReplay {
        scenario: scenario.name(),
        mission_day: day,
        timestamp,
        observations,
        missing_indicators,
        data_class: "synthetic",
        disclaimer: "Synthetic demonstration data; not astronaut measurements or medical advice.",
    })
}

pub fn replay_with_rules(
    scenario: DemoScenario,
    day: u32,
    rules: &[DecisionRule],
) -> Result<EvaluatedDemoReplay, String> {
    let current_replay = replay(scenario, day)?;
    let mut history = Vec::new();
    let mut current_triggered_rules = Vec::new();
    for history_day in 1..=day {
        let day_replay = if history_day == day {
            current_replay.observations.clone()
        } else {
            replay(scenario, history_day)?.observations
        };
        let mut day_history = history.clone();
        day_history.extend(day_replay.iter().cloned());
        let mut day_triggers = Vec::new();
        for observation in &day_replay {
            let point_result = evaluate(rules, observation).map_err(|error| error.to_string())?;
            day_triggers.extend(point_result.triggered);
            let temporal_result = evaluate_temporal_rules(rules, &day_history, observation)
                .map_err(|error| error.to_string())?;
            day_triggers.extend(temporal_result.triggered);
        }
        let day_timestamp = day_replay
            .first()
            .map_or(current_replay.timestamp, |observation| {
                observation.timestamp
            });
        let subject_id = day_replay
            .first()
            .and_then(|observation| observation.subject_id.as_deref())
            .unwrap_or(match scenario {
                DemoScenario::A01 => "A-01",
                DemoScenario::Nominal => "N-01",
                DemoScenario::Dropout => "D-01",
            });
        let missing_data = evaluate_missing_data_rules(
            rules,
            &day_history,
            subject_id,
            &DataClass::Synthetic,
            day_timestamp,
        )
        .map_err(|error| error.to_string())?;
        day_triggers.extend(missing_data.triggered);
        if history_day == day {
            current_triggered_rules = day_triggers;
        }
        history.extend(day_replay);
    }
    let composite =
        evaluate_composite_rules(rules, &current_triggered_rules, &DataClass::Synthetic)
            .map_err(|error| error.to_string())?;
    current_triggered_rules.extend(composite.triggered);
    current_triggered_rules.sort();
    current_triggered_rules.dedup();
    let vigilance =
        compute_vigilance(rules, &current_triggered_rules).map_err(|error| error.to_string())?;

    Ok(EvaluatedDemoReplay {
        replay: current_replay,
        vigilance,
        triggered_rules: current_triggered_rules,
    })
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

#[cfg(test)]
mod tests {
    use super::{replay, replay_with_rules, DemoScenario};
    use irco_core::VigilanceLevel;
    use irco_decisions::rules::load_rules;

    #[test]
    fn a01_ends_at_the_specified_synthetic_values() {
        let day = replay(DemoScenario::A01, 124).unwrap();
        let values: Vec<_> = day
            .observations
            .iter()
            .map(|observation| (observation.indicator.as_str(), observation.value))
            .collect();
        assert!(values.contains(&("heart_rate", 108.0)));
        assert!(values.contains(&("sleep_duration", 4.2)));
        assert!(values.contains(&("fatigue_score", 8.0)));
        assert!(day
            .observations
            .iter()
            .all(|observation| observation.data_class.as_str() == "synthetic"));
    }

    #[test]
    fn a01_replay_moves_from_green_to_demo_amber_then_red() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let rules = load_rules(path).unwrap();
        // Day 116: SpO₂ = 90.8% (< 92%) now triggers RED earlier
        for (day, expected) in [
            (1, VigilanceLevel::Green),
            (96, VigilanceLevel::Green),
            (97, VigilanceLevel::Amber),
            (116, VigilanceLevel::Red), // Changed: SpO₂ < 92% triggers SPO2_THRESHOLD_001
            (117, VigilanceLevel::Red),
            (124, VigilanceLevel::Red),
        ] {
            let result = replay_with_rules(DemoScenario::A01, day, &rules.rules).unwrap();
            assert_eq!(result.vigilance, expected, "unexpected level on day {day}");
        }
    }

    #[test]
    fn nominal_and_dropout_are_explicit_and_never_fill_missing_sensor_values() {
        let nominal = replay(DemoScenario::Nominal, 50).unwrap();
        let dropout = replay(DemoScenario::Dropout, 21).unwrap();
        assert_eq!(nominal.observations.len(), 4);
        assert!(nominal.missing_indicators.is_empty());
        assert_eq!(dropout.observations.len(), 3);
        assert_eq!(dropout.missing_indicators, vec!["heart_rate"]);
    }

    #[test]
    fn invalid_day_is_rejected() {
        assert!(replay(DemoScenario::A01, 0).is_err());
        assert!(replay(DemoScenario::A01, 125).is_err());
    }
}
