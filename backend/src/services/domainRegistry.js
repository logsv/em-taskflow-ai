/**
 * DomainRegistry - Pluggable registry for workspace and RAG domains
 * Adheres to Open/Closed Principle (OCP) for seamless extension to Jira, Notion, Calendar, etc.
 */

export const DOMAIN_TYPES = Object.freeze({
  DIRECT_LLM: 'direct_llm',
  RAG: 'rag',
  GITHUB: 'github',
  JIRA: 'jira',
  NOTION: 'notion',
  CALENDAR: 'calendar',
});

export const VALID_DOMAINS = new Set([
  DOMAIN_TYPES.GITHUB,
  DOMAIN_TYPES.JIRA,
  DOMAIN_TYPES.NOTION,
  DOMAIN_TYPES.CALENDAR,
  DOMAIN_TYPES.RAG,
]);

class DomainRegistry {
  constructor() {
    this.registeredDomains = new Map();
    this.registerDefaults();
  }

  registerDefaults() {
    this.registerDomain(DOMAIN_TYPES.GITHUB, {
      name: 'GitHub',
      icon: '🐙',
      mcpTools: ['search_issues', 'list_pull_requests', 'search_code'],
      dbTable: 'github_issues',
      enabled: true,
    });

    this.registerDomain(DOMAIN_TYPES.JIRA, {
      name: 'Jira',
      icon: '🎟️',
      mcpTools: ['get_jira_issues', 'get_sprint_health'],
      dbTable: 'jira_issues',
      enabled: false, // Extensible feature flag
    });

    this.registerDomain(DOMAIN_TYPES.NOTION, {
      name: 'Notion',
      icon: '📝',
      mcpTools: ['search_notion_pages', 'get_notion_page'],
      dbTable: 'notion_pages',
      enabled: false,
    });

    this.registerDomain(DOMAIN_TYPES.CALENDAR, {
      name: 'Google Calendar',
      icon: '📅',
      mcpTools: ['get_calendar_events', 'create_event'],
      dbTable: 'calendar_events',
      enabled: false,
    });

    this.registerDomain(DOMAIN_TYPES.RAG, {
      name: 'Document Knowledge Base',
      icon: '📄',
      mcpTools: ['rag_db_query_retriever'],
      dbTable: 'pdf_chunks',
      enabled: true,
    });
  }

  registerDomain(domainKey, domainConfig) {
    this.registeredDomains.set(domainKey, {
      domainKey,
      ...domainConfig,
    });
  }

  getDomain(domainKey) {
    return this.registeredDomains.get(domainKey) || null;
  }

  getActiveDomains() {
    return Array.from(this.registeredDomains.values()).filter((d) => d.enabled);
  }

  isValidDomain(domainKey) {
    return VALID_DOMAINS.has(domainKey);
  }
}

const domainRegistry = new DomainRegistry();
export default domainRegistry;
