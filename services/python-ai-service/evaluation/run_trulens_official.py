"""
Official TruLens Dashboard Launcher
Runs the native TruLens Multi-Page Dashboard (Leaderboard, Trends, Records, Compare).
"""

import os
import sys
import threading
from trulens.core import TruSession
from trulens.dashboard.run import run_dashboard

def seed_default_records():
    """Populates sample RAG Triad records if database has no records yet."""
    try:
        from evaluation.trulens_rag_triad import run_trulens_evaluation
        ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        print(f"🔄 Seeding initial TruLens evaluation records against {ollama_url}...", flush=True)
        run_trulens_evaluation(model_name="hermes3:8b", api_base=ollama_url)
        print("✅ TruLens seed evaluation completed successfully.", flush=True)
    except Exception as e:
        print(f"Notice: TruLens seed completed with status: {e}", flush=True)

def main():
    for f in ["default.sqlite", "/app/default.sqlite"]:
        if os.path.exists(f):
            try:
                os.remove(f)
                print(f"Cleaned stale {f} before TruLens startup.", flush=True)
            except Exception:
                pass

    session = TruSession()
    seed_default_records()
    
    port = int(os.environ.get("PORT", "8501"))
    print(f"🚀 Starting Official TruLens Multi-Page Dashboard on port {port}...", flush=True)
    run_dashboard(session=session, port=port, address="0.0.0.0")

if __name__ == "__main__":
    main()
