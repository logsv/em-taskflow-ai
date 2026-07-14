import { getChatModel } from "../llm/index.js";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function buildEmResponse(query, rawAnswer, evidenceBySource, decision) {
  if (decision.needsClarification) {
    return {
      answer: rawAnswer,
    };
  }

  const normalized = buildFallbackEmSections(rawAnswer, evidenceBySource);
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
    const parsed = safeParseJson(modelResponse?.content);
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
