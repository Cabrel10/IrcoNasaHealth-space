//! Health indicator registry and evaluation.

/// Evaluate an indicator against its reference range.
pub fn evaluate_indicator(_indicator_id: &str, _value: f64) -> Result<(), irco_core::IrcoError> {
    // TODO: load indicator def, compare against reference range
    Ok(())
}
