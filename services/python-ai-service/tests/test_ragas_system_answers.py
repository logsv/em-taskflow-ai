"""The Ragas runner must score answers produced by the system, never hand-written ones."""
from evaluation import ragas_runner


def test_generates_answers_and_contexts_from_the_backend():
    calls = []

    def fake_post(url, body):
        calls.append((url, body))
        return {"answer": f"answer to {body['message'][:10]}", "sources": [{"content": "ctx A"}, {"content": ""}]}

    records, errors = ragas_runner.generate_system_answers(ragas_runner.DEFAULT_EVAL_QUESTIONS, backend_url="http://x:4000/", post=fake_post)
    assert errors == []
    assert len(records) == len(ragas_runner.DEFAULT_EVAL_QUESTIONS)
    assert calls[0][0] == "http://x:4000/api/v1/chat"
    assert records[0]["contexts"] == ["ctx A"]
    assert records[0]["answer"].startswith("answer to")
    assert all("answer" not in q for q in ragas_runner.DEFAULT_EVAL_QUESTIONS)


def test_backend_failure_means_no_scores(monkeypatch):
    def boom(questions):
        return [], ["P0 SOP: connection refused"]

    monkeypatch.setattr(ragas_runner, "generate_system_answers", boom)
    result = ragas_runner.run_ragas_evaluation(sync_to_langfuse=False)
    assert result["status"] == "FAILED"
    assert result["faithfulness"] is None
    assert result["answers_source"] == "system"


def test_empty_answer_is_an_error():
    records, errors = ragas_runner.generate_system_answers([{"question": "q", "ground_truth": "g"}], post=lambda u, b: {"answer": ""})
    assert records == [] and errors and "empty answer" in errors[0]
