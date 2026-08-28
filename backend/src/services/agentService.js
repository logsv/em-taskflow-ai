import ragService from "../rag/index.js";
import { ensureLLMReady, getChatModel, getLLMStatus } from "../llm/index.js";
import { executeAgentQuery, checkAgentReadiness, getAgentTools } from "../agent/graph.js";
import { getRuntimeConfig } from "../config.js";
import { getRouterChain } from "../agent/llmRouter.js";
import { getGithubMCPTools, getGoogleMCPTools, getJiraMCPTools, getNotionMCPTools } from "../mcp/index.js";
import { doraMetricsTool } from "../agent/doraAgent.js";
import { deliveryBottlenecksTool } from "../agent/deliveryAgent.js";
import { sbiFeedbackTool } from "../agent/sbiAgent.js";
import { peopleGrowthTool } from "../agent/peopleAgent.js";
import { sprintPlanTool } from "../agent/sprintAgent.js";
import { sprintRetroTool } from "../agent/retroAgent.js";
import { roadmapAlignmentTool } from "../agent/roadmapAgent.js";
import { okrProgressTool } from "../agent/okrAgent.js";
import { sopComplianceTool } from "../agent/sopAgent.js";
import { auditReportTool } from "../agent/criticAgent.js";
import { buildEmResponse } from "../utils/responseFormatter.js";
import { getTracerCallbacks, createEndToEndTrace, createSpan } from "../utils/tracer.js";
import { info, warn, error } from "../utils/logger.js";

