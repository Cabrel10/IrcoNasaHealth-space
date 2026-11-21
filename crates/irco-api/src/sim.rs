use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub const SIMULATED_LABEL: &str = "SIMULATED ENVIRONMENT";
pub const SIMULATED_DISCLAIMER: &str =
    "Seuils illustratifs — pas un diagnostic clinique. Mode simulation environnementale.";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SimInputs {
    pub radiation_dose: f64,
    pub co2_cabin: f64,
    pub isolation_days: f64,
    pub gravity_level: f64,
    pub exercise_minutes: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct SimEnvironmentRequest {
    pub radiation_dose: Option<f64>,
    pub co2_cabin: Option<f64>,
    pub isolation_days: Option<f64>,
    pub gravity_level: Option<f64>,
    pub exercise_minutes: Option<f64>,
    pub preset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SimHazardLevel {
    pub id: String,
    pub level: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SimBodyZone {
    pub zone_id: String,
    pub system: String,
    pub name: String,
    pub level: u8,
    pub drivers: Vec<String>,
    pub rule_ids: Vec<String>,
    pub sources: Vec<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SimEnvironmentResponse {
    pub label: &'static str,
    pub disclaimer: &'static str,
    pub environment: SimInputs,
    pub hazards: Vec<SimHazardLevel>,
    pub body: Vec<SimBodyZone>,
}

#[derive(Debug, Clone)]
pub struct SimEngine {
    effects_doc: Value,
    body_map_doc: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SimValidationError {
    pub code: &'static str,
    pub message: String,
    pub hint: &'static str,
}

impl SimEngine {
    pub fn new(effects_doc: Value, body_map_doc: Value) -> Self {
        Self {
            effects_doc,
            body_map_doc,
        }
    }

    pub fn body_zones(&self) -> &Value {
        &self.body_map_doc
    }

    pub fn resolve_inputs(
        &self,
        req: &SimEnvironmentRequest,
    ) -> Result<SimInputs, SimValidationError> {
        let presets = self.effects_doc.get("presets").and_then(Value::as_object);
        let inputs_def = self.effects_doc.get("inputs").and_then(Value::as_object);

        let mut base = if let Some(ref preset_name) = req.preset {
            let Some(presets_map) = presets else {
                return Err(SimValidationError {
                    code: "presets_unavailable",
                    message: "Simulation presets configuration is missing".to_string(),
                    hint: "Ensure rules/environment_effects.json contains a 'presets' section.",
                });
            };
            let Some(preset_val) = presets_map.get(preset_name) else {
                return Err(SimValidationError {
                    code: "unknown_preset",
                    message: format!("Unknown preset '{preset_name}'"),
                    hint: "Valid presets are: nominal, solar_particle_event, high_cabin_co2, long_isolation_day124, reduced_exercise.",
                });
            };
            SimInputs {
                radiation_dose: preset_val["radiation_dose"].as_f64().unwrap_or(0.35),
                co2_cabin: preset_val["co2_cabin"].as_f64().unwrap_or(420.0),
                isolation_days: preset_val["isolation_days"].as_f64().unwrap_or(1.0),
                gravity_level: preset_val["gravity_level"].as_f64().unwrap_or(1.0),
                exercise_minutes: preset_val["exercise_minutes"].as_f64().unwrap_or(60.0),
            }
        } else {
            // Default nominal inputs
            SimInputs {
                radiation_dose: inputs_def
                    .and_then(|d| d.get("radiation_dose"))
                    .and_then(|v| v["nominal"].as_f64())
                    .unwrap_or(0.35),
                co2_cabin: inputs_def
                    .and_then(|d| d.get("co2_cabin"))
                    .and_then(|v| v["nominal"].as_f64())
                    .unwrap_or(420.0),
                isolation_days: inputs_def
                    .and_then(|d| d.get("isolation_days"))
                    .and_then(|v| v["nominal"].as_f64())
                    .unwrap_or(1.0),
                gravity_level: inputs_def
                    .and_then(|d| d.get("gravity_level"))
                    .and_then(|v| v["nominal"].as_f64())
                    .unwrap_or(1.0),
                exercise_minutes: inputs_def
                    .and_then(|d| d.get("exercise_minutes"))
                    .and_then(|v| v["nominal"].as_f64())
                    .unwrap_or(60.0),
            }
        };

        // Explicit overrides if provided in request
        if let Some(v) = req.radiation_dose {
            base.radiation_dose = v;
        }
        if let Some(v) = req.co2_cabin {
            base.co2_cabin = v;
        }
        if let Some(v) = req.isolation_days {
            base.isolation_days = v;
        }
        if let Some(v) = req.gravity_level {
            base.gravity_level = v;
        }
        if let Some(v) = req.exercise_minutes {
            base.exercise_minutes = v;
        }

        // Validate ranges
        self.validate_range("radiation_dose", base.radiation_dose)?;
        self.validate_range("co2_cabin", base.co2_cabin)?;
        self.validate_range("isolation_days", base.isolation_days)?;
        self.validate_range("gravity_level", base.gravity_level)?;
        self.validate_range("exercise_minutes", base.exercise_minutes)?;

        Ok(base)
    }

    fn validate_range(&self, name: &str, val: f64) -> Result<(), SimValidationError> {
        let input_meta = self.effects_doc.get("inputs").and_then(|i| i.get(name));
        if let Some(meta) = input_meta {
            let min = meta["min"].as_f64().unwrap_or(0.0);
            let max = meta["max"].as_f64().unwrap_or(f64::MAX);
            if val < min || val > max {
                return Err(SimValidationError {
                    code: "parameter_out_of_range",
                    message: format!("Parameter '{name}' with value {val} is outside allowed range [{min}, {max}]"),
                    hint: "Ensure parameter values are within configured bounds in rules/environment_effects.json.",
                });
            }
        }
        Ok(())
    }

    pub fn compute(
        &self,
        req: &SimEnvironmentRequest,
    ) -> Result<SimEnvironmentResponse, SimValidationError> {
        let env = self.resolve_inputs(req)?;
        Ok(self.compute_with_inputs(env))
    }

    pub fn compute_with_inputs(&self, env: SimInputs) -> SimEnvironmentResponse {
        // 1. Evaluate effect rules for each hazard
        // Map hazard_id -> (level, Vec<rule_id>)
        let mut hazard_levels: BTreeMap<String, (u8, Vec<String>)> = BTreeMap::new();

        // Initialize known hazards to level 0
        for h in [
            "radiation",
            "isolation",
            "hostile_environment",
            "distance_from_earth",
            "altered_gravity",
        ] {
            hazard_levels.insert(h.to_string(), (0, Vec::new()));
        }

        if let Some(rules) = self.effects_doc.get("rules").and_then(Value::as_array) {
            for rule in rules {
                let rule_id = rule["rule_id"].as_str().unwrap_or("").to_string();
                let hazard_id = rule["hazard_id"].as_str().unwrap_or("").to_string();
                let input_name = rule["input"].as_str().unwrap_or("");

                let val = match input_name {
                    "radiation_dose" => env.radiation_dose,
                    "co2_cabin" => env.co2_cabin,
                    "isolation_days" => env.isolation_days,
                    "gravity_level" => env.gravity_level,
                    "exercise_minutes" => env.exercise_minutes,
                    _ => continue,
                };

                let mut rule_level = 0u8;
                if let Some(thresholds) = rule["thresholds"].as_array() {
                    for th in thresholds {
                        let min = th["min"].as_f64().unwrap_or(f64::MIN);
                        let max = th["max"].as_f64();
                        let lvl = th["level"].as_u64().unwrap_or(0) as u8;

                        let matches = match max {
                            Some(m) => val >= min && val < m,
                            None => val >= min,
                        };

                        if matches {
                            rule_level = lvl;
                            break;
                        }
                    }
                }

                let entry = hazard_levels
                    .entry(hazard_id)
                    .or_insert_with(|| (0, Vec::new()));
                if rule_level > entry.0 {
                    entry.0 = rule_level;
                }
                if rule_level > 0 {
                    entry.1.push(rule_id);
                }
            }
        }

        let mut hazards_list = Vec::new();
        for (h_id, (lvl, _)) in &hazard_levels {
            hazards_list.push(SimHazardLevel {
                id: h_id.clone(),
                level: *lvl,
            });
        }
        hazards_list.sort_by(|a, b| a.id.cmp(&b.id));

        // 2. Evaluate body zones based on body_map.json
        let mut body_zones = Vec::new();
        if let Some(zones) = self.body_map_doc.get("zones").and_then(Value::as_array) {
            for z in zones {
                let zone_id = z["zone_id"].as_str().unwrap_or("").to_string();
                let name = z["name"].as_str().unwrap_or("").to_string();
                let system = z["system"].as_str().unwrap_or("").to_string();
                let link_status = z["link_status"]
                    .as_str()
                    .unwrap_or("no_documented_link")
                    .to_string();

                if link_status == "no_documented_link" {
                    body_zones.push(SimBodyZone {
                        zone_id,
                        system,
                        name,
                        level: 0,
                        drivers: Vec::new(),
                        rule_ids: Vec::new(),
                        sources: Vec::new(),
                        status: "no_documented_link".to_string(),
                    });
                    continue;
                }

                // Sourced zone: compute max level across linked hazards
                let mut zone_level = 0u8;
                let mut drivers = BTreeSet::new();
                let mut rule_ids = BTreeSet::new();
                let mut sources = BTreeSet::new();

                if let Some(zone_hazards) = z["hazards"].as_array() {
                    for zh in zone_hazards {
                        let hid = zh["hazard_id"].as_str().unwrap_or("");
                        if let Some((hlvl, hrules)) = hazard_levels.get(hid) {
                            if *hlvl > 0 {
                                if *hlvl > zone_level {
                                    zone_level = *hlvl;
                                }
                                drivers.insert(hid.to_string());
                                for r in hrules {
                                    rule_ids.insert(r.clone());
                                }
                                if let Some(cids) = zh["corpus_ids"].as_array() {
                                    for cid in cids {
                                        if let Some(s) = cid.as_str() {
                                            sources.insert(s.to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                body_zones.push(SimBodyZone {
                    zone_id,
                    system,
                    name,
                    level: zone_level,
                    drivers: drivers.into_iter().collect(),
                    rule_ids: rule_ids.into_iter().collect(),
                    sources: sources.into_iter().collect(),
                    status: "sourced".to_string(),
                });
            }
        }

        SimEnvironmentResponse {
            label: SIMULATED_LABEL,
            disclaimer: SIMULATED_DISCLAIMER,
            environment: env,
            hazards: hazards_list,
            body: body_zones,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_engine() -> SimEngine {
        let effects_str = include_str!("../../../rules/environment_effects.json");
        let body_map_str = include_str!("../../../data/body_map.json");
        let effects_val: Value = serde_json::from_str(effects_str).unwrap();
        let body_map_val: Value = serde_json::from_str(body_map_str).unwrap();
        SimEngine::new(effects_val, body_map_val)
    }

    #[test]
    fn nominal_preset_gives_zero_on_all_zones_and_hazards() {
        let engine = sample_engine();
        let req = SimEnvironmentRequest {
            preset: Some("nominal".to_string()),
            ..Default::default()
        };
        let res = engine.compute(&req).unwrap();
        assert_eq!(res.label, SIMULATED_LABEL);
        for h in &res.hazards {
            assert_eq!(h.level, 0, "Hazard {} should be 0 in nominal", h.id);
        }
        for b in &res.body {
            assert_eq!(b.level, 0, "Body zone {} should be 0 in nominal", b.zone_id);
            if b.status == "no_documented_link" {
                assert!(b.drivers.is_empty());
                assert!(b.sources.is_empty());
            }
        }
    }

    #[test]
    fn solar_particle_event_raises_radiation_and_affects_hematologic_and_neurologic_zones() {
        let engine = sample_engine();
        let req = SimEnvironmentRequest {
            preset: Some("solar_particle_event".to_string()),
            ..Default::default()
        };
        let res = engine.compute(&req).unwrap();

        // Radiation hazard must be > 0
        let rad = res.hazards.iter().find(|h| h.id == "radiation").unwrap();
        assert!(
            rad.level > 0,
            "Radiation hazard must be > 0 in solar_particle_event"
        );

        // Zones arterial_tree (hematologic) and brain_spinal_cord (neurologic) must be > 0
        let arterial = res
            .body
            .iter()
            .find(|b| b.zone_id == "arterial_tree")
            .unwrap();
        assert!(
            arterial.level > 0,
            "arterial_tree must be > 0 in solar_particle_event"
        );
        assert!(arterial.drivers.contains(&"radiation".to_string()));
        assert!(!arterial.sources.is_empty());
        assert!(!arterial.rule_ids.is_empty());

        let brain = res
            .body
            .iter()
            .find(|b| b.zone_id == "brain_spinal_cord")
            .unwrap();
        assert!(
            brain.level > 0,
            "brain_spinal_cord must be > 0 in solar_particle_event"
        );
        assert!(brain.drivers.contains(&"radiation".to_string()));
        assert!(!brain.sources.is_empty());
        assert!(!brain.rule_ids.is_empty());

        // Undocumented organs stay 0 with no_documented_link
        for id in ["liver", "kidneys", "intestines", "lungs"] {
            let zone = res.body.iter().find(|b| b.zone_id == id).unwrap();
            assert_eq!(zone.level, 0);
            assert_eq!(zone.status, "no_documented_link");
            assert!(zone.sources.is_empty());
        }
    }

    #[test]
    fn determinism_two_identical_calls_yield_identical_results() {
        let engine = sample_engine();
        let req = SimEnvironmentRequest {
            preset: Some("solar_particle_event".to_string()),
            ..Default::default()
        };
        let res1 = engine.compute(&req).unwrap();
        let res2 = engine.compute(&req).unwrap();
        assert_eq!(res1, res2);
    }

    #[test]
    fn truthfulness_every_level_greater_than_zero_has_at_least_one_valid_source() {
        let engine = sample_engine();
        for preset in [
            "nominal",
            "solar_particle_event",
            "high_cabin_co2",
            "long_isolation_day124",
            "reduced_exercise",
        ] {
            let req = SimEnvironmentRequest {
                preset: Some(preset.to_string()),
                ..Default::default()
            };
            let res = engine.compute(&req).unwrap();
            for zone in &res.body {
                if zone.level > 0 {
                    assert_eq!(
                        zone.status, "sourced",
                        "Zone {} has level > 0 but not sourced",
                        zone.zone_id
                    );
                    assert!(
                        !zone.sources.is_empty(),
                        "Zone {} has level > 0 but no sources",
                        zone.zone_id
                    );
                    assert!(
                        !zone.drivers.is_empty(),
                        "Zone {} has level > 0 but no drivers",
                        zone.zone_id
                    );
                } else if zone.status == "no_documented_link" {
                    assert_eq!(
                        zone.level, 0,
                        "Undocumented zone {} must have level 0",
                        zone.zone_id
                    );
                }
            }
        }
    }

    #[test]
    fn invalid_preset_returns_error_envelope() {
        let engine = sample_engine();
        let req = SimEnvironmentRequest {
            preset: Some("invalid_preset_xyz".to_string()),
            ..Default::default()
        };
        let err = engine.compute(&req).unwrap_err();
        assert_eq!(err.code, "unknown_preset");
    }

    #[test]
    fn out_of_range_parameter_returns_error() {
        let engine = sample_engine();
        let req = SimEnvironmentRequest {
            radiation_dose: Some(999.0), // max is 10.0
            ..Default::default()
        };
        let err = engine.compute(&req).unwrap_err();
        assert_eq!(err.code, "parameter_out_of_range");
    }
}
