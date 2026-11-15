//! Descriptive baselines from explicitly selected valid personal observations.

use irco_core::{DataClass, Observation};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct PersonalBaseline {
    pub subject_id: String,
    pub indicator: String,
    pub data_class: DataClass,
    pub sample_count: usize,
    pub mean: f64,
    pub median: f64,
    pub standard_deviation: f64,
}

/// Build a descriptive baseline from the provided reference window.
pub fn compute_personal_baseline(
    observations: &[Observation],
    subject_id: &str,
    indicator: &str,
    data_class: &DataClass,
) -> Option<PersonalBaseline> {
    let mut values: Vec<f64> = observations
        .iter()
        .filter(|observation| {
            observation.subject_id.as_deref() == Some(subject_id)
                && observation.indicator == indicator
                && &observation.data_class == data_class
                && observation
                    .quality
                    .as_ref()
                    .is_some_and(|quality| quality.status == "valid")
                && observation.value.is_finite()
        })
        .map(|observation| observation.value)
        .collect();
    if values.is_empty() {
        return None;
    }
    values.sort_by(f64::total_cmp);
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let median = if values.len().is_multiple_of(2) {
        (values[values.len() / 2 - 1] + values[values.len() / 2]) / 2.0
    } else {
        values[values.len() / 2]
    };
    let variance = values
        .iter()
        .map(|value| (value - mean).powi(2))
        .sum::<f64>()
        / values.len() as f64;

    Some(PersonalBaseline {
        subject_id: subject_id.to_owned(),
        indicator: indicator.to_owned(),
        data_class: data_class.clone(),
        sample_count: values.len(),
        mean,
        median,
        standard_deviation: variance.sqrt(),
    })
}

#[cfg(test)]
mod tests {
    use super::compute_personal_baseline;
    use irco_core::{DataClass, Observation, ObservationQuality};
    use std::collections::HashMap;

    fn observation(id: &str, value: f64, class: DataClass) -> Observation {
        Observation {
            id: id.to_owned(),
            timestamp: "2026-01-01T00:00:00Z".parse().unwrap(),
            subject_id: Some("subject-1".to_owned()),
            indicator: "heart_rate".to_owned(),
            value,
            unit: "bpm".to_owned(),
            source: "fixture".to_owned(),
            data_class: class,
            context: HashMap::new(),
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

    #[test]
    fn baseline_uses_only_the_requested_class_and_valid_rows() {
        let observations = vec![
            observation("a-0001", 60.0, DataClass::MeasuredReal),
            observation("a-0002", 80.0, DataClass::MeasuredReal),
            observation("b-0001", 120.0, DataClass::Analog),
        ];
        let baseline = compute_personal_baseline(
            &observations,
            "subject-1",
            "heart_rate",
            &DataClass::MeasuredReal,
        )
        .unwrap();
        assert_eq!(baseline.sample_count, 2);
        assert_eq!(baseline.mean, 70.0);
        assert_eq!(baseline.median, 70.0);
    }
}
