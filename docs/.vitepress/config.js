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
        { text: 'Architecture', link: '/architecture/high-level-design' },
        { text: 'MCP Integrations', link: '/mcp-integrations/overview' },
        { text: 'API Reference', link: '/api-reference/rest-api' },
        { text: 'Evaluations', link: '/evaluations/overview' },
        { text: 'Operations & Skills', link: '/operations/agent-skills' },
        { text: 'Swagger Explorer ↗', link: 'http://localhost:4000/api/docs', target: '_blank' }
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
              { text: 'LangGraph Multi-Agent Supervisor', link: '/architecture/langgraph-supervisor' },
              { text: 'Database Per-Service Isolation', link: '/architecture/database-isolation' },
              { text: 'Production Hybrid RAG Engine', link: '/architecture/hybrid-rag' },
              { text: 'Redis Semantic Caching', link: '/architecture/redis-semantic-cache' },
              { text: 'Architecture Decision Records (ADRs)', link: '/architecture/adrs' }
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
              { text: 'Slack Web API Bot', link: '/mcp-integrations/slack' },
              { text: 'Google Calendar Dynamic ID', link: '/mcp-integrations/google-calendar' }
            ]
          }
        ],
        '/api-reference/': [
          {
            text: '📡 API & Protocol Reference',
            items: [
              { text: 'REST API Catalog', link: '/api-reference/rest-api' },
              { text: 'gRPC Protobuf Services', link: '/api-reference/grpc-protobuf' },
              { text: 'Multi-Session Management', link: '/api-reference/session-management' }
            ]
          }
        ],
        '/evaluations/': [
          {
            text: '🧪 Evaluation & Benchmarking',
            items: [
              { text: '3-Phase Evaluation Framework', link: '/evaluations/overview' },
              { text: 'Golden Dataset Curation', link: '/evaluations/golden-dataset' },
              { text: 'DeepEval & Ragas Trajectories', link: '/evaluations/deepeval-ragas' },
              { text: 'Promptfoo Matrix Server', link: '/evaluations/promptfoo-matrix' }
            ]
          }
        ],
        '/operations/': [
          {
            text: '🛠️ Operator & SRE Playbook',
            items: [
              { text: '🧰 Agent Skills & Playbooks', link: '/operations/agent-skills' },
              { text: 'Production Docker Deployment', link: '/operations/deployment' },
              { text: 'Database Backup & Recovery', link: '/operations/backup-recovery' },
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
