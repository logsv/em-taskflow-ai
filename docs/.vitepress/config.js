import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(
  defineConfig({
    title: 'EM TaskFlow AI',
    description: 'Full-Stack, Local-First Enterprise Productivity Platform powered by 100% Local SLM Inference, Hybrid RAG, Multi-Source MCP, and Database Isolation',
    base: '/em-taskflow-ai/',
    lastUpdated: true,
    cleanUrls: true,
    ignoreDeadLinks: true,
    srcExclude: ['**/node_modules/**', '**/node_modules/**/*', 'node_modules/**/*'],
    head: [
      ['link', { rel: 'icon', href: '/favicon.ico' }],
      ['meta', { name: 'theme-color', content: '#38bdf8' }]
    ],
    mermaid: {
      theme: 'dark',
      darkMode: true
    },
    mermaidPlugin: {
      class: 'mermaid'
    },
    themeConfig: {
      logo: '⚡',
      siteTitle: 'EM TaskFlow AI',
      nav: [
        { text: 'Getting Started', link: '/getting-started/overview' },
        {
          text: 'Architecture ▾',
          items: [
            { text: 'High-Level Design & Pipeline', link: '/architecture/high-level-design' },
            { text: '5-Tier Production Caching Suite', link: '/architecture/redis-semantic-cache' },
            { text: 'Pre-LLM Preprocessing & Compression', link: '/architecture/pre-llm-compression' },
            { text: 'LangGraph Multi-Agent Supervisor', link: '/architecture/langgraph-supervisor' },
            { text: 'Autonomous SOP Governance Agent', link: '/architecture/sop-governance-agent' },
            { text: 'Production Hybrid RAG & Python AI', link: '/architecture/hybrid-rag' },
            { text: 'Database Per-Service Isolation', link: '/architecture/database-isolation' },
            { text: 'Architecture Decision Records (ADRs)', link: '/architecture/adrs' }
          ]
        },
        {
          text: 'Autonomous Jobs ▾',
          items: [
            { text: 'Autonomous EM Task & Health Audit', link: '/autonomous-jobs/autonomous-audit-engine' },
            { text: 'Autonomous Action Item Formulation', link: '/autonomous-jobs/autonomous-action-creation' },
            { text: 'Durable Human-in-the-Loop (HITL) Slack Post', link: '/autonomous-jobs/durable-hitl-workflows' },
            { text: 'Cross-Platform Team Auto-Discovery', link: '/autonomous-jobs/team-auto-discovery' },
            { text: 'Temporal Event-Driven & Scheduled Jobs', link: '/autonomous-jobs/temporal-event-driven-jobs' }
          ]
        },
        {
          text: 'UI & Cockpit ▾',
          items: [
            { text: 'Frontend Architecture & Tokens', link: '/frontend/overview' },
            { text: 'Low-Distraction EM Copilot (⌘K)', link: '/frontend/copilot-chat' },
            { text: 'Interactive EM Action Hub (/actions)', link: '/frontend/action-hub' },
            { text: 'Standalone Operator Admin Portal (/admin)', link: '/frontend/admin-portal' }
          ]
        },
        {
          text: 'MCP Integrations ▾',
          items: [
            { text: 'MCP Architecture & Circuit Breakers', link: '/mcp-integrations/overview' },
            { text: 'Atlassian Jira OAuth 2.0 PKCE', link: '/mcp-integrations/jira' },
            { text: 'Notion REST API & OAuth', link: '/mcp-integrations/notion' },
            { text: 'GitHub Scoped PAT & OAuth', link: '/mcp-integrations/github' },
            { text: 'Slack Web API & Action Nudges', link: '/mcp-integrations/slack' },
            { text: 'Google Calendar Dynamic ID', link: '/mcp-integrations/google-calendar' }
          ]
        },
        {
          text: 'API Reference ▾',
          items: [
            { text: 'Canonical REST API (v1) Catalog', link: '/api-reference/rest-api' },
            { text: 'gRPC Protobuf Services', link: '/api-reference/grpc-protobuf' },
            { text: 'Multi-Session Persistence & Memory', link: '/api-reference/session-management' }
          ]
        },
        {
          text: 'Evaluations ▾',
          items: [
            { text: '3-Phase Evaluation Framework', link: '/evaluations/overview' },
            { text: 'Golden Dataset Curation', link: '/evaluations/golden-dataset' },
            { text: 'DeepEval, Ragas & LLM Judge Arena', link: '/evaluations/deepeval-ragas' },
            { text: 'EM Tau-Bench Multi-Turn Simulation', link: '/evaluations/em-tau-bench' },
            { text: 'Promptfoo Matrix & Temporal Benchmarks', link: '/evaluations/promptfoo-matrix' }
          ]
        },
        {
          text: 'Operations ▾',
          items: [
            { text: '🧰 Agent Skills & Playbooks', link: '/operations/agent-skills' },
            { text: 'Production Docker Deployment', link: '/operations/deployment' },
            { text: 'Database Backup & Credential Immunity', link: '/operations/backup-recovery' },
            { text: 'Telemetry & Observability', link: '/operations/telemetry' },
            { text: 'Troubleshooting & Diagnostics', link: '/operations/troubleshooting' }
          ]
        },
        { text: 'Swagger Explorer ↗', link: 'http://localhost:4000/api/v1/docs', target: '_blank' }
      ],
      sidebar: {
        '/getting-started/': [
          {
            text: '🚀 Getting Started',
            items: [
              { text: 'Platform Overview', link: '/getting-started/overview' },
              { text: 'Installation & Quickstart', link: '/getting-started/installation' },
              { text: 'Hardware & GPU Setup', link: '/getting-started/gpu-setup' }
            ]
          }
        ],
        '/architecture/': [
          {
            text: '🏛️ Architecture Blueprint',
            items: [
              { text: 'High-Level Design & Pipeline', link: '/architecture/high-level-design' },
              { text: '5-Tier Production Caching Suite', link: '/architecture/redis-semantic-cache' },
              { text: 'Pre-LLM Preprocessing & Compression', link: '/architecture/pre-llm-compression' },
              { text: 'LangGraph Multi-Agent Supervisor', link: '/architecture/langgraph-supervisor' },
              { text: 'Autonomous SOP Governance Agent', link: '/architecture/sop-governance-agent' },
              { text: 'Production Hybrid RAG & Python AI', link: '/architecture/hybrid-rag' },
              { text: 'Database Per-Service Isolation', link: '/architecture/database-isolation' },
              { text: 'Architecture Decision Records (ADRs)', link: '/architecture/adrs' }
            ]
          }
        ],
        '/autonomous-jobs/': [
          {
            text: '⚡ Autonomous Jobs & Workflows',
            items: [
              { text: 'Autonomous EM Task & Health Audit', link: '/autonomous-jobs/autonomous-audit-engine' },
              { text: 'Autonomous Action Item Formulation', link: '/autonomous-jobs/autonomous-action-creation' },
              { text: 'Durable HITL Slack Post Approval', link: '/autonomous-jobs/durable-hitl-workflows' },
              { text: 'Cross-Platform Team Auto-Discovery', link: '/autonomous-jobs/team-auto-discovery' },
              { text: 'Temporal Event-Driven & Scheduled Jobs', link: '/autonomous-jobs/temporal-event-driven-jobs' }
            ]
          }
        ],
        '/frontend/': [
          {
            text: '💻 UI & Cockpit Architecture',
            items: [
              { text: 'Frontend Architecture & Tokens', link: '/frontend/overview' },
              { text: 'Low-Distraction EM Copilot (⌘K)', link: '/frontend/copilot-chat' },
              { text: 'Interactive EM Action Hub (/actions)', link: '/frontend/action-hub' },
              { text: 'Standalone Operator Admin Portal (/admin)', link: '/frontend/admin-portal' }
            ]
          }
        ],
        '/mcp-integrations/': [
          {
            text: '🔌 Multi-Source MCP Suite',
            items: [
              { text: 'MCP Architecture & Circuit Breakers', link: '/mcp-integrations/overview' },
              { text: 'Atlassian Jira OAuth 2.0 PKCE', link: '/mcp-integrations/jira' },
              { text: 'Notion REST API & OAuth', link: '/mcp-integrations/notion' },
              { text: 'GitHub Scoped PAT & OAuth', link: '/mcp-integrations/github' },
              { text: 'Slack Web API & Action Nudges', link: '/mcp-integrations/slack' },
              { text: 'Google Calendar Dynamic ID', link: '/mcp-integrations/google-calendar' }
            ]
          }
        ],
        '/api-reference/': [
          {
            text: '📡 API & Protocol Reference',
            items: [
              { text: 'Canonical REST API (v1) Catalog', link: '/api-reference/rest-api' },
              { text: 'gRPC Protobuf Services', link: '/api-reference/grpc-protobuf' },
              { text: 'Multi-Session Persistence & Memory', link: '/api-reference/session-management' }
            ]
          }
        ],
        '/evaluations/': [
          {
            text: '🧪 Evaluation & Benchmarking',
            items: [
              { text: '3-Phase Evaluation Framework', link: '/evaluations/overview' },
              { text: 'Golden Dataset Curation', link: '/evaluations/golden-dataset' },
              { text: 'DeepEval, Ragas & LLM Judge Arena', link: '/evaluations/deepeval-ragas' },
              { text: 'EM Tau-Bench Multi-Turn Simulation', link: '/evaluations/em-tau-bench' },
              { text: 'Promptfoo Matrix & Temporal Benchmarks', link: '/evaluations/promptfoo-matrix' }
            ]
          }
        ],
        '/operations/': [
          {
            text: '🛠️ Operator & SRE Playbook',
            items: [
              { text: '🧰 Agent Skills & Playbooks', link: '/operations/agent-skills' },
              { text: 'Production Docker Deployment', link: '/operations/deployment' },
              { text: 'Database Backup & Credential Immunity', link: '/operations/backup-recovery' },
              { text: 'Telemetry & Observability', link: '/operations/telemetry' },
              { text: 'Troubleshooting & Diagnostics', link: '/operations/troubleshooting' }
            ]
          }
        ]
      },
      socialLinks: [
        { icon: 'github', link: 'https://github.com/logsv/em-taskflow-ai' }
      ],
      footer: {
        message: 'Released under the MIT License.',
        copyright: 'Copyright © 2026 EM TaskFlow AI'
      },
      search: {
        provider: 'local'
      }
    }
  })
);
