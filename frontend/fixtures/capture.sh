#!/bin/bash
set -e
BASE="http://localhost:3081"

echo "Capturing fixtures from $BASE"

# Dashboard pour les 4 jours clés
for day in 1 97 117 124; do
  echo "  - dashboard day $day"
  curl -s "$BASE/api/v1/dashboard?scenario=a01&day=$day&data_class=synthetic" | jq . > "dashboard_day${day}.json"
done

# Mission
echo "  - mission"
curl -s "$BASE/api/v1/mission" | jq . > "mission.json"

# Routine
echo "  - routine"
curl -s "$BASE/api/v1/routine?subject_id=A-01" | jq . > "routine.json"

# State (sans data_class)
echo "  - state"
curl -s "$BASE/api/v1/state?data_class=synthetic" | jq . > "state.json"

# Indicators
echo "  - indicators"
curl -s "$BASE/api/v1/indicators" | jq . > "indicators.json"

# Alerts (vide probablement)
echo "  - alerts"
curl -s "$BASE/api/v1/alerts" | jq . > "alerts.json"

# Knowledge hazards
echo "  - knowledge_hazards"
curl -s "$BASE/api/v1/knowledge/hazards" | jq . > "knowledge_hazards.json"

# Demo scenarios
echo "  - demo_scenarios"
curl -s "$BASE/api/v1/demo/scenarios" | jq . > "demo_scenarios.json"

echo "✓ Fixtures captured"
ls -lh *.json | awk '{print "  ", $9, $5}'
