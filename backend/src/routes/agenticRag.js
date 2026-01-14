import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { agenticRetrieve, ingestPDF, getIngestStatus } from "../rag/index.js";
import { getBgeEmbeddings, getBgeReranker } from "../llm/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const pdfDir = path.join(__dirname, "../../../data/pdfs/");
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}
const upload = multer({ dest: pdfDir });

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

router.post("/upload-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log("📄 Processing PDF with enhanced agentic RAG:", req.file.originalname);

    const result = await withTimeout(
      ingestPDF(req.file.path, req.file.originalname || "unknown.pdf"),
      120000,
      "PDF processing timed out after 2 minutes",
    );

    if (result.success) {
      res.json({
        status: "success",
        message: `PDF processed successfully with enhanced agentic RAG. Created ${result.chunks} token-aware chunks.`,
        chunks: result.chunks,
        filename: req.file.originalname,
        features: [
          "Token-aware recursive chunking",
          "Enhanced metadata preservation",
          "Optimized ChromaDB storage with HNSW",
          "BGE-M3 embeddings (if available)",
          "Ready for agentic retrieval",
        ],
      });
    } else {
      res.status(500).json({
        error: "Failed to process PDF with enhanced agentic RAG",
        details: result.error,
      });
    }
  } catch (err) {
    console.error("❌ Enhanced PDF upload error:", err);
    const message = err.message;
    const status = message.includes("timed out") ? 504 : 500;
    res.status(status).json({ error: message });
  }
});

