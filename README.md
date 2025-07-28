# EM TaskFlow

## Overview
EM TaskFlow is an AI-powered productivity tool that now supports Retrieval-Augmented Generation (RAG) using your own PDF documents. You can upload PDFs, and then ask questions in chat—answers are generated using both your documents and a local LLM (Ollama).

---

## Features
- **Chat with your PDFs:** Ask questions and get answers grounded in your uploaded documents.
- **PDF Upload:** Easily upload and manage your knowledge sources.
- **Local-first:** Uses local Ollama for LLM and embeddings, and Chroma for vector storage (no cloud required).
- **Toggle UI:** Switch between Chat and PDF Upload interfaces.
- **TypeScript Backend:** The backend has been migrated to TypeScript for better code quality and maintainability.
- **Integrated Task Management:** Connect with Jira, Notion, and Google Calendar through MCP integration.
- **Smart Suggestions:** Get AI-powered suggestions for your tasks and projects.

---

## Setup Instructions

### 1. Prerequisites
- **Node.js** (v16+ recommended)
- **Python 3.8+** (for Chroma)
- **Ollama** (installed and running locally)
- **ChromaDB** (Python package, running as a local service)

### 2. Install Dependencies

#### Backend
```sh
cd backend
npm install
```

#### Frontend
```sh
cd ../frontend
npm install
```

#### Chroma (Vector DB)
```sh
pip install chromadb
```

### 3. Build TypeScript Backend

#### Compile TypeScript
```sh
cd backend
npm run build
```

### 4. Start Services

#### Start Ollama (LLM & Embeddings)
- Make sure you have Ollama installed: https://ollama.com/
- Start Ollama:
  ```sh
  ./start-ollama.sh
  ```
- Pull required models:
  ```sh
  ollama pull deepseek-r1:latest
  ollama pull nomic-embed-text
  ```

#### Start Chroma (Vector DB)
```sh
chromadb run --path ./chroma-data
```

#### Start Backend
```sh
cd backend
npm start
```

#### Start Frontend
```sh
cd ../frontend
npm start
```

#### All Services (Convenience Scripts)
- **Start all services (Ollama, Chroma, Backend, Frontend):**
  ```sh
  ./start.sh
  ```
- **Stop all running services:**
  ```sh
  ./stop.sh
  ```
- **Manage individual services (start/stop/restart):**
  ```sh
  ./manage-services.sh
  ```

---

## Usage

1. **Open the app in your browser** (usually at http://localhost:3000).
2. **Toggle between Chat and PDF Upload** using the buttons in the NavBar or main page.
3. **Upload PDFs** in the PDF Upload view. Wait for confirmation.
4. **Switch to Chat** and ask questions. The system will use your PDFs to answer.
5. **Sources** for each answer are shown below the response.
6. **Task Management** features can be accessed through the integrated tools.

---

## Notes
- All processing is local: your PDFs and queries never leave your machine.
- Make sure both Ollama and Chroma are running before uploading PDFs or chatting.
- You can extend this setup to use OpenAI or cloud vector DBs in the future.
- The backend is now written in TypeScript, which provides better type safety and code maintainability.
- For task management features, ensure MCP servers are properly configured and running.

---

## Troubleshooting
- **Ollama or Chroma not running:** Make sure both services are started before using the app.
- **PDF upload fails:** Check backend logs for errors.
- **No answers or irrelevant answers:** Try uploading more relevant PDFs or check that embeddings are being generated.
- **TypeScript compilation errors:** Check that all dependencies are installed and TypeScript files are correctly formatted.
- **MCP integration issues:** Verify that MCP servers are running and properly configured.

---

## License
MIT
