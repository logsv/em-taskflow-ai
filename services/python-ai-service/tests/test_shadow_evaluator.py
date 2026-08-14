import pytest
from app.telemetry.shadow_evaluator import ShadowEvaluatorWorker

def test_shadow_evaluator_initialization():
    worker = ShadowEvaluatorWorker(sampling_rate=1.0, model_name="hermes3:8b")
    assert worker.sampling_rate == 1.0
    assert worker.model_name == "hermes3:8b"

def test_shadow_evaluator_samples_and_evaluates():
    worker = ShadowEvaluatorWorker(sampling_rate=1.0)
    trace_context = {
        "trace_id": "trace-12345",
        "query": "What are the sprint blockers?",
        "response": "### 📄 Executive Summary\nBlockers listed.\n### 🔍 Key Document Analysis\nIssue details.\n### 📌 Source Citations\n[Doc 1]",
    }
    result = worker.evaluate_shadow_trace(trace_context)
    assert result is not None
    assert result["score"] == 5

def test_shadow_evaluator_skips_when_not_sampled():
    worker = ShadowEvaluatorWorker(sampling_rate=0.0)
    result = worker.evaluate_shadow_trace({"query": "test"})
    assert result is None