const VALID_DOMAINS = new Set([
  "dora", "delivery", "sbi", "people", "sprint", "retro", "roadmap", "okr", "sop", "critic",
  "jira", "github", "notion", "calendar", "slack", "rag"
]);
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
      dora: new Set(["calculate_dora_metrics", "transfer_to_dora_agent"]),
      delivery: new Set(["analyze_delivery_bottlenecks", "transfer_to_delivery_agent", "search_issues", "list_pull_requests"]),
      sbi: new Set(["format_sbi_feedback", "transfer_to_sbi_agent", "slack_search_messages"]),
      people: new Set(["analyze_personnel_growth", "transfer_to_people_agent"]),
      sprint: new Set(["calculate_sprint_plan", "transfer_to_sprint_agent"]),
      retro: new Set(["generate_sprint_retro", "transfer_to_retro_agent", "slack_search_messages", "slack_post_message"]),
      roadmap: new Set(["get_roadmap_alignment", "transfer_to_roadmap_agent"]),
      okr: new Set(["evaluate_okr_progress", "transfer_to_okr_agent"]),
      sop: new Set(["query_sop_compliance", "transfer_to_sop_agent"]),
      critic: new Set(["audit_em_report", "transfer_to_critic_agent"]),
      jira: new Set(["jira_search", "transfer_to_jira_agent"]),
      github: new Set(["search_issues", "list_pull_requests", "transfer_to_github_agent"]),
      notion: new Set(["notion_search", "transfer_to_notion_agent"]),
      calendar: new Set(["get_calendar_events", "calendar_list_events", "transfer_to_calendar_agent"]),
      slack: new Set(["slack_search_messages", "slack_post_message", "slack_list_channels", "transfer_to_slack_agent"]),
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

    await ensureLLMReady();

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

    // Create Root Request Trace for End-to-End Langfuse Observability
    const { trace, callbacks } = createEndToEndTrace({
      name: `Chat Request: "${(userQuery || '').slice(0, 40)}"`,
      query: userQuery,
      sessionId: options.sessionId || options.threadId || "default_session",
      userId: options.userId || "default_user",
      tags: options.tags || ["em-taskflow", "chat-api"],
    });
    if (trace) {
      options.trace = trace;
      options.tracerCallbacks = callbacks;
    }
    options.messages = Array.isArray(options.messages) ? options.messages : (Array.isArray(options.history) ? options.history : []);

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

    let queryToRun = userQuery;
    let bypassConfidenceCheck = false;
    let routingPlan = null;

    info("Agent query execution started", {
      threadId: options.threadId || null,
      mode: options.mode || "advanced",
      querySnippet: userQuery.slice(0, 50),
    });

    let result;
    if (runtime.mode === "rag_only") {
      const plan = await this.routeQueryPlan(userQuery, runtime.mode, options);
      decision.routingPlan = plan;
      this.runtimeMetrics.routerQueries += 1;
      result = await this.runRagOnlyPath(userQuery, ragMode, decision, options);
    } else if (rollout.mode === "off") {
      this.runtimeMetrics.offQueries += 1;
      decision.reasons.push("router_rollout_off");
      result = await this.runLegacyPath(userQuery, decision, options);
    } else if (rollout.mode === "shadow") {
      this.runtimeMetrics.shadowQueries += 1;
      this.runtimeMetrics.routerQueries += 1;
      const plan = await this.routeQueryPlan(userQuery, runtime.mode, options);
      decision.routingPlan = plan;
      decision.reasons.push("router_shadow_mode_not_enforced");
      result = await this.runLegacyPath(userQuery, decision, options);
    } else {
      // Enforced mode
      if (options.threadId) {
        const isConfirmation = ["yes", "yeah", "sure", "ok", "yep", "confirm", "proceed", "go ahead", "y"].includes(userQuery.toLowerCase().trim());
        if (isConfirmation) {
          try {
            const db = (await import("../db/index.js")).default;
            const history = await db.getThreadMessages(options.threadId);
            const lastMsg = history[history.length - 1];
            if (lastMsg && lastMsg.role === "assistant" && (lastMsg.strategy === "clarification" || lastMsg.metadata?.selectedPath === "clarification")) {
              const originalUserMsg = history[history.length - 2];
              if (originalUserMsg && originalUserMsg.role === "user") {
                queryToRun = originalUserMsg.content;
                bypassConfidenceCheck = true;
                const savedPlan = originalUserMsg.metadata?.routingPlan;
                if (savedPlan && Array.isArray(savedPlan.domains)) {
                  routingPlan = savedPlan;
                }
                // Update Langfuse root trace name and metadata for rehydration clarity
                if (trace && typeof trace.update === "function") {
                  try {
                    trace.update({
                      name: `Chat Request: "${userQuery}" -> [Resolved: "${(queryToRun || '').slice(0, 40)}"]`,
                      metadata: {
                        rehydratedFromHistory: true,
                        resolvedQuery: queryToRun,
                        clarificationStrategy: true,
                      },
                    });
                  } catch (_) {}
                }
              }
            }
          } catch (dbError) {
            warn({ module: "agentService", action: "checkConfirmationHistory", err: dbError }, "Failed to check confirmation history");
          }
        }
      }

      this.runtimeMetrics.enforcedQueries += 1;
      this.runtimeMetrics.routerQueries += 1;
      
      if (!routingPlan) {
        routingPlan = await this.routeQueryPlan(queryToRun, runtime.mode, options);
      }
      decision.routingPlan = routingPlan;

      if (!bypassConfidenceCheck && routingPlan.confidence < (routerRuntime.lowConfidenceThreshold ?? 0.45)) {
        this.runtimeMetrics.lowConfidenceClarifications += 1;
        decision.selectedPath = "clarification";
        decision.needsClarification = true;
        result = this.buildClarificationResult(queryToRun, routingPlan);
      } else {
        result = await this.runEnforcedPolicy(queryToRun, routingPlan, decision, options);
      }
    }

    const evidenceBySource = this.buildEvidenceBySource({
      toolsUsed: decision.toolsUsed,
      sources: result.sources || [],
      routingPlan: decision.routingPlan,
      rawAnswer: result.answer || "",
    });
    const emResponse = await buildEmResponse(queryToRun, result.answer || "", evidenceBySource, decision);
    const executionTime = Date.now() - startTime;
    const successGates = this.computeSuccessGates(routerRuntime.successGates || {});

    // Finalize Langfuse root trace output and flush asynchronously (non-blocking)
    if (trace && typeof trace.update === "function") {
      try {
        trace.update({
          output: emResponse.answer,
          metadata: {
            executionTime,
            decision,
          },
        });
      } catch (_err) {}
    }

    // Finalize Arize Phoenix OpenInference root span
    if (options.otelSpan && typeof options.otelSpan.end === "function") {
      try {
        if (emResponse?.answer) {
          options.otelSpan.setAttribute("output.value", String(emResponse.answer));
        }
        options.otelSpan.setAttribute("metadata", JSON.stringify({
          executionTime,
          decision,
        }));
        options.otelSpan.end();
      } catch (_err) {}
    }

    const tracerCallbacks = getTracerCallbacks(options);
    if (Array.isArray(tracerCallbacks)) {
      for (const cb of tracerCallbacks) {
        if (typeof cb.flushAsync === "function") {
          cb.flushAsync().catch(() => {});
        }
      }
    }

    info("Agent query execution completed", {
      threadId: options.threadId || null,
      executionTimeMs: executionTime,
      ragHit: !!decision.ragHit,
      selectedPath: decision.selectedPath,
      toolsUsedCount: Array.isArray(decision.toolsUsed) ? decision.toolsUsed.length : 0,
    });

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
      routingPlan: {
        domains: ["jira", "github", "notion", "calendar"],
        allow_rag: includeRagAgent,
        must_use_tools: false,
        confidence: 1,
        reasoning_summary: "Legacy fallback run."
      },
      maxIterations: 25,
    });
    decision.toolsUsed = toArray(legacyResult.toolsUsed);
    decision.selectedPath = includeRagAgent ? "legacy_supervisor_with_rag" : "legacy_supervisor_no_rag";
    return {
      answer: legacyResult.response || "No response generated.",
      sources: [],
    };
  }

  async runEnforcedPolicy(query, routingPlan, decision, options = {}) {
    if (routingPlan?.intent_type === "DIRECT_LLM" || routingPlan?.intent_type === "ATTACHMENT_DIRECT" || routingPlan?.intent_type === "CONTEXTUAL_SYNTHESIS" || (Array.isArray(routingPlan?.domains) && routingPlan.domains.length === 0 && !routingPlan.must_use_tools && !routingPlan.allow_rag)) {
      decision.selectedPath = routingPlan?.intent_type === "CONTEXTUAL_SYNTHESIS" ? "contextual-synthesis" : "direct-llm-fastpath";
      info({ module: "agentService", action: "fastPathExecution", selectedPath: decision.selectedPath, querySnippet: query.slice(0, 40) }, `Fast-path execution (${decision.selectedPath}) for query`);
      return this.runLlmExecutor(query, options);
    }

    const requiresWorkspaceDomains = this.requiresWorkspaceDomains(routingPlan);
    const forceToolUse = routingPlan.must_use_tools || requiresWorkspaceDomains;
    const qLower = String(query || "").toLowerCase();
    const isDocQuery = ["rubric", "pdf", "doc", "document", "uploaded", "file", "what is in", "sop", "guide", "pointer", "summary", "policy"].some((kw) => qLower.includes(kw));
    
    // Strict Domain Exclusivity: If structured workspace domains exist, disallow RAG unless explicitly requested as 'rag' or 'sop'
    const hasStructuredWorkspaceDomain = toArray(routingPlan?.domains).some((d) => d !== "rag" && d !== "sop");
    const allowRag = !hasStructuredWorkspaceDomain && (routingPlan.allow_rag !== false || routingPlan.domains.includes("rag") || isDocQuery) && this.ragEnabled && options.includeRag !== false;
    let ragResult = { answer: "", sources: [] };

    if (!allowRag) {
      decision.reasons.push("rag_disallowed_by_router");
    }

    if (forceToolUse) {
      this.runtimeMetrics.toolGroundedRequired += 1;
    }

    // Tier 2 / 3: Dedicated RAG Document Retrieval Path
    const isPureRagIntent = (routingPlan?.domains?.length === 1 && routingPlan.domains[0] === "rag") ||
      (toArray(routingPlan?.domains).length === 0 && allowRag && isDocQuery);

    if (isPureRagIntent) {
      if (this.ragEnabled) {
        ragResult = await this.tryRag(query, decision.ragMode, options);
        decision.ragHit = Array.isArray(ragResult?.sources) && ragResult.sources.length > 0;
        if (decision.ragHit) {
          decision.selectedPath = "rag+llm";
          info({ module: "agentService", action: "ragHit", sourceCount: ragResult.sources.length }, `RAG hit: returning ${ragResult.sources.length} document source(s)`);
          return this.formatRagResult(ragResult);
        }
      }
      decision.selectedPath = "rag-zero-hit-guidance";
      return {
        answer: `### 📄 Knowledge Base Search\n\n> **Status**: No matching document chunks found in knowledge base for query.\n\n- **Query**: *"${query}"*\n- **Action Needed**: To search internal engineering documentation, please upload your architecture guidelines, runbooks, or PDF rubrics using the **Attach File** or **Upload Document** feature in the sidebar.\n- **Supported Formats**: \`.pdf\`, \`.md\`, \`.txt\`, \`.csv\`, \`.docx\`, Architecture Decision Records (ADRs).`,
        sources: [],
      };
    }

    // Tier 4 & 5: High-Performance Direct Domain Execution & Parallel Fan-Out/Fan-In
    const selectedDomains = toArray(routingPlan?.domains).filter((d) => d !== "rag");
    if (selectedDomains.length > 0) {
      const directResult = await this.runRequiredDomainRecovery(query, routingPlan, decision, options);
      if (directResult) {
        decision.selectedPath = selectedDomains.length === 1 ? "direct-domain-executor" : "parallel-multi-agent-orchestrator";
        return directResult;
      }
    }

    // Step 1: Execute Domain Supervisor / Domain Tools as fallback when direct dispatch did not handle
    if (decision.mcpReady && forceToolUse) {
      const supervisorResult = await executeAgentQuery(query, {
        ...options,
        threadId: options.threadId,
        routingPlan,
        maxIterations: 25,
      });
      decision.toolsUsed = toArray(supervisorResult.toolsUsed);

      const policy = this.validatePolicy(routingPlan, decision.toolsUsed, forceToolUse);
      decision.policy = policy;
      if (policy.violations.length === 0) {
        this.runtimeMetrics.toolGroundedMet += 1;
        decision.selectedPath = allowRag ? "router+supervisor(+rag)" : "router+supervisor";
        this.updateUnwantedRagMetric(routingPlan, policy.invokedDomains);
        return {
          answer: supervisorResult.response || "No response generated.",
          sources: [],
        };
      }

      const recovery = await this.runRequiredDomainRecovery(query, routingPlan, decision, options);
      if (recovery) {
        return recovery;
      }

      decision.reasons.push("policy_violations_detected");
      decision.reasons.push(...policy.violations.map((v) => `policy:${v}`));
    } else if (forceToolUse && !decision.mcpReady) {
      decision.reasons.push("mcp_required_but_unavailable");

      const recovery = await this.runRequiredDomainRecovery(query, routingPlan, decision, options);
      if (recovery) {
        return recovery;
      }
    }

    // Step 2: Only probe RAG if allowed and workspace domains did not handle the query
    if (allowRag) {
      ragResult = await this.tryRag(query, decision.ragMode, options);
      decision.ragHit = Array.isArray(ragResult?.sources) && ragResult.sources.length > 0;
      if (decision.ragHit) {
        decision.selectedPath = "rag+llm";
        info({ module: "agentService", action: "ragHit", sourceCount: ragResult.sources.length }, `RAG hit: returning ${ragResult.sources.length} document source(s)`);
        return this.formatRagResult(ragResult);
      }
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

  async runRequiredDomainRecovery(query, routingPlan, decision, options = {}) {
    const domains = toArray(routingPlan?.domains);
    const recoveryTools = {
      dora: { tool: doraMetricsTool, input: { sources: ["github"] } },
      delivery: { tool: deliveryBottlenecksTool, input: { sources: ["github", "jira"] } },
      sbi: {
        tool: sbiFeedbackTool,
        input: {
          situation: String(query || ""),
          context_type: "coaching_request",
        },
      },
      people: { tool: peopleGrowthTool, input: { mode: "ANALYZE", engineer_id: String(query || "") } },
      sprint: { tool: sprintPlanTool, input: {} },
      retro: { tool: sprintRetroTool, input: { mode: "ANALYZE" } },
      roadmap: { tool: roadmapAlignmentTool, input: { mode: "ANALYZE" } },
      okr: { tool: okrProgressTool, input: { mode: "ANALYZE" } },
      sop: { tool: sopComplianceTool, input: { mode: "ANALYZE" } },
      critic: { tool: auditReportTool, input: { mode: "ANALYZE", draft_response: String(query || "") } },
    };
    const recoverable = domains.filter((domain) => recoveryTools[domain]);
    if (recoverable.length === 0) return null;

    const answers = [];
    let recoveredAny = false;
    const queryLower = String(query || "").toLowerCase();
    const isListQuery = queryLower.startsWith("list ") || queryLower.startsWith("show all ") || queryLower.includes("list all") || queryLower.includes("list raw");
    let detectedTarget = "ALL";
    if (queryLower.includes("pr") || queryLower.includes("pull request")) {
      detectedTarget = "PRS";
    } else if (queryLower.includes("wip")) {
      detectedTarget = "WIP_ITEMS";
    } else if (queryLower.includes("block") || queryLower.includes("dependency") || queryLower.includes("dependencies")) {
      detectedTarget = "BLOCKERS";
    } else if (queryLower.includes("release") || queryLower.includes("deploy")) {
      detectedTarget = "RELEASES";
    } else if (queryLower.includes("1-on-1") || queryLower.includes("one on one") || queryLower.includes("meeting")) {
      detectedTarget = "ONE_ON_ONES";
    } else if (queryLower.includes("skill") || queryLower.includes("gap") || queryLower.includes("competenc")) {
      detectedTarget = "SKILL_GAPS";
    } else if (queryLower.includes("action item") || queryLower.includes("retro item")) {
      detectedTarget = "ACTION_ITEMS";
    } else if (queryLower.includes("pattern") || queryLower.includes("recurring") || queryLower.includes("friction")) {
      detectedTarget = "PATTERNS";
    } else if (queryLower.includes("epic") || queryLower.includes("roadmap item")) {
      detectedTarget = "EPICS";
    } else if (queryLower.includes("drift") || queryLower.includes("scope creep") || queryLower.includes("milestone")) {
      detectedTarget = "DRIFT";
    } else if (queryLower.includes("at risk") || queryLower.includes("off track") || queryLower.includes("lagging")) {
      detectedTarget = "AT_RISK";
    } else if (queryLower.includes("remediation")) {
      detectedTarget = "GAP_REMEDIATION";
    } else if (queryLower.includes("okr") || queryLower.includes("key result") || queryLower.includes("kr")) {
      detectedTarget = "KRS";
    } else if (queryLower.includes("adr") || queryLower.includes("architecture decision")) {
      detectedTarget = "ADRS";
    } else if (queryLower.includes("sop") || queryLower.includes("policy") || queryLower.includes("governance") || queryLower.includes("standard")) {
      detectedTarget = "SOPS";
    } else if (queryLower.includes("violation") || queryLower.includes("non-compliant") || queryLower.includes("non compliant")) {
      detectedTarget = "VIOLATIONS";
    } else if (queryLower.includes("script") || queryLower.includes("talking")) {
      detectedTarget = "TALKING_SCRIPT";
    } else if (queryLower.includes("bias") || queryLower.includes("objectivity")) {
      detectedTarget = "BIAS_AUDIT";
    } else if (queryLower.includes("check") || queryLower.includes("audit")) {
      detectedTarget = "CHECKS";
    }

    try {
      const recoveryPromises = recoverable.map(async (domain) => {
        const { tool, input } = recoveryTools[domain];
        try {
          const dynamicMode = isListQuery ? "LIST_RAW" : (input.mode || "ANALYZE");
          const result = await tool.invoke({ mode: dynamicMode, target: detectedTarget, fetch_fresh_data: true, ...input });
          return { domain, tool, result };
        } catch (err) {
          return { domain, tool, result: { status: "FAILED", error: err?.message } };
        }
      });

      const outcomes = await Promise.all(recoveryPromises);
      for (const { domain, tool, result } of outcomes) {
        decision.toolsUsed = Array.from(new Set([...toArray(decision.toolsUsed), tool.name]));
        decision.reasons.push(`supervisor_missing_${tool.name}_recovered_deterministically`);
        if (result?.status !== "SUCCESS") {
          decision.reasons.push(`recovery_tool_status:${tool.name}:${result?.status || "unknown"}`);
          continue;
        }
        recoveredAny = true;
        const data = result.data || {};
        if (data.summary) {
          answers.push(data.summary);
        } else if (domain === "sprint") {
          const metrics = data.capacity_metrics || {};
          answers.push(`Sprint capacity: ${metrics.team_capacity_hours ?? "unavailable"} hours; target velocity: ${metrics.target_velocity_points ?? "unavailable"} points; recommended commitment: ${metrics.recommended_commitment_points ?? "unavailable"} points.`);
        }
        if (result.staleDataWarning) {
          decision.reasons.push(`postgresql_cache_fallback_used:${domain}`);
        }
      }
      decision.policy = this.validatePolicy(routingPlan, decision.toolsUsed, true);
      if (!recoveredAny) return null;
      decision.selectedPath = "deterministic-domain-tool-recovery";
      if (decision.policy.violations.length === 0) {
        this.runtimeMetrics.toolGroundedMet += 1;
      }
      return { answer: answers.join("\n\n") || "The requested domain tools completed without a summary.", sources: [] };
    } catch (recoveryError) {
      warn("Required domain recovery failed", { domains: recoverable, err: recoveryError?.message });
      decision.reasons.push("recovery_failed");
      return null;
    }
  }

  async routeQueryPlan(query, runtimeMode, options = {}) {
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
      const callbacks = getTracerCallbacks(options);
      const rawPlan = await routerChain.invoke({ query, options }, { callbacks });
      return this.normalizeRoutingPlan(rawPlan);
    } catch (error) {
      warn({ module: "agentService", action: "routerFallback", err: error }, "LLM router failed, using passthrough fallback");
      return this.getFallbackRoutingPlan("router_failed", query, options);
    }
  }

  normalizeRoutingPlan(rawPlan) {
    const isContextualSynthesis = rawPlan?.intent_type === "CONTEXTUAL_SYNTHESIS";
    const inputDomains = isContextualSynthesis ? [] : toArray(rawPlan?.domains);
    const domains = Array.from(new Set(inputDomains.filter((domain) => VALID_DOMAINS.has(domain))));
    const confidence = Number(rawPlan?.confidence);
    const normalizedConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.2;
    const hasWorkspaceDomains = !isContextualSynthesis && domains.some((domain) => domain !== "rag");

    return {
      intent_type: rawPlan?.intent_type || null,
      domains,
      must_use_tools: hasWorkspaceDomains ? true : (isContextualSynthesis ? false : !!rawPlan?.must_use_tools),
      allow_rag: isContextualSynthesis ? false : !!rawPlan?.allow_rag,
      confidence: normalizedConfidence,
      reasoning_summary: String(rawPlan?.reasoning_summary || "LLM router plan.").slice(0, 300),
    };
  }

  getFallbackRoutingPlan(reason, query = "", options = {}) {
    const q = String(query).toLowerCase();
    const attachments = Array.isArray(options?.attachments) ? options.attachments : [];
    if (attachments.length > 0 || q.includes("[attachment:") || q.includes("[image attachment:") || q.includes("# document executive context:")) {
      return {
        intent_type: "ATTACHMENT_DIRECT",
        domains: [],
        must_use_tools: false,
        allow_rag: false,
        confidence: 1.0,
        reasoning_summary: "Attachment fallback: Direct document context present in prompt.",
      };
    }
    const domains = [];
    if (q.includes("dora") || q.includes("lead time") || q.includes("mttr") || q.includes("deployment frequency")) {
      domains.push("dora");
    }
    if (q.includes("delivery") || q.includes("wip") || q.includes("throughput") || q.includes("cycle time") || q.includes("github") || q.includes("pr") || q.includes("issue") || q.includes("jira")) {
      domains.push("delivery");
    }
    if (q.includes("sbi") || q.includes("feedback") || q.includes("coaching")) {
      domains.push("sbi");
    }
    if (q.includes("people") || q.includes("1-on-1") || q.includes("career") || q.includes("burnout") || q.includes("calendar")) {
      domains.push("people");
    }
    if (q.includes("sprint") || q.includes("velocity") || q.includes("capacity")) {
      domains.push("sprint");
    }
    if (q.includes("retro") || q.includes("retrospective")) {
      domains.push("retro");
    }
    if (q.includes("sop") || q.includes("compliance") || q.includes("adr")) {
      domains.push("sop");
    }
    if (q.includes("roadmap") || q.includes("milestone") || q.includes("drift")) {
      domains.push("roadmap");
    }
    if (q.includes("okr") || q.includes("kpi") || q.includes("notion")) {
      domains.push("okr");
    }
    if (q.includes("critic") || q.includes("audit")) {
      domains.push("critic");
    }
    
    const isDocQuery = q.includes("pdf") || q.includes("doc") || q.includes("file") || q.includes("guide") || q.includes("rubric") || q.includes("sop") || q.includes("pointer") || q.includes("summary");
    if (domains.length === 0 || isDocQuery) {
      domains.push("rag");
    }

    const hasWorkspaceDomains = domains.some((d) => d !== "rag" && d !== "sop");
    const allowRag = !hasWorkspaceDomains && (domains.includes("rag") || isDocQuery);

    return {
      domains,
      must_use_tools: hasWorkspaceDomains,
      allow_rag: allowRag,
      confidence: 0.9,
      reasoning_summary: `Fallback routing plan: ${reason}.`,
      _routerFailed: true,
    };
  }

  requiresWorkspaceDomains(plan) {
    return toArray(plan?.domains).some((domain) => domain !== "rag" && domain !== "sop");
  }

  hasMeaningfulToolCalls(toolsUsed) {
    const arr = toArray(toolsUsed);
    if (arr.length === 0) return false;
    return arr.some((toolName) =>
      typeof toolName === "string" &&
      (toolName === RAG_TOOL_NAME ||
        Object.entries(this.domainToolNames).some(([domain, names]) =>
          domain !== "rag" && !toolName.startsWith(TRANSFER_TOOL_PREFIX) && names.has(toolName),
        )),
    );
  }

  mapInvokedDomains(toolsUsed = []) {
    this.refreshDomainToolMap();
    const invoked = new Set();
    for (const toolName of toArray(toolsUsed)) {
      if (typeof toolName !== "string") {
        continue;
      }
      if (toolName.startsWith(TRANSFER_TOOL_PREFIX)) {
        const domain = toolName.replace(/^transfer_to_|^transfer_/, "").replace(/_agent$/, "");
        if (VALID_DOMAINS.has(domain)) {
          invoked.add(domain);
        }
        continue;
      }
      if (toolName === RAG_TOOL_NAME) {
        invoked.add("rag");
        continue;
      }
      let mapped = false;
      for (const [domain, names] of Object.entries(this.domainToolNames)) {
        if (domain === "rag") continue;
        if (names.has(toolName)) {
          invoked.add(domain);
          mapped = true;
        }
      }
      if (!mapped) {
        for (const domain of Object.keys(this.domainToolNames)) {
          if (domain === "rag") continue;
          if (toolName.includes(domain)) {
            invoked.add(domain);
          }
        }
      }
    }
    return invoked;
  }

  domainHasTools(domain) {
    if (!this.domainToolNames[domain]) return false;
    return this.domainToolNames[domain].size > 0;
  }

  hasExecutedDomainTool(domain, toolsUsed) {
    const names = this.domainToolNames[domain];
    if (!names) return false;
    return toArray(toolsUsed).some(
      (toolName) => typeof toolName === "string" && (names.has(toolName) || toolName.includes(domain)),
    );
  }

  validatePolicy(routingPlan, toolsUsed, forceToolUse) {
    const invokedDomains = this.mapInvokedDomains(toolsUsed);
    const selectedDomains = toArray(routingPlan?.domains);
    const selectedWorkspaceDomains = selectedDomains.filter((domain) => domain !== "rag" && domain !== "sop");
    const violations = [];
    const missingDomains = [];
    const unexpectedDomains = [];

    if (forceToolUse && !this.hasMeaningfulToolCalls(toolsUsed)) {
      violations.push("required_tool_call_missing");
    }

    for (const domain of selectedWorkspaceDomains) {
      if (this.domainHasTools(domain) && !this.hasExecutedDomainTool(domain, toolsUsed)) {
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

  buildEvidenceBySource({ toolsUsed, sources, routingPlan, rawAnswer }) {
    const evidence = {
      dora: [],
      delivery: [],
      sbi: [],
      people: [],
      sprint: [],
      retro: [],
      roadmap: [],
      okr: [],
      sop: [],
      critic: [],
      jira: [],
      github: [],
      notion: [],
      calendar: [],
      slack: [],
      rag: [],
    };

    for (const toolName of toArray(toolsUsed)) {
      if (typeof toolName !== "string") continue;
      if (toolName.startsWith(TRANSFER_TOOL_PREFIX)) {
        const domain = toolName.replace(/^transfer_to_|^transfer_/, "").replace(/_agent$/, "");
        if (evidence[domain]) {
          evidence[domain].push(`Tool: ${toolName}`);
        }
        continue;
      }
      if (toolName === RAG_TOOL_NAME) {
        evidence.rag.push(`Tool: ${toolName}`);
        continue;
      }
      for (const [domain, names] of Object.entries(this.domainToolNames)) {
        if (domain === "rag") continue;
        if (names.has(toolName)) {
          if (evidence[domain]) {
            evidence[domain].push(`Tool: ${toolName}`);
          }
        }
      }
    }

    if (typeof rawAnswer === "string" && rawAnswer.length > 0) {
      const githubLinks = rawAnswer.match(/\[[^\]]+\]\(https:\/\/github\.com\/[^\)]+\)|https:\/\/github\.com\/[^\s\)]+/g);
      if (githubLinks && githubLinks.length > 0) {
        evidence.github = Array.from(new Set(githubLinks));
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

  updateUnwantedRagMetric(routingPlan, invokedDomains) {
    const domainArray = toArray(invokedDomains);
    if (!routingPlan?.allow_rag && domainArray.includes("rag")) {
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
    const jiraTools = toArray(getJiraMCPTools()).map((tool) => tool?.name).filter(Boolean);
    const githubTools = toArray(getGithubMCPTools()).map((tool) => tool?.name).filter(Boolean);
    const notionTools = toArray(getNotionMCPTools()).map((tool) => tool?.name).filter(Boolean);
    const calendarTools = toArray(getGoogleMCPTools()).map((tool) => tool?.name).filter(Boolean);

    this.domainToolNames.dora = new Set(["calculate_dora_metrics", "transfer_to_dora_agent"]);
    this.domainToolNames.delivery = new Set(["analyze_delivery_bottlenecks", "transfer_to_delivery_agent", ...githubTools, ...jiraTools]);
    this.domainToolNames.sbi = new Set(["format_sbi_feedback", "transfer_to_sbi_agent"]);
    this.domainToolNames.people = new Set(["analyze_personnel_growth", "transfer_to_people_agent", ...calendarTools]);
    this.domainToolNames.sprint = new Set(["calculate_sprint_plan", "transfer_to_sprint_agent"]);
    this.domainToolNames.retro = new Set(["generate_sprint_retro", "transfer_to_retro_agent"]);
    this.domainToolNames.roadmap = new Set(["get_roadmap_alignment", "transfer_to_roadmap_agent"]);
    this.domainToolNames.okr = new Set(["evaluate_okr_progress", "transfer_to_okr_agent", ...notionTools]);
    this.domainToolNames.sop = new Set(["query_sop_compliance", "transfer_to_sop_agent"]);
    this.domainToolNames.critic = new Set(["audit_em_report", "transfer_to_critic_agent"]);
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

  async runLlmExecutor(query, options = {}) {
    const { HumanMessage: HM, SystemMessage: SM, AIMessage: AM } = await import("@langchain/core/messages");
    const llm = getChatModel();
    const callbacks = getTracerCallbacks(options);
    
    const systemInstructions = [
      "You are an expert Engineering Management AI assistant. Answer the user's question clearly, thoroughly, and concisely using the conversation history context where relevant.",
    ];

    const inputMessages = [];

    if (Array.isArray(options.messages) && options.messages.length > 0) {
      for (const m of options.messages) {
        if (m.role === "system" || m._getType?.() === "system") {
          systemInstructions.push(typeof m.content === "string" ? m.content : String(m.content || ""));
        } else if (m.role === "user" || m._getType?.() === "human") {
          inputMessages.push(new HM(typeof m.content === "string" ? m.content : String(m.content || "")));
        } else if (m.role === "assistant" || m._getType?.() === "ai") {
          inputMessages.push(new AM(typeof m.content === "string" ? m.content : String(m.content || "")));
        }
      }
    }
    inputMessages.push(new HM(query));

    const finalMessages = [
      new SM(systemInstructions.join("\n\n")),
      ...inputMessages,
    ];

    const response = await llm.invoke(finalMessages, { callbacks });
    const answer = typeof response.content === "string" ? response.content : String(response.content || "");
    return {
      answer: answer || "No response generated.",
      sources: [],
    };
  }

  async tryRag(query, ragMode, options = {}) {
    try {
      if (ragMode === "advanced") {
        return await ragService.agenticRetrieve(query, options);
      }
      return await ragService.baselineRetrieve(query, options);
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
    const readiness = this.initialized
      ? { ready: true, toolCount: this.tools.length }
      : (runtimeMode === "full"
          ? await checkAgentReadiness().catch(() => ({ ready: false, toolCount: 0 }))
          : { ready: false, toolCount: 0 });
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
