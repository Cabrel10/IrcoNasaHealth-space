# Indicator Definitions

This directory contains indicator definition files in TOML or JSON format.

Each indicator specifies:
- Unique ID and human-readable name
- Indicator family (cardiovascular, respiratory, etc.)
- Unit of measurement
- Collection method and expected frequency
- Data sources
- Reference ranges with validation status
- Scientific references

See `irco-core/src/types.rs` for the `IndicatorDef` Rust struct.
