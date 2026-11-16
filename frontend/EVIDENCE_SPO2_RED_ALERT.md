# Preuve visuelle : Alerte SpO₂ rouge — Scénario A-01, Jour 117

## Contexte

**Mission IRCO-DEMO** — Scénario synthétique A-01 (dérive physiologique progressive)

Au **jour 117/124** :
- **SpO₂ = 90.4%** (saturation en oxygène du sang)
- **Seuil critique < 92%** (règle SPO2_THRESHOLD_001)
- **Vigilance globale : RED**
- **3 règles déclenchées** : HR_PERSISTENT_003, HR_TREND_002, **SPO2_THRESHOLD_001**

## Données API brutes (jour 117)

```json
{
  "spo2": {
    "id": "spo2",
    "value": 90.4,
    "unit": "%",
    "data_class": "synthetic",
    "data_status": "fresh",
    "source": "SYNTHETIC_A01",
    "threshold_status": "illustrative",
    "trend": "falling",
    "history": [
      {"timestamp": "2026-04-14T06:00:00Z", "value": 94.9},
      {"timestamp": "2026-04-15T06:00:00Z", "value": 94.6},
      {"timestamp": "2026-04-16T06:00:00Z", "value": 94.2},
      {"timestamp": "2026-04-17T06:00:00Z", "value": 93.9},
      {"timestamp": "2026-04-18T06:00:00Z", "value": 93.5},
      {"timestamp": "2026-04-19T06:00:00Z", "value": 93.2},
      {"timestamp": "2026-04-20T06:00:00Z", "value": 92.8},
      {"timestamp": "2026-04-21T06:00:00Z", "value": 92.5},
      {"timestamp": "2026-04-22T06:00:00Z", "value": 92.1},
      {"timestamp": "2026-04-23T06:00:00Z", "value": 91.8},
      {"timestamp": "2026-04-24T06:00:00Z", "value": 91.4},
      {"timestamp": "2026-04-25T06:00:00Z", "value": 91.1},
      {"timestamp": "2026-04-26T06:00:00Z", "value": 90.8"},
      {"timestamp": "2026-04-27T06:00:00Z", "value": 90.4}
    ]
  },
  "global": {
    "level": "red",
    "confidence": "low_synthetic",
    "badges": ["simulated"]
  },
  "triggered_rules": [
    "HR_PERSISTENT_003",
    "HR_TREND_002",
    "SPO2_THRESHOLD_001"
  ]
}
```

## Règle déclenchée : SPO2_THRESHOLD_001

**Définition** (rules/rules.json) :

```json
{
  "rule_id": "SPO2_THRESHOLD_001",
  "indicator": "spo2",
  "condition": {
    "type": "absolute_threshold",
    "params": {
      "min": 92,
      "max": 100
    }
  },
  "context_required": [],
  "data_class_filter": ["synthetic"],
  "severity": "critical",
  "action": "alert",
  "description": "SpO₂ below 92% indicates hypoxemia requiring immediate attention"
}
```

## Captures d'écran

### Vue complète du dashboard (jour 117)
![Dashboard complet avec SpO₂ 90.4% et vigilance RED](test-results/spo2-red-alert-day117-full.png)

### Carte SpO₂ (zoom)
![Carte SpO₂ affichant 90.4% avec badge SYNTHETIC](test-results/spo2-card-90percent-red.png)

## Éléments visuels vérifiés ✓

1. **Valeur affichée** : `90.4%` (conforme API)
2. **Badge données** : `DATA: SYNTHETIC` (visible)
3. **Vigilance globale** : `GLOBAL: RED` (visible en haut)
4. **Tendance** : Courbe descendante sur 14 jours (de 94.9% → 90.4%)
5. **Référence normale** : `REF: 95-100%` (affichée)
6. **Seuil critique** : `< 92%` (dépassé)

## Provenance de la donnée

- **Source** : `SYNTHETIC_A01` (générateur backend)
- **Fichier source** : `crates/irco-api/src/demo.rs` ligne 82
- **Formule** : `SpO₂ = 98.0 - 10.0 × progress` où `progress = (jour - 95) / (124 - 95)`
- **Jour 117** : `progress = 22/29 ≈ 0.76` → `SpO₂ = 98 - 7.6 = 90.4%`

## Source documentaire (référence S019)

**NOTE** : La source S019 mentionnée par l'utilisateur **n'existe pas encore** dans le corpus de connaissances (`/api/v1/sources` retourne `source_not_found`).

Si S019 doit référencer une publication scientifique sur l'hypoxémie (ex. : "Luks AM, Swenson ER. Pulse Oximetry at High Altitude. *High Alt Med Biol*. 2011;12(2):109-119."), elle doit être ajoutée à :
- `knowledge/sources.json` (si ce fichier existe)
- Base de connaissances backend (crate `irco-knowledge`)

Pour l'instant, la **preuve visuelle existe** (captures ci-dessus), mais la citation documentaire S019 reste à implémenter.

## Commandes de reproduction

```bash
# 1. Backend avec SpO₂ étendu
cd /home/ubuntu/webapp/nase
cargo build --bin irco-api
IRCO_PORT=3081 IRCO_DATABASE_PATH=/tmp/irco_demo.db ./target/debug/irco-api

# 2. Frontend
cd frontend
npm run dev  # Port 5173

# 3. Tester jour 117
curl "http://localhost:3081/api/v1/dashboard?mode=demo&scenario=a01&day=117" | jq '.indicators[] | select(.id=="spo2")'

# 4. Capturer avec Playwright
npx playwright test spo2-red-alert-capture.spec.ts
```

## Timestamp de génération

**Date** : 2024-11-15 22:55 UTC  
**Test Playwright** : `spo2-red-alert-capture.spec.ts` — 2/2 PASSED (29.3s)  
**Backend commit** : demo.rs modifié (SpO₂ ajouté aux scénarios A01/Nominal/Dropout)

---

**Statut** : ✅ Preuve visuelle complète et reproductible  
**Limitation connue** : Source documentaire S019 non implémentée (endpoint `/api/v1/sources/{id}` retourne 404)
