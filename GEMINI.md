# Gemini CLI

This document outlines the architecture of the Gemini CLI backend agent.

## Agent Architecture

The backend agent uses a sophisticated, multi-stage architecture to process user queries and interact with various tools and services. The core of this architecture is a dynamic supervisor that orchestrates the workflow based on the user's intent.

### 1. LLM Router

All user queries are first processed by a dedicated LLM router. The router's primary responsibility is to analyze the user's intent and determine which domain(s) of knowledge are required to answer the query. The possible domains include:

-   Jira
-   GitHub
-   Notion
-   Google Calendar
-   RAG (Retrieval-Augmented Generation) for document-based knowledge

The router outputs a structured JSON object that specifies the required domains, whether specific tools must be used, and a confidence score for its decision.

### 2. Supervisor

The supervisor receives the plan from the LLM router and executes it. It is responsible for:

-   Invoking the appropriate agent(s) based on the router's plan.
-   Orchestrating multi-agent calls for cross-domain queries.
-   Enforcing a "no tool call, no claim" policy to ensure that all information is backed by evidence from the appropriate tool.
-   Asking for clarification from the user if the router's confidence score is low.

### 3. Specialized Agents

Each domain has a specialized agent with prompts tailored for that domain. These agents are responsible for interacting with their respective tools and services and returning structured data to the supervisor.

-   **Jira Agent**: Focuses on sprint health, blockers, assignee risk, and overdue trends.
-   **GitHub Agent**: Focuses on PR aging, review bottlenecks, and release risk.
-   **Calendar Agent**: Focuses on conflict detection, meeting load, and focus-time risk.
-   **Notion Agent**: Focuses on project status synthesis, gaps, and missing owners/dates.
-   **RAG Agent**: Retrieves information from a knowledge base of documents.

### 4. Standardized Output

The supervisor synthesizes the data from the agents and generates a standardized output with the following sections:

-   **Executive Summary**: A high-level summary of the findings.
-   **Key Risks/Blockers**: A list of key risks and blockers identified.
-   **What Needs Decision**: A list of items that require a decision.
-   **Action Items**: A list of action items with owners and due dates.
-   **Evidence by Source**: The evidence for the findings, attributed to the source (Jira, GitHub, etc.).

This architecture allows the Gemini CLI to handle a wide range of queries with high accuracy and to provide users with actionable insights.
