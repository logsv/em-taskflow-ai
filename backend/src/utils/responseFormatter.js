import { getChatModel } from "../llm/index.js";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function buildEmResponse(query, rawAnswer, evidenceBySource, decision = {}) {
  const cleanAnswer = String(rawAnswer || "").trim();
  const hasVerifiedToolEvidence = Object.values(evidenceBySource || {}).some((entries) =>
    toArray(entries).some((entry) => {
      const text = String(entry || "");
      return text.length > 0 && !text.includes("No tool evidence captured.") && !text.includes("transfer_to_");
    }),
  );
  const isStructured =
    cleanAnswer.includes("###") ||
    cleanAnswer.includes("DORA") ||
    cleanAnswer.includes("Executive Summary") ||
    cleanAnswer.includes("SBI") ||
    cleanAnswer.includes("Delivery Risk") ||
    cleanAnswer.includes("Roadmap") ||
    cleanAnswer.includes("OKR") ||
    cleanAnswer.includes("SOP");

  if (
    !cleanAnswer ||
    decision.needsClarification || 
    decision.selectedPath === "direct-llm-fastpath" || 
    decision.selectedPath === "contextual-synthesis" ||
    decision.selectedPath === "rag+llm" || 
    decision.ragHit || 
    decision.routingPlan?.intent_type === "DIRECT_LLM" ||
    decision.routingPlan?.intent_type === "CONTEXTUAL_SYNTHESIS" ||
    !hasVerifiedToolEvidence ||
    isStructured
  ) {
    return {
      answer: cleanAnswer || "No response generated.",
    };
  }

  const normalized = buildFallbackEmSections(rawAnswer, evidenceBySource);
  try {
    const llm = getChatModel();
    const prompt = [
      "Format the assistant output into JSON with keys:",
      "executiveSummary (string), keyRisksAndBlockers (string[]), whatNeedsDecision (string[]),",
      "actionItems ([{owner,dueDate,description}]), evidenceBySource (object of string[] keyed dora/delivery/jira/github/notion/calendar/rag).",
      "Do not invent facts. Keep entries concise. Return JSON only.",
      "IMPORTANT: Preserve all Markdown links (e.g. [#14 Title](https://github.com/owner/repo/issues/14)) intact in executiveSummary and evidenceBySource.",
      `User query: ${query}`,
      `Raw answer: ${rawAnswer}`,
      `Evidence: ${JSON.stringify(evidenceBySource)}`,
    ].join("\n");
    const modelResponse = await llm.invoke(prompt);
    const parsed = safeParseJson(modelResponse?.content);
    if (parsed && typeof parsed === "object") {
      const hasLinksInNormalized = normalized.executiveSummary.includes("[#") || normalized.executiveSummary.includes("http");
      const hasLinksInParsed = typeof parsed.executiveSummary === "string" && (parsed.executiveSummary.includes("[#") || parsed.executiveSummary.includes("http"));

      let execSummary = String(parsed.executiveSummary || normalized.executiveSummary);
      if (hasLinksInNormalized && !hasLinksInParsed) {
        execSummary = normalized.executiveSummary;
      }

      const parsedActionItems = toArray(parsed.actionItems)
        .map((item) => ({
          owner: String(item?.owner || "Unassigned"),
          dueDate: String(item?.dueDate || "TBD"),
          description: String(item?.description || "").trim(),
        }))
        .filter((item) => item.description);

      const isGenericActionItem = (item) =>
        !item ||
        item.owner === "User" ||
        item.owner === "Unassigned" ||
        item.description.includes("more context") ||
        item.description.includes("adjust focus") ||
        item.description.includes("task list") ||
        item.description.includes("no worker specialist") ||
        item.description.includes("general response") ||
        item.description.includes("Evidence by Source");

      const actionItems =
        normalized.actionItems.length > 0 && (parsedActionItems.length === 0 || parsedActionItems.every(isGenericActionItem))
          ? normalized.actionItems
          : parsedActionItems.length > 0
          ? parsedActionItems
          : normalized.actionItems;

      const merged = {
        executiveSummary: execSummary,
        keyRisksAndBlockers: toArray(parsed.keyRisksAndBlockers).length > 0 ? toArray(parsed.keyRisksAndBlockers).map(String) : normalized.keyRisksAndBlockers,
        whatNeedsDecision: toArray(parsed.whatNeedsDecision).length > 0 ? toArray(parsed.whatNeedsDecision).map(String) : normalized.whatNeedsDecision,
        actionItems,
        evidenceBySource: {
          dora: toArray(parsed?.evidenceBySource?.dora).length > 0 ? toArray(parsed?.evidenceBySource?.dora).map(String) : normalized.evidenceBySource.dora,
          delivery: toArray(parsed?.evidenceBySource?.delivery).length > 0 ? toArray(parsed?.evidenceBySource?.delivery).map(String) : normalized.evidenceBySource.delivery,
          jira: toArray(parsed?.evidenceBySource?.jira).length > 0 ? toArray(parsed?.evidenceBySource?.jira).map(String) : normalized.evidenceBySource.jira,
          github: toArray(parsed?.evidenceBySource?.github).length > 0 ? toArray(parsed?.evidenceBySource?.github).map(String) : normalized.evidenceBySource.github,
          notion: toArray(parsed?.evidenceBySource?.notion).length > 0 ? toArray(parsed?.evidenceBySource?.notion).map(String) : normalized.evidenceBySource.notion,
          calendar: toArray(parsed?.evidenceBySource?.calendar).length > 0 ? toArray(parsed?.evidenceBySource?.calendar).map(String) : normalized.evidenceBySource.calendar,
          rag: toArray(parsed?.evidenceBySource?.rag).length > 0 ? toArray(parsed?.evidenceBySource?.rag).map(String) : normalized.evidenceBySource.rag,
        },
      };
      return { answer: renderEmSections(merged) };
    }
  } catch (error) {
    console.error("⚠️ Response formatter failed, falling back to heuristic parsing:", error);
  }

  return { answer: renderEmSections(normalized) };
}