router.post("/query", async (req, res) => {
  try {
    const {
      query,
      enableQueryRewriting = true,
      enableCompression = true,
      enableReranking = true,
      maxQueries = 3,
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    console.log("🔍 Processing agentic RAG query:", query.slice(0, 100) + "...");

    const result = await withTimeout(
      agenticRetrieve(query, {
        enableQueryRewriting,
        enableCompression,
        enableReranking,
        maxQueries,
      }),
      180000,
      "Agentic RAG query timed out after 3 minutes",
    );

    res.json({
      answer: result.answer,
      sources: result.sources.map((doc) => ({
        content: doc.pageContent.slice(0, 500) + "...",
        metadata: doc.metadata,
      })),
      originalQuery: result.originalQuery,
      rewrittenQueries: result.rewrittenQueries,
      relevanceScores: result.relevanceScores,
      compressionApplied: result.compressionApplied,
      reranked: result.reranked,
      executionTime: result.executionTime,
      message: "Response generated using enhanced agentic RAG pipeline",
      features_used: [
        enableQueryRewriting ? "Multi-query expansion" : null,
        "Token-aware chunking",
        "ChromaDB vector search with HNSW",
        result.reranked ? "BGE cross-encoder reranking" : "Lexical reranking",
        result.compressionApplied ? "Contextual compression" : null,
        "LLM answer generation",
      ].filter(Boolean),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Agentic RAG query error:", error);
    const message = error.message;
    const status = message.includes("timed out") ? 504 : 500;
    res.status(status).json({ error: message });
  }
});

router.post("/search", async (req, res) => {
  try {
    const { query, top_k = 8 } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    console.log("🔍 Performing enhanced document search:", query);

    const { simpleRetrieve } = await import("../rag/index.js");
    const result = await withTimeout(
      simpleRetrieve(query, top_k),
      60000,
      "Document search timed out after 1 minute",
    );

    res.json({
      results: result,
      message: "Enhanced document search completed",
      query,
      features_used: [
        "Token-aware chunking",
        "Multi-query expansion",
        "BGE-M3 embeddings (if available)",
        "ChromaDB vector search",
        "Cross-encoder reranking (if available)",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Document search error:", error);
    const message = error.message;
    const status = message.includes("timed out") ? 504 : 500;
    res.status(status).json({ error: message });
  }
});

router.get("/status", async (req, res) => {
  try {
    const bgeEmbeddings = getBgeEmbeddings();
    const bgeReranker = getBgeReranker();

    const [ragStatus, bgeEmbeddingsInfo, bgeRerankerInfo] = await Promise.all([
      getIngestStatus(),
      bgeEmbeddings.getInfo(),
      bgeReranker.getInfo(),
    ]);

    res.json({
      status: ragStatus,
      bge_services: {
        embeddings: bgeEmbeddingsInfo,
        reranker: bgeRerankerInfo,
      },
      message: "Enhanced agentic RAG service status",
      capabilities: [
        "Token-aware recursive chunking with overlaps",
        "Multi-query expansion and rewriting",
        "BGE-M3 embeddings (if microservice available)",
        "BGE-Reranker-v2-M3 cross-encoder reranking (if microservice available)",
        "Contextual compression with LLM",
        "ChromaDB vector store with HNSW optimization",
        "LangGraph agentic orchestration",
        "Retrieval grading and hallucination detection",
      ],
      fallback_services: [
        "Ollama nomic-embed-text embeddings",
        "Lexical similarity reranking",
      ],
      recommendations:
        !(ragStatus.initialized && ragStatus.vectorStore)
          ? [
              !ragStatus.vectorStore ? "Start ChromaDB server" : null,
              !ragStatus.chromaClient ? "Start Ollama server with embedding model" : null,
              "Ensure Ollama server is running with LLM model",
            ].filter(Boolean)
          : ["Enhanced agentic RAG service is ready"],
    });
  } catch (error) {
    console.error("❌ Agentic RAG status error:", error);
    res.status(500).json({
      error: error.message,
      status: { ready: false },
    });
  }
});

router.get("/microservices", async (req, res) => {
  try {
    const bgeEmbeddings = getBgeEmbeddings();
    const bgeReranker = getBgeReranker();

    const [embeddingsHealth, rerankerHealth] = await Promise.allSettled([
      bgeEmbeddings.healthCheck(),
      bgeReranker.healthCheck(),
    ]);

    const embeddingsStatus =
      embeddingsHealth.status === "fulfilled"
        ? embeddingsHealth.value
        : { status: "unavailable", error: embeddingsHealth.reason.message };

    const rerankerStatus =
      rerankerHealth.status === "fulfilled"
        ? rerankerHealth.value
        : { status: "unavailable", error: rerankerHealth.reason.message };

    res.json({
      embeddings: {
        ...embeddingsStatus,
        url: "http://localhost:8001",
        description: "BGE-M3 multilingual embeddings",
      },
      reranker: {
        ...rerankerStatus,
        url: "http://localhost:8002",
        description: "BGE-Reranker-v2-M3 cross-encoder",
      },
      message: "BGE microservices status",
      setup_commands: [
        "cd python-services && ./start-services.sh",
        "Or manually: cd python-services/embeddings && python app.py",
        "And: cd python-services/reranker && python app.py",
      ],
    });
  } catch (error) {
    console.error("❌ Microservices status error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/test-embeddings", async (req, res) => {
  try {
    const { texts, normalize = true } = req.body;

    if (!texts || !Array.isArray(texts)) {
      return res.status(400).json({ error: "Texts array is required" });
    }

    if (texts.length > 10) {
      return res.status(400).json({ error: "Maximum 10 texts for testing" });
    }

    console.log("🧪 Testing BGE-M3 embeddings with", texts.length, "texts");

    const bgeEmbeddings = getBgeEmbeddings();
    const result = await withTimeout(
      bgeEmbeddings.embed(texts, normalize),
      30000,
      "Embeddings test timed out",
    );

    res.json({
      result,
      message: "BGE-M3 embeddings test completed",
      test_info: {
        input_texts: texts.length,
        embedding_dimensions: result.dimensions || "unknown",
        processing_time: result.processing_time || "unknown",
        model: result.model || "bge-m3",
      },
    });
  } catch (error) {
    console.error("❌ Embeddings test error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/test-reranker", async (req, res) => {
  try {
    const { query, documents, top_k = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({ error: "Documents array is required" });
    }

    if (documents.length > 20) {
      return res.status(400).json({ error: "Maximum 20 documents for testing" });
    }

    console.log("🧪 Testing BGE-Reranker with query and", documents.length, "documents");

    const rerankDocs = documents.map((doc) => ({
      content: typeof doc === "string" ? doc : doc.content || String(doc),
      metadata: typeof doc === "object" && doc.metadata ? doc.metadata : {},
    }));

    const bgeReranker = getBgeReranker();
    const result = await withTimeout(
      bgeReranker.rerank(query, rerankDocs, top_k, true),
      30000,
      "Reranking test timed out",
    );

    res.json({
      result,
      message: "BGE-Reranker-v2-M3 test completed",
      test_info: {
        query,
        input_documents: documents.length,
        returned_documents: result.returned_count || top_k,
        processing_time: result.processing_time || "unknown",
        model: result.model || "bge-reranker-v2-m3",
      },
    });
  } catch (error) {
    console.error("❌ Reranker test error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

