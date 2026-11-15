# IRCO Scientific Validation Policy

## Principle

IRCO does NOT invent medical thresholds or scientific correlations.

Every threshold, range, correlation, and decision rule must have:
1. A documented source (publication, guideline, or standard)
2. A validation status: `validated`, `provisional`, or `illustrative`
3. A visible badge in the UI when `illustrative` or `provisional`

## Validation Status Definitions

| Status | Meaning | Usage |
|--------|---------|-------|
| `validated` | Based on peer-reviewed evidence or official guidelines | Can be used in alerts without disclaimer |
| `provisional` | Reasonable default from general medical practice, pending space-specific validation | Used with "provisional threshold" disclaimer |
| `illustrative` | For demonstration purposes only, not based on validated evidence | Clearly marked "demo only" in UI and reports |

## Current State (v0)

**All current thresholds and rules are `illustrative`.**

This is by design: IRCO v0 is a demonstration of capability, not a medical device.

## Correlation Policy

1. **No invented correlations.** Every multi-indicator relationship (e.g., "rising HR + declining sleep → fatigue risk") must cite a mechanism.
2. **Correlations are configurable.** They live in `rules/rules.json`, not hardcoded.
3. **Each correlation documents:**
   - Physiological mechanism
   - Known confounders
   - Temporal window
   - Conditions under which it does NOT apply
   - Level of evidence

## What IRCO Is NOT

- NOT a diagnostic tool
- NOT a replacement for flight surgeons
- NOT FDA/CE-approved medical software
- NOT a source of definitive medical advice

## What IRCO IS

- A surveillance and decision-support tool
- A system that makes heterogeneous data comprehensible
- An assistant that can explain what it observes with scientific context
- A platform where validated rules can be added as evidence accumulates
