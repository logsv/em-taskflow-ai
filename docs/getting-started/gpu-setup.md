# Hardware & GPU Setup

EM TaskFlow AI runs 100% locally via **Ollama**. Achieving optimal token generation speeds (<30ms time-to-first-token and >40 tokens/sec) depends on hardware configuration and GPU acceleration.

---

## 🍏 Apple Silicon (Metal Acceleration)

Apple Silicon (M1/M2/M3/M4 Pro, Max, and Ultra) provides unified memory architecture (UMA) that is ideal for local SLM inference.

### Configuration
1. Install Ollama via Homebrew or official installer:
   ```bash
   brew install ollama
   ```
2. Start Ollama service:
   ```bash
   ollama serve
   ```
3. Ollama automatically leverages Apple Metal GPU acceleration out-of-the-box.
4. Verify GPU layer offload in Ollama logs:
   ```bash
   ollama run hermes3:8b --verbose
   ```
   Look for: `llama_model_loader: loaded 33 layers to Metal GPU`.

---

## 🐧 Linux & Windows (NVIDIA CUDA Acceleration)

### Prerequisites
- NVIDIA Driver version 525+ 
- CUDA Toolkit 12.0+
- NVIDIA Container Toolkit (for Dockerized Ollama setups)

### Configuration for Native Host Ollama
1. Install the official Ollama binary:
   ```bash
   curl -fsSL https://ollama.ai/install.sh | sh
   ```
2. Set Ollama environment variables for multi-threading and context window length:
   ```bash
   export OLLAMA_NUM_PARALLEL=4
   export OLLAMA_MAX_LOADED_MODELS=3
   ollama serve
   ```

---

## 🧠 Memory & VRAM Sizing Matrix

| Model | Parameter Size | Quantization | Recommended VRAM / Unified RAM | Typical Inference Speed |
| :--- | :--- | :--- | :--- | :--- |
| **`hermes3:8b`** *(Default)* | 8 Billion | Q4_K_M | 8 GB | ~45-65 tokens/sec |
| **`mistral:7b`** | 7 Billion | Q4_K_M | 6 GB | ~50-70 tokens/sec |
| **`nomic-embed-text`** | 137 Million | FP16 | 1 GB | <15ms per vector |
| **`qwen3-vl`** *(OCR/Vision)* | 4 Billion | Q4_K_M | 5 GB | ~30 tokens/sec |
