# EM TaskFlow

[![Backend CI](https://github.com/logsv/em-taskflow-ai/workflows/Backend%20CI/badge.svg)](https://github.com/logsv/em-taskflow-ai/actions/workflows/backend-ci.yml)
[![Tests](https://github.com/logsv/em-taskflow-ai/workflows/Tests/badge.svg)](https://github.com/logsv/em-taskflow-ai/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/logsv/em-taskflow-ai/branch/main/graph/badge.svg?token=06702858-ae4c-43e8-aa1e-6184e359cfb2)](https://codecov.io/gh/logsv/em-taskflow-ai)

**EM TaskFlow** is a production-ready AI-powered productivity platform. It combines **Retrieval-Augmented Generation (RAG)**, **Model Context Protocol (MCP)**, and **Multi-Agent Orchestration** to help you manage tasks and knowledge across Notion, Jira, GitHub, and Google Calendar.

## 🚀 Key Features

- **Multi-Agent System**: Supervisor architecture orchestrating specialist agents for Jira, GitHub, and Notion.
- **Production-Ready MCP**: Reliable integration with external tools using `@langchain/mcp-adapters`.
- **Advanced RAG**: Semantic search and document processing using embeddings and ChromaDB.
- **Local-First AI**: Optimized for Ollama but supports OpenAI, Anthropic, and Gemini via `llm-router`.
- **Modern Stack**: Node.js backend, React frontend, PWA support, and full TypeScript typing.

## 📂 Project Structure

- **[Backend](./backend/README.md)**: Node.js service containing the Agent Graph, RAG pipeline, and MCP integrations.
- **[Frontend](./frontend/README.md)**: React-based UI for chat, document management, and task visualization.

## ⚡ Quick Start

1. **Prerequisites**: Node.js 20+, Python 3.8+, Ollama (running).
2. **Install Dependencies**:
   ```bash
   # Backend
   cd backend && pnpm install
   # Frontend
   cd ../frontend && npm install
   ```
3. **Start All Services**:
   ```bash
   ./start.sh
   ```
   This script verifies dependencies, starts the backend and frontend, and initializes local AI models.

4. **Access the App**: Open [http://localhost:3000](http://localhost:3000).

## 📚 Documentation

For detailed architecture, configuration, and API documentation, please refer to the sub-project READMEs:

- [Backend Documentation & Architecture](./backend/README.md)
- [Frontend Documentation](./frontend/README.md)

## 📄 License
MIT License
