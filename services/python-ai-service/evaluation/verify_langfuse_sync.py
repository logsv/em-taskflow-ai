"""
Verification Script for Langfuse DB Synchronization
Directly creates a test trace, generation, and evaluation score using the official Langfuse Python SDK.
"""

import os
import sys
import logging
from dotenv import load_dotenv

# Load local environment
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_langfuse_sync():
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")
    host = os.getenv("LANGFUSE_HOST", "http://localhost:3001")

    logger.info(f"🔍 Testing Langfuse Sync to host={host}, public_key={public_key[:8]}...")

    try:
        from langfuse import Langfuse
        langfuse = Langfuse(
            public_key=public_key,
            secret_key=secret_key,
            host=host,
        )

        # 1. Create a test trace
        trace = langfuse.trace(
            name="test_evaluation_sync",
            user_id="test_runner",
            metadata={"environment": "development", "eval_tool": "ragas/deepeval"},
        )
        logger.info(f"✅ Created Langfuse trace: id={trace.id}")

        # 2. Attach a generation span
        generation = trace.generation(
            name="test_synthesis",
            model="hermes3:8b",
            input="What is DORA deployment frequency?",
            output="DORA deployment frequency measures how often an organization successfully releases to production.",
        )
        logger.info(f"✅ Created Langfuse generation: id={generation.id}")

        # 3. Add an evaluation score
        langfuse.score(
            trace_id=trace.id,
            name="ragas_faithfulness",
            value=1.0,
            comment="Automated verification test score",
        )
        logger.info("✅ Created Langfuse score: ragas_faithfulness=1.0")

        # 4. Flush the client
        langfuse.flush()
        logger.info("🚀 Successfully flushed trace and score to Langfuse DB!")
        return True

    except Exception as e:
        logger.error(f"❌ Langfuse sync failed: {e}")
        return False


if __name__ == "__main__":
    success = test_langfuse_sync()
    sys.exit(0 if success else 1)