export function buildFallbackEmSections(rawAnswer, evidenceBySource) {
  const clean = String(rawAnswer || "").trim();
  const summary = clean || "No response generated.";
  const risks = [];
  const decisions = [];
  const actionItems = [];
  const lines = summary.split("\n").map((line) => line.trim()).filter(Boolean);

  let openCount = 0;
  let closedCount = 0;

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Match GitHub issue lines: - [#<num> <title>](<url>) | Status: <state> | Repo: <repo> | Author: @<author> | Assignee: @<assignee>
    const issueMatch = line.match(/-?\s*\[#(\d+)\s+([^\]]+)\]\((https:\/\/github\.com\/[^\)]+)\)(?:\s*\|\s*Status:\s*(\w+))?(?:\s*\|\s*Repo:\s*([^\s\|]+))?(?:\s*\|\s*Author:\s*@?([^\s\|]+))?(?:\s*\|\s*Assignee:\s*@?([^\s\|]+))?/i);

    if (issueMatch) {
      const issueNum = issueMatch[1];
      const issueTitle = issueMatch[2];
      const issueUrl = issueMatch[3];
      const issueState = issueMatch[4] || "open";
      const issueAuthor = issueMatch[6] || "unknown";
      const issueAssignee = issueMatch[7] || "Unassigned";

      const linkMD = `[#${issueNum} ${issueTitle}](${issueUrl})`;

      if (issueState.toLowerCase() === "open") {
        openCount += 1;
        const owner = issueAssignee !== "Unassigned" ? `@${issueAssignee}` : `@${issueAuthor}`;
        actionItems.push({
          owner,
          dueDate: "High Priority",
          description: `Triage & address open issue ${linkMD}`,
        });

        if (issueAssignee === "Unassigned") {
          risks.push(`Unassigned open issue ${linkMD} needs owner allocation`);
        } else {
          risks.push(`Active open issue ${linkMD} currently assigned to @${issueAssignee}`);
        }

        decisions.push(`Confirm priority and milestone assignment for ${linkMD}`);
      } else {
        closedCount += 1;
      }
    } else {
      if (lower.includes("risk") || lower.includes("blocker") || lower.includes("delay")) {
        risks.push(line.replace(/^[-*]\s*/, ""));
      }
      if (lower.includes("decide") || lower.includes("approval") || lower.includes("confirm")) {
        decisions.push(line.replace(/^[-*]\s*/, ""));
      }
      if ((line.startsWith("-") || line.startsWith("*")) && !issueMatch) {
        actionItems.push({
          owner: "Unassigned",
          dueDate: "TBD",
          description: line.replace(/^[-*]\s*/, ""),
        });
      }
    }
  }

  if (actionItems.length === 0) {
    actionItems.push({
      owner: "Unassigned",
      dueDate: "TBD",
      description: "No explicit action items required.",
    });
  }

  return {
    executiveSummary: summary,
    keyRisksAndBlockers: risks,
    whatNeedsDecision: decisions,
    actionItems,
    evidenceBySource,
  };
}

export function renderEmSections(payload) {
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
  for (const domain of ["dora", "delivery", "jira", "github", "notion", "calendar", "rag"]) {
    const entries = toArray(evidence[domain]);
    if (entries.length === 0) {
      lines.push(`- ${domain}: none`);
    } else {
      lines.push(`- ${domain}: ${entries.join("; ")}`);
    }
  }
  return lines.join("\n");
}

export function safeParseJson(content) {
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
