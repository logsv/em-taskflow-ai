import pytest
from evaluation.rag_evaluator import PythonRAGEvaluator

def test_python_rag_evaluator_initialization():
    evaluator = PythonRAGEvaluator(model_name="hermes3:8b")
    assert evaluator.model_name == "hermes3:8b"
    assert evaluator.ollama_host == "http://localhost:11434"

def test_hyde_document_generation_fallback(monkeypatch):
    evaluator = PythonRAGEvaluator()
    # Force exception on client to test graceful fallback
    monkeypatch.setattr(evaluator, "_get_client", lambda: (_ for _ in ()).throw(Exception("Ollama offline")))
    
    hyde_doc = evaluator.generate_hyde_document("What is DORA lead time?")
    assert hyde_doc == "What is DORA lead time?"

def test_evaluate_retrieval_with_ground_truth():
    evaluator = PythonRAGEvaluator()
    test_case = {
        "eval_id": "EVAL-RAG-003",
        "ground_truth_context": ["Phoenix milestone roadmap"]
    }
    retrieved = [
        {"content": "Project Phoenix milestone roadmap outlines Q3 goals."}
    ]
    
    result = evaluator.evaluate_retrieval(test_case, retrieved)
    assert result["eval_id"] == "EVAL-RAG-003"
    assert result["context_recall"] == 1.0
    assert result["context_precision"] == 1.0
    assert result["rrf_synergy_lift"] > 0
