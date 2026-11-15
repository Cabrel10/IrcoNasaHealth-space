//! Vigilance level computation.

use irco_core::{DecisionRule, IrcoError, VigilanceLevel};

/// Return the most severe deterministic level among the triggered rules.
pub fn compute_vigilance(
    rules: &[DecisionRule],
    triggered: &[String],
) -> Result<VigilanceLevel, IrcoError> {
    let mut level = VigilanceLevel::Green;

    for rule_id in triggered {
        let rule = rules
            .iter()
            .find(|rule| &rule.rule_id == rule_id)
            .ok_or_else(|| {
                IrcoError::RuleEval(format!("Triggered rule {rule_id} is not configured"))
            })?;
        let triggered_level = rule.vigilance_level.as_ref().ok_or_else(|| {
            IrcoError::RuleEval(format!("Triggered rule {rule_id} has no vigilance level"))
        })?;
        if severity(triggered_level) > severity(&level) {
            level = triggered_level.clone();
        }
    }

    Ok(level)
}

fn severity(level: &VigilanceLevel) -> u8 {
    match level {
        VigilanceLevel::Green => 0,
        VigilanceLevel::Amber => 1,
        VigilanceLevel::Red => 2,
        VigilanceLevel::NoData => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::compute_vigilance;
    use crate::rules::load_rules;
    use irco_core::VigilanceLevel;

    #[test]
    fn empty_triggers_are_green_and_red_dominates() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../rules/rules.json");
        let rules = load_rules(path).unwrap();
        assert_eq!(
            compute_vigilance(&rules.rules, &[]).unwrap(),
            VigilanceLevel::Green
        );
        assert_eq!(
            compute_vigilance(
                &rules.rules,
                &[
                    "HR_THRESHOLD_001".to_owned(),
                    "SPO2_THRESHOLD_001".to_owned()
                ]
            )
            .unwrap(),
            VigilanceLevel::Red
        );
    }
}
