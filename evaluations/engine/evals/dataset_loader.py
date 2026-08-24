import os
import json
from typing import List, Dict, Any

DATASETS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "datasets")
)


def get_dataset_path(filename: str) -> str:
    """Returns absolute path to dataset in central evaluations/datasets directory."""
    primary_path = os.path.join(DATASETS_DIR, filename)
    if os.path.exists(primary_path):
        return primary_path

    # Fallback paths
    fallbacks = [
        os.path.join("/app/evaluations/datasets", filename),
        os.path.join("/app/evaluation", filename),
        os.path.join(os.getcwd(), "evaluations", "datasets", filename),
        os.path.join(os.getcwd(), "backend", "evaluation", filename),
    ]
    for p in fallbacks:
        if os.path.exists(p):
            return p
    return primary_path


def load_golden_dataset() -> List[Dict[str, Any]]:
    """Loads golden dataset test cases."""
    path = get_dataset_path("golden-dataset.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def load_prompt_matrix_cases(limit: int = 10) -> List[Dict[str, Any]]:
    """Loads prompt matrix evaluation cases."""
    path = get_dataset_path("prompt-matrix-cases.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data[:limit]
    return []
