//! Descriptive time-series analysis; this module does not apply medical thresholds.

use chrono::{DateTime, Utc};
use irco_core::{DataClass, Observation};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TrendDirection {
    Rising,
    Falling,
    Flat,
    InsufficientData,
}

#[derive(Debug, Clone, Serialize)]
pub struct HistoryAnalysis {
    pub subject_id: String,
    pub indicator: String,
    pub data_class: DataClass,
    pub observation_count: usize,
    pub first_timestamp: DateTime<Utc>,
    pub last_timestamp: DateTime<Utc>,
    pub latest_value: f64,
    pub minimum: f64,
    pub maximum: f64,
    pub mean: f64,
    pub slope_per_day: Option<f64>,
    pub trend: TrendDirection,
}

/// Analyze only valid measurements for the exact subject, indicator, and class.
/// Analog, measured, and synthetic records are never combined.
pub fn analyze_history(
    observations: &[Observation],
    subject_id: &str,
    indicator: &str,
    data_class: &DataClass,
) -> Option<HistoryAnalysis> {
    let mut samples: Vec<&Observation> = observations
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
        .collect();
    samples.sort_by_key(|sample| sample.timestamp);
    let first = *samples.first()?;
    let last = *samples.last()?;

    let mut minimum = f64::INFINITY;
    let mut maximum = f64::NEG_INFINITY;
    let mut sum = 0.0;
    for sample in &samples {
        minimum = minimum.min(sample.value);
        maximum = maximum.max(sample.value);
        sum += sample.value;
    }

    let slope_per_day = linear_slope_per_day(&samples);
    let trend = match slope_per_day {
        Some(slope) if slope > 0.0 => TrendDirection::Rising,
        Some(slope) if slope < 0.0 => TrendDirection::Falling,
        Some(_) => TrendDirection::Flat,
        None => TrendDirection::InsufficientData,
    };

    Some(HistoryAnalysis {
        subject_id: subject_id.to_owned(),
        indicator: indicator.to_owned(),
        data_class: data_class.clone(),
        observation_count: samples.len(),
        first_timestamp: first.timestamp,
        last_timestamp: last.timestamp,
        latest_value: last.value,
        minimum,
        maximum,
        mean: sum / samples.len() as f64,
        slope_per_day,
        trend,
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
    use super::{analyze_history, TrendDirection};
    use irco_core::{DataClass, Observation, ObservationQuality};
    use std::collections::HashMap;

    fn observation(id: &str, timestamp: &str, value: f64, class: DataClass) -> Observation {
        Observation {
            id: id.to_owned(),
            timestamp: timestamp.parse().unwrap(),
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
    fn trend_is_calculated_per_day_without_mixing_classes() {
        let rows = vec![
            observation(
                "real-0001",
                "2026-01-01T00:00:00Z",
                60.0,
                DataClass::MeasuredReal,
            ),
            observation(
                "real-0002",
                "2026-01-02T00:00:00Z",
                62.0,
                DataClass::MeasuredReal,
            ),
            observation(
                "analog-01",
                "2026-01-01T00:00:00Z",
                100.0,
                DataClass::Analog,
            ),
        ];
        let result =
            analyze_history(&rows, "subject-1", "heart_rate", &DataClass::MeasuredReal).unwrap();
        assert_eq!(result.observation_count, 2);
        assert_eq!(result.slope_per_day, Some(2.0));
        assert_eq!(result.trend, TrendDirection::Rising);
    }

    #[test]
    fn missing_or_suspect_quality_is_insufficient_evidence() {
        let mut row = observation(
            "real-0001",
            "2026-01-01T00:00:00Z",
            60.0,
            DataClass::MeasuredReal,
        );
        row.quality.as_mut().unwrap().status = "suspect".to_owned();
        assert!(
            analyze_history(&[row], "subject-1", "heart_rate", &DataClass::MeasuredReal).is_none()
        );
    }
}
