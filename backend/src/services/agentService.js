import ragService from "../rag/index.js";
import { ensureLLMReady, getChatModel, getLLMStatus } from "../llm/index.js";
import { executeAgentQuery, checkAgentReadiness, getAgentTools } from "../agent/graph.js";
import { getRuntimeConfig } from "../config.js";
import { getRouterChain } from "../agent/llmRouter.js";
import { getGithubMCPTools, getGoogleMCPTools, getJiraMCPTools, getNotionMCPTools } from "../mcp/index.js";

const VALID_DOMAINS = new Set(["jira", "github", "notion", "calendar", "rag"]);
const TRANSFER_TOOL_PREFIX = "transfer_";
const RAG_TOOL_NAME = "rag_db_query_retriever";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableHash(input) {
  const text = String(input || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export class LangGraphAgentService {
  constructor() {
    this.initialized = false;
    this.tools = [];
    this.ragEnabled = false;
    this.domainToolNames = {
      jira: new Set(),
      github: new Set(),
      notion: new Set(),
      calendar: new Set(),
      rag: new Set([RAG_TOOL_NAME]),
    };
    this.runtimeMetrics = {
      totalQueries: 0,
      routerQueries: 0,
      enforcedQueries: 0,
      shadowQueries: 0,
      offQueries: 0,
      toolGroundedRequired: 0,
      toolGroundedMet: 0,
      unwantedRagInvocations: 0,
      lowConfidenceClarifications: 0,
    };
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    const runtime = getRuntimeConfig();
    const ragStatus = await ragService.getStatus().catch(() => ({ ready: false }));
    this.ragEnabled = !!ragStatus.ready;

    if (runtime.mode === "full") {
      const readiness = await checkAgentReadiness();
      if (!readiness.ready) {
        throw new Error(`Agent not ready: ${readiness.error || "unknown error"}`);
      }
      const { tools } = await getAgentTools();
      this.tools = tools;
      this.refreshDomainToolMap();
    }

    this.initialized = true;
  }

  async processQuery(userQuery, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    await this.ensureLlmReadyForQuery();

    this.runtimeMetrics.totalQueries += 1;
    const startTime = Date.now();
    const runtime = getRuntimeConfig();
    const routerRuntime = runtime.router || {};
    const ragMode = options.ragMode === "advanced" ? "advanced" : "baseline";
    const mcpReady = runtime.mode === "full" && this.tools.length > 0;
    const rollout = this.getRolloutDecision(options.threadId || userQuery, routerRuntime);

    const decision = {
      selectedPath: "llm-only",
      mcpReady,
      ragMode,
      ragHit: false,
      toolsUsed: [],
      routingPlan: null,
      rollout,
      policy: {
        violations: [],
        missingDomains: [],
        unexpectedDomains: [],
        invokedDomains: [],
      },
      reasons: [],
      needsClarification: false,
    };

    let result;
    if (runtime.mode === "rag_only") {
      const plan = await this.routeQueryPlan(userQuery, runtime.mode);
      decision.routingPlan = plan;
      this.runtimeMetrics.routerQueries += 1;
      result = await this.runRagOnlyPath(userQuery, ragMode, decision);
    } else if (rollout.mode === "off") {
      this.runtimeMetrics.offQueries += 1;
      decision.reasons.push("router_rollout_off");
      result = await this.runLegacyPath(userQuery, decision, options);
    } else if (rollout.mode === "shadow") {
      this.runtimeMetrics.shadowQueries += 1;
      this.runtimeMetrics.routerQueries += 1;
      const routingPlan = await this.routeQueryPlan(userQuery, runtime.mode);
      decision.routingPlan = routingPlan;
      decision.reasons.push("router_shadow_mode_not_enforced");
      result = await this.runLegacyPath(userQuery, decision, options);
    } else {
      this.runtimeMetrics.enforcedQueries += 1;
      this.runtimeMetrics.routerQueries += 1;
      const routingPlan = await this.routeQueryPlan(userQuery, runtime.mode);
      decision.routingPlan = routingPlan;

      if (routingPlan.confidence < (routerRuntime.lowConfidenceThreshold ?? 0.45)) {
        this.runtimeMetrics.lowConfidenceClarifications += 1;
        decision.selectedPath = "clarification";
        decision.needsClarification = true;
        result = this.buildClarificationResult(userQuery, routingPlan);
      } else {
        result = await this.runEnforcedPolicy(userQuery, routingPlan, decision, options);
      }
    }

    const evidenceBySource = this.buildEvidenceBySource({
      toolsUsed: decision.toolsUsed,
      sources: result.sources || [],
      routingPlan: decision.routingPlan,
    });
    const emResponse = await this.buildEmResponse(userQuery, result.answer || "", evidenceBySource, decision);
    const executionTime = Date.now() - startTime;
    const successGates = this.computeSuccessGates(routerRuntime.successGates || {});

    return {
      threadId: options.threadId || null,
      answer: emResponse.answer,
      sources: result.sources || [],
      meta: {
        executionTime,
        decision: {
          ...decision,
          successGates,
        },
      },
    };
  }

  async runRagOnlyPath(query, ragMode, decision) {
    const ragResult = await this.tryRag(query, ragMode);
    const ragHit = Array.isArray(ragResult?.sources) && ragResult.sources.length > 0;
    decision.ragHit = ragHit;
    if (ragHit) {
      decision.selectedPath = "rag+llm";
      return this.formatRagResult(ragResult);
    }
    decision.selectedPath = "llm-only";
    decision.reasons.push("rag_only_mode_no_hits");
    return this.runLlmExecutor(query);
  }

  async runLegacyPath(query, decision, options = {}) {
    const includeRagAgent = this.ragEnabled && options.includeRag !== false;
    const legacyResult = await executeAgentQuery(query, {
      threadId: options.threadId,
      includeRagAgent,
      maxIterations: 10,
    });
    decision.toolsUsed = toArray(legacyResult.toolsUsed);
    decision.selectedPath = includeRagAgent ? "legacy_supervisor_with_rag" : "legacy_supervisor_no_rag";
    return {
      answer: legacyResult.response || "No response generated.",
      sources: [],
    };
  }

  async runEnforcedPolicy(query, routingPlan, decision, options = {}) {
    const requiresWorkspaceDomains = this.requiresWorkspaceDomains(routingPlan);
    const forceToolUse = routingPlan.must_use_tools || requiresWorkspaceDomains;
    const allowRag = routingPlan.allow_rag && this.ragEnabled && options.includeRag !== false;
    const includeRagAgent = allowRag;
    let ragResult = { answer: "", sources: [] };

    if (allowRag && routingPlan.domains.includes("rag")) {
      ragResult = await this.tryRag(query, decision.ragMode);
      decision.ragHit = Array.isArray(ragResult?.sources) && ragResult.sources.length > 0;
      if (!decision.ragHit) {
        decision.reasons.push("rag_no_hits");
      }
    } else if (!routingPlan.allow_rag) {
      decision.reasons.push("rag_disallowed_by_router");
    }

    if (forceToolUse) {
      this.runtimeMetrics.toolGroundedRequired += 1;
    }

    if (decision.mcpReady && (forceToolUse || !decision.ragHit)) {
      const routedQuery = this.buildRoutedQuery(query, routingPlan);
      const supervisorResult = await executeAgentQuery(routedQuery, {
        threadId: options.threadId,
        includeRagAgent,
        maxIterations: 12,
      });
      decision.toolsUsed = toArray(supervisorResult.toolsUsed);

      const policy = this.validatePolicy(routingPlan, decision.toolsUsed, forceToolUse);
      decision.policy = policy;
      if (policy.violations.length === 0) {
        if (forceToolUse) {
          this.runtimeMetrics.toolGroundedMet += 1;
        }
        decision.selectedPath = includeRagAgent ? "router+supervisor(+rag)" : "router+supervisor";
        this.updateUnwantedRagMetric(routingPlan, policy.invokedDomains);
        return {
          answer: supervisorResult.response || "No response generated.",
          sources: decision.ragHit ? ragResult.sources || [] : [],
        };
      }

      decision.reasons.push("policy_violations_detected");
      decision.reasons.push(...policy.violations.map((v) => `policy:${v}`));
    } else if (forceToolUse && !decision.mcpReady) {
      decision.reasons.push("mcp_required_but_unavailable");
    }

    if (decision.ragHit && allowRag) {
      decision.selectedPath = "rag+llm";
      this.updateUnwantedRagMetric(routingPlan, new Set(["rag"]));
      return this.formatRagResult(ragResult);
    }

    if (forceToolUse) {
      decision.selectedPath = "tooling-required-fallback";
      return {
        answer:
          "I could not gather tool-backed workspace evidence for this request. Confirm connections for the requested systems and retry.",
        sources: [],
      };
    }

    decision.selectedPath = "llm-only";
    return this.runLlmExecutor(query);
  }

  async routeQueryPlan(query, runtimeMode) {
    if (runtimeMode === "rag_only") {
      return {
        domains: ["rag"],
        must_use_tools: false,
        allow_rag: true,
        confidence: 1,
        reasoning_summary: "Runtime mode enforces RAG-only routing.",
      };
    }

    try {
      const routerChain = getRouterChain();
      const rawPlan = await routerChain.invoke({ query });
      return this.normalizeRoutingPlan(rawPlan);
    } catch (error) {
      return this.getFallbackRoutingPlan("router_failed");
    }
  }

  normalizeRoutingPlan(rawPlan) {
    const inputDomains = toArray(rawPlan?.domains);
    const domains = Array.from(new Set(inputDomains.filter((domain) => VALID_DOMAINS.has(domain))));
    const confidence = Number(rawPlan?.confidence);
    const normalizedConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.2;
    const hasWorkspaceDomains = domains.some((domain) => domain !== "rag");

    return {
      domains,
      must_use_tools: hasWorkspaceDomains ? true : !!rawPlan?.must_use_tools,
      allow_rag: !!rawPlan?.allow_rag,
      confidence: normalizedConfidence,
      reasoning_summary: String(rawPlan?.reasoning_summary || "LLM router plan.").slice(0, 300),
    };
  }

  getFallbackRoutingPlan(reason) {
    return {
      domains: [],
      must_use_tools: false,
      allow_rag: false,
      confidence: 0.2,
      reasoning_summary: `Fallback routing plan: ${reason}.`,
    };
  }

  requiresWorkspaceDomains(plan) {
    return toArray(plan?.domains).some((domain) => domain !== "rag");
  }

  buildRoutedQuery(query, plan) {
    const domains = toArray(plan?.domains);
    const workspaceDomains = domains.filter((domain) => domain !== "rag");
    return [
      "Routing policy (must follow):",
      `Selected domains: ${domains.length > 0 ? domains.join(", ") : "none"}.`,
      workspaceDomains.length > 0
        ? `Use only these workspace domains: ${workspaceDomains.join(", ")}.`
        : "No workspace domain selected.",
      plan?.must_use_tools
        ? "At least one relevant workspace tool call is required before finalizing facts."
        : "Tool calls are optional for this request unless needed for factual verification.",
      plan?.allow_rag ? "RAG is allowed only if directly relevant." : "RAG is disabled for this request.",
      "No tool call, no factual claim for workspace data.",
      `User query:\n${query}`,
    ].join("\n\n");
  }

  hasMeaningfulToolCalls(toolsUsed = []) {
    return toArray(toolsUsed).some(
      (name) => typeof name === "string" && name.length > 0 && !name.startsWith(TRANSFER_TOOL_PREFIX),
    );
  }

  mapInvokedDomains(toolsUsed = []) {
    const invoked = new Set();
    for (const toolName of toArray(toolsUsed)) {
      if (typeof toolName !== "string" || toolName.startsWith(TRANSFER_TOOL_PREFIX)) {
        continue;
      }
      if (toolName === RAG_TOOL_NAME) {
        invoked.add("rag");
        continue;
      }
      for (const [domain, names] of Object.entries(this.domainToolNames)) {
        if (domain === "rag") continue;
        if (names.has(toolName)) {
          invoked.add(domain);
        }
      }
    }
    return invoked;
  }

  domainHasTools(domain) {
    if (!this.domainToolNames[domain]) return false;
    return this.domainToolNames[domain].size > 0;
  }

  validatePolicy(routingPlan, toolsUsed, forceToolUse) {
    const invokedDomains = this.mapInvokedDomains(toolsUsed);
    const selectedDomains = toArray(routingPlan?.domains);
    const selectedWorkspaceDomains = selectedDomains.filter((domain) => domain !== "rag");
    const violations = [];
    const missingDomains = [];
    const unexpectedDomains = [];

    if (forceToolUse && !this.hasMeaningfulToolCalls(toolsUsed)) {
      violations.push("required_tool_call_missing");
    }

    for (const domain of selectedWorkspaceDomains) {
      if (this.domainHasTools(domain) && !invokedDomains.has(domain)) {
        missingDomains.push(domain);
      }
    }

    for (const domain of invokedDomains) {
      if (domain === "rag") {
        if (!routingPlan.allow_rag) {
          violations.push("rag_invoked_when_disallowed");
        }
        continue;
      }
      if (!selectedWorkspaceDomains.includes(domain)) {
        unexpectedDomains.push(domain);
      }
    }

    if (missingDomains.length > 0) {
      violations.push(`missing_selected_domains:${missingDomains.join(",")}`);
    }
    if (unexpectedDomains.length > 0) {
      violations.push(`unexpected_domains:${unexpectedDomains.join(",")}`);
    }

    return {
      violations,
      missingDomains,
      unexpectedDomains,
      invokedDomains: Array.from(invokedDomains),
    };
  }

  buildEvidenceBySource({ toolsUsed, sources, routingPlan }) {
    const evidence = {
      jira: [],
      github: [],
      notion: [],
      calendar: [],
      rag: [],
    };

    for (const toolName of toArray(toolsUsed)) {
      if (typeof toolName !== "string" || toolName.startsWith(TRANSFER_TOOL_PREFIX)) continue;
      if (toolName === RAG_TOOL_NAME) {
        evidence.rag.push(`Tool: ${toolName}`);
        continue;
      }
      for (const [domain, names] of Object.entries(this.domainToolNames)) {
        if (domain === "rag") continue;
        if (names.has(toolName)) {
          evidence[domain].push(`Tool: ${toolName}`);
        }
      }
    }

    for (const source of toArray(sources)) {
      const filename = source?.metadata?.filename || source?.metadata?.source || "document";
      const chunkIndex = source?.metadata?.chunkIndex ?? source?.metadata?.chunk_index;
      const chunkLabel = Number.isInteger(chunkIndex) ? `chunk ${chunkIndex + 1}` : "chunk";
      evidence.rag.push(`${filename} (${chunkLabel})`);
    }

    const selectedDomains = toArray(routingPlan?.domains);
    for (const domain of selectedDomains) {
      if (domain !== "rag" && evidence[domain].length === 0 && this.domainHasTools(domain)) {
        evidence[domain].push("No tool evidence captured.");
      }
    }

    return evidence;
  }

  buildClarificationResult(query, routingPlan) {
    const selected = toArray(routingPlan.domains);
    const domainText = selected.length > 0 ? selected.join(", ") : "workspace systems";
    return {
      answer: `I have low confidence (${routingPlan.confidence.toFixed(2)}) about routing this query. Should I proceed using: ${domainText}?`,
      sources: [],
      clarification: {
        required: true,
        question:
          `Confirm routing for your request: "${query.slice(0, 160)}"` +
          ` using domains [${domainText}]?`,
      },
    };
  }

  async buildEmResponse(query, rawAnswer, evidenceBySource, decision) {
    if (decision.needsClarification) {
      return {
        answer: rawAnswer,
      };
    }

    const normalized = this.buildFallbackEmSections(rawAnswer, evidenceBySource);
    try {
      const llm = getChatModel();
      const prompt = [
        "Format the assistant output into JSON with keys:",
        "executiveSummary (string), keyRisksAndBlockers (string[]), whatNeedsDecision (string[]),",
        "actionItems ([{owner,dueDate,description}]), evidenceBySource (object of string[] keyed jira/github/notion/calendar/rag).",
        "Do not invent facts. Keep entries concise. Return JSON only.",
        `User query: ${query}`,
        `Raw answer: ${rawAnswer}`,
        `Evidence: ${JSON.stringify(evidenceBySource)}`,
      ].join("\n");
      const modelResponse = await llm.invoke(prompt);
      const parsed = this.safeParseJson(modelResponse?.content);
      if (parsed && typeof parsed === "object") {
        const merged = {
          executiveSummary: String(parsed.executiveSummary || normalized.executiveSummary),
          keyRisksAndBlockers: toArray(parsed.keyRisksAndBlockers).map((item) => String(item)),
          whatNeedsDecision: toArray(parsed.whatNeedsDecision).map((item) => String(item)),
          actionItems: toArray(parsed.actionItems)
            .map((item) => ({
              owner: String(item?.owner || "Unassigned"),
              dueDate: String(item?.dueDate || "TBD"),
              description: String(item?.description || "").trim(),
            }))
            .filter((item) => item.description),
          evidenceBySource: {
            jira: toArray(parsed?.evidenceBySource?.jira).map((item) => String(item)),
            github: toArray(parsed?.evidenceBySource?.github).map((item) => String(item)),
            notion: toArray(parsed?.evidenceBySource?.notion).map((item) => String(item)),
            calendar: toArray(parsed?.evidenceBySource?.calendar).map((item) => String(item)),
            rag: toArray(parsed?.evidenceBySource?.rag).map((item) => String(item)),
          },
        };
        return { answer: this.renderEmSections(merged) };
      }
    } catch (error) {
    }

    return { answer: this.renderEmSections(normalized) };
  }

  buildFallbackEmSections(rawAnswer, evidenceBySource) {
    const clean = String(rawAnswer || "").trim();
    const summary = clean || "No response generated.";
    const risks = [];
    const decisions = [];
    const actionItems = [];
    const lines = summary.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes("risk") || lower.includes("blocker") || lower.includes("delay")) {
        risks.push(line.replace(/^[-*]\s*/, ""));
      }
      if (lower.includes("decide") || lower.includes("approval") || lower.includes("confirm")) {
        decisions.push(line.replace(/^[-*]\s*/, ""));
      }
      if (line.startsWith("-") || line.startsWith("*")) {
        actionItems.push({
          owner: "Unassigned",
          dueDate: "TBD",
          description: line.replace(/^[-*]\s*/, ""),
        });
      }
    }
    return {
      executiveSummary: summary,
      keyRisksAndBlockers: risks,
      whatNeedsDecision: decisions,
      actionItems,
      evidenceBySource,
    };
  }

  renderEmSections(payload) {
    const lines = [];
    lines.push("Executive Summary");
    lines.push(payload.executiveSummary || "No summary available.");
    lines.push("");
    lines.push("Key Risks/Blockers");
    if (toArray(payload.keyRisksAndBlockers).length === 0) {
      lines.push("- None identified.");
    } else {
      for (const item of payload.keyRisksAndBlockers) {
        lines.push(`- ${item}`);
      }
    }
    lines.push("");
    lines.push("What Needs Decision");
    if (toArray(payload.whatNeedsDecision).length === 0) {
      lines.push("- No immediate decision required.");
    } else {
      for (const item of payload.whatNeedsDecision) {
        lines.push(`- ${item}`);
      }
    }
    lines.push("");
    lines.push("Action Items (owner + due date)");
    if (toArray(payload.actionItems).length === 0) {
      lines.push("- Unassigned | TBD | No explicit action items detected.");
    } else {
      for (const item of payload.actionItems) {
        lines.push(`- ${item.owner} | ${item.dueDate} | ${item.description}`);
      }
    }
    lines.push("");
    lines.push("Evidence by Source");
    const evidence = payload.evidenceBySource || {};
    for (const domain of ["jira", "github", "notion", "calendar", "rag"]) {
      const entries = toArray(evidence[domain]);
      if (entries.length === 0) {
        lines.push(`- ${domain}: none`);
      } else {
        lines.push(`- ${domain}: ${entries.join("; ")}`);
      }
    }
    return lines.join("\n");
  }

  safeParseJson(content) {
    const text = typeof content === "string" ? content : String(content || "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (error) {
      return null;
    }
  }

  updateUnwantedRagMetric(routingPlan, invokedDomains) {
    if (!routingPlan?.allow_rag && invokedDomains.has("rag")) {
      this.runtimeMetrics.unwantedRagInvocations += 1;
    }
  }

  computeSuccessGates(gateConfig = {}) {
    const routerQueries = this.runtimeMetrics.routerQueries || 1;
    const toolGroundedRequired = this.runtimeMetrics.toolGroundedRequired || 1;
    const unwantedRagRate = this.runtimeMetrics.unwantedRagInvocations / routerQueries;
    const toolGroundedRate = this.runtimeMetrics.toolGroundedMet / toolGroundedRequired;

    return {
      thresholds: {
        domainSelectionAccuracyMin: gateConfig.domainSelectionAccuracyMin ?? 0.9,
        unwantedRagRateMax: gateConfig.unwantedRagRateMax ?? 0.05,
        toolGroundedRateMin: gateConfig.toolGroundedRateMin ?? 0.95,
        emUsefulnessMin: gateConfig.emUsefulnessMin ?? 0.8,
      },
      runtime: {
        unwantedRagRate,
        toolGroundedRate,
        domainSelectionAccuracy: null,
        emUsefulness: null,
      },
      pass: {
        unwantedRagRate: unwantedRagRate <= (gateConfig.unwantedRagRateMax ?? 0.05),
        toolGroundedRate: toolGroundedRate >= (gateConfig.toolGroundedRateMin ?? 0.95),
        domainSelectionAccuracy: null,
        emUsefulness: null,
      },
    };
  }

  refreshDomainToolMap() {
    this.domainToolNames.jira = new Set(toArray(getJiraMCPTools()).map((tool) => tool?.name).filter(Boolean));
    this.domainToolNames.github = new Set(toArray(getGithubMCPTools()).map((tool) => tool?.name).filter(Boolean));
    this.domainToolNames.notion = new Set(toArray(getNotionMCPTools()).map((tool) => tool?.name).filter(Boolean));
    this.domainToolNames.calendar = new Set(toArray(getGoogleMCPTools()).map((tool) => tool?.name).filter(Boolean));
    this.domainToolNames.rag = new Set([RAG_TOOL_NAME]);
  }

  getRolloutDecision(seed, routerRuntime = {}) {
    const mode = routerRuntime.rolloutMode || "enforced";
    const percent = Number.isFinite(routerRuntime.rolloutPercent) ? routerRuntime.rolloutPercent : 100;
    if (mode === "off") {
      return { mode: "off", bucket: null, enabled: false };
    }
    const bucket = stableHash(seed) % 100;
    if (bucket >= percent) {
      return { mode: "off", bucket, enabled: false };
    }
    return { mode, bucket, enabled: true };
  }

  async runLlmExecutor(query) {
    const llm = getChatModel();
    const response = await llm.invoke(query);
    const answer = typeof response.content === "string" ? response.content : String(response.content || "");
    return {
      answer: answer || "No response generated.",
      sources: [],
    };
  }

  async tryRag(query, ragMode) {
    try {
      if (ragMode === "advanced") {
        return await ragService.agenticRetrieve(query);
      }
      return await ragService.baselineRetrieve(query);
    } catch (error) {
      return {
        answer: "",
        sources: [],
      };
    }
  }

  formatRagResult(ragResult) {
    return {
      answer: ragResult?.answer || "No response generated.",
      sources: ragResult?.sources || [],
    };
  }

  async getStatus() {
    const runtimeConfig = getRuntimeConfig();
    const runtimeMode = runtimeConfig.mode;
    const llmStatus = await getLLMStatus().catch(() => ({ initialized: false }));
    const readiness =
      runtimeMode === "full"
        ? await checkAgentReadiness().catch(() => ({ ready: false, toolCount: 0 }))
        : { ready: false, toolCount: 0 };
    return {
      ready: this.initialized,
      mcpReady: readiness.ready,
      toolCount: this.tools.length || readiness.toolCount || 0,
      ragEnabled: this.ragEnabled,
      llmReady: !!llmStatus.initialized,
      runtimeMode,
      router: {
        rollout: runtimeConfig.router || {},
        metrics: this.runtimeMetrics,
        successGates: this.computeSuccessGates(runtimeConfig.router?.successGates || {}),
      },
    };
  }

  async getAvailableTools() {
    if (!this.initialized) {
      await this.initialize();
    }
    if (getRuntimeConfig().mode !== "full") {
      return [];
    }
    if (this.tools.length > 0) {
      return this.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      }));
    }
    const { toolInfo } = await getAgentTools();
    return toolInfo;
  }

  async ensureLlmReadyForQuery() {
    try {
      await ensureLLMReady();
    } catch (error) {
      const message = error?.message || "LLM initialization failed";
      throw new Error(`LLM unavailable: ${message}`);
    }
  }
}

const langGraphAgentService = new LangGraphAgentService();
export default langGraphAgentService;
