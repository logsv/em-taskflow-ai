"""
CLI Runner for Modular Evaluation Engine
"""

import sys
import json
import logging
import argparse
from evals.ragas_triad import run_ragas_evaluation
from evals.pairwise_arena import PairwiseArenaJudge
from evals.dataset_loader import load_prompt_matrix_cases, load_golden_dataset

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("eval_cli")


def main():
    parser = argparse.ArgumentParser(description="EM TaskFlow AI Modular Evaluation Engine")
    parser.add_argument("--mode", choices=["ragas", "arena", "matrix", "full"], default="full", help="Evaluation mode to run")
    parser.add_argument("--limit", type=int, default=10, help="Number of queries to evaluate")
    parser.add_argument("--model", type=str, default="hermes3:8b", help="Target model name")
    args = parser.parse_args()

    logger.info(f"🧪 Running evaluation mode: '{args.mode}' on model '{args.model}' (limit: {args.limit})")

    results = {}
    if args.mode in ["ragas", "full"]:
        logger.info("📊 Executing Ragas Full RAG Triad...")
        results["ragas"] = run_ragas_evaluation(sync_to_langfuse=True)

    if args.mode in ["arena", "full"]:
        logger.info("⚔️ Executing Pairwise Arena Calibration...")
        judge = PairwiseArenaJudge(model_name=args.model)
        results["arena"] = judge.evaluate({
            "candidate_a": "### 📄 Executive Summary\nP0 SLA is 5 mins.",
            "candidate_b": "Acknowledge in 5m.",
        })

    if args.mode in ["matrix", "full"]:
        cases = load_prompt_matrix_cases(limit=args.limit)
        results["matrix_cases_count"] = len(cases)

    print("\n✅ Evaluation Results:")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
