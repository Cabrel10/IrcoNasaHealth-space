import json
import hashlib
import re
import unittest
from pathlib import Path

from jsonschema import Draft7Validator, FormatChecker
import yaml


ROOT = Path(__file__).resolve().parents[1]
FORMAT_CHECKER = FormatChecker()


def load_schema(name):
    schema = json.loads((ROOT / "contracts" / name).read_text(encoding="utf-8"))
    Draft7Validator.check_schema(schema)
    return schema


class ContractTests(unittest.TestCase):
    def test_schemas_are_valid_draft_7(self):
        for name in (
            "pivot.schema.json",
            "rules.schema.json",
            "manifest.schema.json",
            "corpus.schema.json",
        ):
            with self.subTest(schema=name):
                load_schema(name)

    def test_rules_conform_to_schema(self):
        rules = json.loads((ROOT / "rules" / "rules.json").read_text(encoding="utf-8"))
        validator = Draft7Validator(
            load_schema("rules.schema.json"), format_checker=FORMAT_CHECKER
        )
        errors = sorted(validator.iter_errors(rules), key=lambda error: list(error.path))
        self.assertEqual([], [f"{list(error.path)}: {error.message}" for error in errors])

    def test_observation_fixtures_conform_to_pivot_schema(self):
        validator = Draft7Validator(
            load_schema("pivot.schema.json"), format_checker=FORMAT_CHECKER
        )
        fixture_path = ROOT / "tests" / "fixtures" / "sample_observations.jsonl"
        for line_number, line in enumerate(
            fixture_path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            with self.subTest(line=line_number):
                observation = json.loads(line)
                errors = sorted(
                    validator.iter_errors(observation),
                    key=lambda error: list(error.path),
                )
                self.assertEqual(
                    [],
                    [f"{list(error.path)}: {error.message}" for error in errors],
                )
                if observation["data_class"] == "measured_real":
                    self.assertRegex(
                        observation["provenance"]["sha256"], r"^[a-f0-9]{64}$"
                    )
                if observation["source"] == "NASA_OSDR_EDA":
                    self.assertEqual(observation["quality"]["status"], "suspect")

    def test_normalized_observations_conform_when_present(self):
        pivot_path = ROOT / "data" / "normalized" / "observations.jsonl"
        if not pivot_path.exists():
            self.skipTest("no normalized dataset has been built")
        validator = Draft7Validator(
            load_schema("pivot.schema.json"), format_checker=FORMAT_CHECKER
        )
        for line_number, line in enumerate(
            pivot_path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            with self.subTest(line=line_number):
                observation = json.loads(line)
                errors = sorted(
                    validator.iter_errors(observation),
                    key=lambda error: list(error.path),
                )
                self.assertEqual(
                    [],
                    [f"{list(error.path)}: {error.message}" for error in errors],
                )
                self.assertEqual(observation["data_class"], "measured_real")

    def test_openapi_json_matches_yaml_source(self):
        yaml_path = ROOT / "docs" / "api" / "openapi.yaml"
        json_path = ROOT / "docs" / "api" / "openapi.json"
        expected = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
        actual = json.loads(json_path.read_text(encoding="utf-8"))
        self.assertEqual(expected, actual)
        self.assertEqual([{"bearerAuth": []}], expected["security"])
        for path in ("/health", "/version", "/openapi.json"):
            self.assertEqual([], expected["paths"][path]["get"]["security"])
        public_paths = {"/health", "/version", "/openapi.json"}
        colab_security = {
            "/api/v1/admin/colab/register": [{"colabAdminAuth": []}],
            "/api/v1/admin/colab/heartbeat": [{"colabSessionAuth": []}],
        }
        for path, operations in expected["paths"].items():
            for method, operation in operations.items():
                if not isinstance(operation, dict) or "responses" not in operation:
                    continue
                expected_security = (
                    []
                    if path in public_paths
                    else colab_security.get(path, expected["security"])
                )
                self.assertEqual(expected_security, operation.get("security", expected["security"]))

    def test_route_paths_match_router_openapi_and_implemented_contract(self):
        source = (ROOT / "crates" / "irco-api" / "src" / "lib.rs").read_text(
            encoding="utf-8"
        )
        router_routes = {
            (re.sub(r":([A-Za-z0-9_]+)", r"{\1}", path), method)
            for path, method in re.findall(
                r'\.route\(\s*"([^"]+)"\s*,\s*(get|post|patch)\s*\(',
                source,
                re.DOTALL,
            )
        }
        router_routes.update(
            (path, "delete")
            for path in re.findall(
                r'\.route\(\s*"([^"]+)"\s*,\s*post\([^)]+\)\.delete\(',
                source,
                re.DOTALL,
            )
        )
        openapi = yaml.safe_load(
            (ROOT / "docs" / "api" / "openapi.yaml").read_text(encoding="utf-8")
        )
        openapi_routes = {
            (path, method)
            for path, operations in openapi["paths"].items()
            for method in ("get", "post", "patch", "delete")
            if method in operations
        }
        contract = (ROOT / "contracts" / "api.md").read_text(encoding="utf-8")
        implemented_section = contract.split(
            "## Implemented API v0.1 routes", 1
        )[1].split("\n---", 1)[0]
        contract_routes = {
            (path, method.lower())
            for method, path in re.findall(
                r"\|\s*(GET|POST|PATCH|DELETE)\s*\|\s*`([^`]+)`\s*\|",
                implemented_section,
            )
        }
        self.assertEqual(router_routes, openapi_routes)
        self.assertEqual(router_routes, contract_routes)
        self.assertTrue(
            all(
                path.startswith("/api/v1/")
                for path, _ in router_routes
                if path not in {"/health", "/version", "/openapi.json"}
            )
        )

    def test_acquisition_manifest_conforms_when_present(self):
        manifest_path = ROOT / "data" / "manifests" / "acquisition.json"
        if not manifest_path.exists():
            self.skipTest("no acquisition manifest has been generated")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        validator = Draft7Validator(
            load_schema("manifest.schema.json"), format_checker=FORMAT_CHECKER
        )
        errors = sorted(validator.iter_errors(manifest), key=lambda error: list(error.path))
        self.assertEqual([], [f"{list(error.path)}: {error.message}" for error in errors])
        missing_artifacts = []
        for entry in manifest["entries"]:
            if entry.get("sha256"):
                artifact = Path(entry["local_path"])
                if not artifact.is_absolute():
                    artifact = ROOT / artifact
                if not artifact.is_file():
                    missing_artifacts.append(entry["local_path"])
                    continue
                digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
                self.assertEqual(entry["sha256"], digest)
        if missing_artifacts:
            self.skipTest(
                "source artifacts are not included in this checkout: "
                + ", ".join(missing_artifacts)
            )

    def test_curated_knowledge_corpus_conforms_when_present(self):
        corpus_path = ROOT / "data" / "corpus.jsonl"
        if not corpus_path.exists():
            self.skipTest("no curated knowledge corpus has been generated")
        validator = Draft7Validator(
            load_schema("corpus.schema.json"), format_checker=FORMAT_CHECKER
        )
        entries = [
            json.loads(line)
            for line in corpus_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertGreaterEqual(len(entries), 5)
        ids = [entry["id"] for entry in entries]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(
            all(
                entry.get("evidence_kind", "curated_summary") == "curated_summary"
                for entry in entries
            )
        )
        self.assertTrue(any(entry["source"] == "NASA Human Research Program" for entry in entries))
        self.assertTrue(any(entry["source"] == "Canadian Space Agency" for entry in entries))
        for line_number, entry in enumerate(entries, start=1):
            with self.subTest(line=line_number):
                errors = sorted(
                    validator.iter_errors(entry), key=lambda error: list(error.path)
                )
                self.assertEqual(
                    [], [f"{list(error.path)}: {error.message}" for error in errors]
                )


if __name__ == "__main__":
    unittest.main()
