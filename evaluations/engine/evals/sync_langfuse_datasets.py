"""
Langfuse Dataset Synchronizer
Uploads local JSON datasets (golden-dataset.json, prompt-matrix-cases.json)
to the running self-hosted Langfuse server (:3001) as first-class Langfuse Datasets.
"""

import os
import json
import logging
from dotenv import load_dotenv

load_dotenv()

from evals.dataset_loader import load_golden_dataset, load_prompt_matrix_cases

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("langfuse_dataset_sync")


def sync_all_datasets_to_langfuse():
    host = os.getenv("LANGFUSE_HOST", "http://localhost:3001")
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")

    if not public_key or not secret_key:
        logger.error("❌ LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY not set in environment!")
        return False

    try:
        from langfuse import Langfuse
        langfuse = Langfuse(public_key=public_key, secret_key=secret_key, host=host)
    except Exception as e:
        logger.error(f"❌ Failed to initialize Langfuse client: {e}")
        return False

    logger.info(f"🔗 Connected to Langfuse at {host}")

    # 1. Sync Golden Dataset
    golden_items = load_golden_dataset()
    logger.info(f"📦 Loaded {len(golden_items)} items from golden-dataset.json")

    try:
        langfuse.create_dataset(
            name="golden-dataset",
            description="EM TaskFlow AI Golden Evaluation Benchmark Dataset across 10 Domain Micro-Agents, RAG, and Fast-Path.",
            metadata={"version": "1.0.0", "total_cases": len(golden_items), "system": "EM TaskFlow AI"}
        )
        logger.info("✅ Created/verified dataset 'golden-dataset' in Langfuse")
    except Exception as e:
        logger.info(f"ℹ️ Dataset 'golden-dataset' notice: {e}")

    golden_synced = 0
    for item in golden_items:
        try:
            langfuse.create_dataset_item(
                dataset_name="golden-dataset",
                input={
                    "query": item.get("user_query", ""),
                    "conversation_history": item.get("conversation_history", []),
                },
                expected_output={
                    "expected_domains": item.get("expected_domains", []),
                    "expected_tool_calls": item.get("expected_tool_calls", []),
                    "ground_truth_context": item.get("ground_truth_context", []),
                },
                metadata={
                    "eval_id": item.get("eval_id", ""),
                    "domain_category": item.get("domain_category", ""),
                    "is_rag_appropriate": item.get("is_rag_appropriate", False),
                    "success_criteria_gates": item.get("success_criteria_gates", {}),
                }
            )
            golden_synced += 1
        except Exception as e:
            logger.warning(f"⚠️ Failed to create dataset item {item.get('eval_id')}: {e}")

    logger.info(f"🎉 Synced {golden_synced}/{len(golden_items)} items into Langfuse dataset 'golden-dataset'!")

    # 2. Sync Prompt Matrix Cases
    matrix_cases = load_prompt_matrix_cases(limit=100)
    logger.info(f"📦 Loaded {len(matrix_cases)} items from prompt-matrix-cases.json")

    try:
        langfuse.create_dataset(
            name="prompt-matrix-cases",
            description="Multi-Turn Prompt Matrix Benchmark Cases for Durable Temporal Batch Evaluations.",
            metadata={"version": "1.0.0", "total_cases": len(matrix_cases), "system": "EM TaskFlow AI"}
        )
        logger.info("✅ Created/verified dataset 'prompt-matrix-cases' in Langfuse")
    except Exception as e:
        logger.info(f"ℹ️ Dataset 'prompt-matrix-cases' notice: {e}")

    matrix_synced = 0
    for case in matrix_cases:
        try:
            langfuse.create_dataset_item(
                dataset_name="prompt-matrix-cases",
                input={
                    "prompt": case.get("prompt", ""),
                },
                expected_output={
                    "domain": case.get("domain", ""),
                    "expected_tool": case.get("expected_tool", ""),
                    "must_contain": case.get("must_contain", []),
                },
                metadata={
                    "case_id": case.get("id", ""),
                    "domain": case.get("domain", ""),
                }
            )
            matrix_synced += 1
        except Exception as e:
            logger.warning(f"⚠️ Failed to create matrix item {case.get('id')}: {e}")

    logger.info(f"🎉 Synced {matrix_synced}/{len(matrix_cases)} items into Langfuse dataset 'prompt-matrix-cases'!")

    langfuse.flush()
    logger.info("🚀 All datasets successfully flushed to Langfuse!")
    return True


if __name__ == "__main__":
    sync_all_datasets_to_langfuse()
