import pytest
from evaluation.llm_judge import (
    LLMJudgeFactory,
    GEvalSingleAnswerJudge,
    PairwiseArenaJudge,
    calculate_human_judge_calibration,
)

def test_llm_judge_factory_creates_geval():
    judge = LLMJudgeFactory.create_judge("geval", model_name="hermes3:8b")
    assert isinstance(judge, GEvalSingleAnswerJudge)
    assert judge.model_name == "hermes3:8b"

def test_llm_judge_factory_creates_pairwise():
    judge = LLMJudgeFactory.create_judge("pairwise", model_name="hermes3:8b")
    assert isinstance(judge, PairwiseArenaJudge)
    assert judge.model_name == "hermes3:8b"

def test_llm_judge_factory_raises_on_invalid():
    with pytest.raises(ValueError, match="Unknown judge type"):
        LLMJudgeFactory.create_judge("invalid_type")

def test_geval_single_answer_evaluates():
    judge = LLMJudgeFactory.create_judge("geval")
    result = judge.evaluate({
        "query": "What are our sprint blockers?",
        "response": "### 📄 Executive Summary\nHere are the blockers:\n### 🔍 Key Document Analysis\nIssue #123.\n### 📌 Source Citations\n[Doc 1]",
        "context": "Blocker info"
    })
    assert result["score"] == 5
    assert result["faithfulness"] == 0.95
    assert "hermes3:8b" in result["reasoning"] or "G-Eval" in result["reasoning"]

def test_pairwise_arena_evaluates():
    judge = LLMJudgeFactory.create_judge("pairwise")
    result = judge.evaluate({
        "candidate_a": "Detailed response with structured markdown summary and analysis.",
        "candidate_b": "Short text."
    })
    assert result["winner"] == "A"
    assert result["position_bias_mitigated"] is True

def test_human_judge_calibration():
    human = [4.0, 5.0, 3.0, 2.0, 5.0]
    judge = [4.0, 5.0, 3.0, 2.0, 4.0]
    res = calculate_human_judge_calibration(human, judge)
    assert "kendall_tau" in res
    assert res["kendall_tau"] > 0.5
