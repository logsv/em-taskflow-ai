#!/usr/bin/env python3
"""Render GitHub Actions step summaries from real CI outputs.

Every value in the table is parsed from an artifact produced by the current
run (test logs, evaluation report, coverage summary). When an artifact is
missing or unparseable -- typically because its step failed or was skipped --
the cell shows ``n/a`` with a ❌ status. Nothing is ever defaulted.

Usage:
  ci_summary.py backend --unit-log FILE --unit-outcome OUTCOME \
                        --eval-report FILE --eval-outcome OUTCOME \
                        [--coverage-summary FILE]
  ci_summary.py python  --pytest-log FILE --pytest-outcome OUTCOME

OUTCOME is the GitHub ``steps.<id>.outcome`` value
(success | failure | cancelled | skipped), or empty if unknown.

The script prints Markdown to stdout and always exits 0 so a summary is
produced even when the job is already failing.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PASS = "🟢 PASS"
FAIL = "🔴 FAIL"
NA = "n/a"
NA_STATUS = "❌ n/a"
INFO = "ℹ️ info"

# Fallback SLA thresholds, used only when the eval report does not carry its
# own `gates` block. These are targets, not results.
DEFAULT_GATES = {
    "domainSelectionAccuracyMin": 0.90,
    "unwantedRagRateMax": 0.05,
    "toolGroundedRateMin": 0.95,
    "toolAbstentionRateMin": 0.95,
    "astValidationRateMin": 0.95,
    "coreferenceRateMin": 0.85,
}
FAST_PATH_MAX_MS = 300
RAG_FAITHFULNESS_MIN = 0.90


def read_text(path: str | None) -> str | None:
    if not path:
        return None
    p = Path(path)
    if not p.is_file():
        return None
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def strip_ansi(text: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", text)


def outcome_note(outcome: str | None) -> str:
    return f"step {outcome}" if outcome else "step did not report"


# --------------------------------------------------------------------------
# Parsers
# --------------------------------------------------------------------------

JASMINE_RE = re.compile(
    r"^(\d+) specs?, (\d+) failures?(?:, (\d+) pending specs?)?\s*$", re.MULTILINE
)


def parse_jasmine(log: str | None) -> dict | None:
    """Return {'specs', 'failures', 'pending', 'incomplete'} from Jasmine output."""
    if log is None:
        return None
    text = strip_ansi(log)
    matches = JASMINE_RE.findall(text)
    if not matches:
        return None
    specs, failures, pending = matches[-1]
    return {
        "specs": int(specs),
        "failures": int(failures),
        "pending": int(pending or 0),
        "incomplete": bool(re.search(r"^Incomplete:", text, re.MULTILINE)),
    }


PYTEST_LINE_RE = re.compile(r"^=+ (.+?) in [\d.]+s(?: \([^)]*\))? =+\s*$", re.MULTILINE)
PYTEST_COUNT_RE = re.compile(
    r"(\d+) (passed|failed|errors?|skipped|xfailed|xpassed|deselected|warnings?)"
)


def parse_pytest(log: str | None) -> dict | None:
    """Return counts from pytest's final summary line, e.g.
    ``===== 11 failed, 46 passed, 8 warnings in 5.09s =====``."""
    if log is None:
        return None
    text = strip_ansi(log)
    lines = PYTEST_LINE_RE.findall(text)
    if not lines:
        return None
    counts = {"passed": 0, "failed": 0, "errors": 0, "skipped": 0,
              "xfailed": 0, "xpassed": 0, "deselected": 0, "warnings": 0}
    found = False
    for num, kind in PYTEST_COUNT_RE.findall(lines[-1]):
        key = {"error": "errors", "warning": "warnings"}.get(kind, kind)
        counts[key] = int(num)
        found = True
    if not found and "no tests ran" not in lines[-1]:
        return None
    counts["raw"] = lines[-1].strip()
    return counts


def load_json(path: str | None) -> dict | None:
    text = read_text(path)
    if text is None:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def num(value) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


# --------------------------------------------------------------------------
# Table helpers
# --------------------------------------------------------------------------

def row(metric: str, target: str, result: str, status: str) -> str:
    return f"| **{metric}** | {target} | {result} | {status} |"


def pct(v: float) -> str:
    return f"{v * 100:.2f}%"


def gate_row(metric, value, threshold, op, fmt, missing_reason) -> str:
    target = f"{'≥' if op == 'min' else '≤' if op == 'max' else '<'} {fmt(threshold)}"
    if value is None:
        return row(metric, target, f"{NA} ({missing_reason})", NA_STATUS)
    if op == "min":
        ok = value >= threshold
    elif op == "max":
        ok = value <= threshold
    else:  # strict less-than
        ok = value < threshold
    return row(metric, target, fmt(value), PASS if ok else FAIL)


# --------------------------------------------------------------------------
# Backend summary
# --------------------------------------------------------------------------

def render_backend(args) -> str:
    out = [
        "## 📊 EM TaskFlow AI — CI & Evaluation Summary",
        "",
        "| Metric / Suite | SLA Target | Result | Status |",
        "| :--- | :--- | :--- | :--- |",
    ]

    # Unit tests -----------------------------------------------------------
    unit = parse_jasmine(read_text(args.unit_log))
    if unit is None:
        out.append(row("Backend Unit Tests", "0 failures", f"{NA} ({outcome_note(args.unit_outcome)})", NA_STATUS))
    else:
        result = f"{unit['specs']} specs, {unit['failures']} failures"
        if unit["pending"]:
            result += f", {unit['pending']} pending"
        ok = (
            unit["specs"] > 0
            and unit["failures"] == 0
            and not unit["incomplete"]
            and args.unit_outcome == "success"
        )
        if not ok and unit["failures"] == 0 and args.unit_outcome != "success":
            result += f" ({outcome_note(args.unit_outcome)})"
        out.append(row("Backend Unit Tests", "0 failures", result, PASS if ok else FAIL))

    # Coverage (informational, no SLA) ------------------------------------
    if args.coverage_summary:
        cov = load_json(args.coverage_summary)
        lines_pct = num(((cov or {}).get("total") or {}).get("lines", {}).get("pct"))
        if lines_pct is None:
            out.append(row("Line Coverage (nyc)", "—", f"{NA} (no coverage data)", NA_STATUS))
        else:
            out.append(row("Line Coverage (nyc)", "—", f"{lines_pct:.2f}%", INFO))

    # Evaluation report ----------------------------------------------------
    report = None
    if args.eval_outcome in ("success", "failure"):
        report = load_json(args.eval_report)
    if report is None:
        if args.eval_outcome in ("success", "failure"):
            reason = f"step {args.eval_outcome} but wrote no report"
        else:
            reason = outcome_note(args.eval_outcome)
    else:
        reason = "not in report"

    r = report or {}
    gates = {**DEFAULT_GATES, **{k: v for k, v in (r.get("gates") or {}).items() if num(v) is not None}}

    def metric(key):
        return num(r.get(key)) if report is not None else None

    def sampled(key, samples_key):
        if report is None:
            return None, reason
        samples = r.get(samples_key)
        if isinstance(samples, int) and samples == 0:
            return None, "0 samples"
        return num(r.get(key)), reason

    out.append(gate_row("Domain Selection Accuracy", metric("domain_selection_accuracy"),
                        gates["domainSelectionAccuracyMin"], "min", pct, reason))
    out.append(gate_row("Tool Grounded Rate (1-Tool bounding)", metric("tool_grounded_rate"),
                        gates["toolGroundedRateMin"], "min", pct, reason))
    out.append(gate_row("Tool Abstention Rate", metric("tool_abstention_rate"),
                        gates["toolAbstentionRateMin"], "min", pct, reason))
    out.append(gate_row("AST Schema Validity", metric("ast_validation_rate"),
                        gates["astValidationRateMin"], "min", pct, reason))
    out.append(gate_row("Unwanted RAG Rate", metric("unwanted_rag_rate"),
                        gates["unwantedRagRateMax"], "max", pct, reason))
    v, why = sampled("coreference_resolution_rate", "context_samples")
    out.append(gate_row("Coreference Resolution Rate", v, gates["coreferenceRateMin"], "min", pct, why))
    v, why = sampled("fast_path_latency_ms", "fast_path_samples")
    out.append(gate_row("Fast-Path Pre-Router Latency (p95)", v, FAST_PATH_MAX_MS, "lt",
                        lambda x: f"{x:.0f} ms", why))
    v, why = sampled("rag_faithfulness", "rag_samples")
    out.append(gate_row("RAG Faithfulness (heuristic)", v, RAG_FAITHFULNESS_MIN, "min",
                        lambda x: f"{x:.4f}", why))

    out.append("")
    if report is not None:
        model = r.get("model") or NA
        total = r.get("total_prompts", NA)
        ts = r.get("timestamp") or NA
        status = r.get("status") or NA
        out.append(f"*Evaluation model: `{model}` · {total} prompts · report `{ts}` · gate status: **{status}***")
    else:
        out.append(f"*Evaluation report unavailable ({reason}).*")
    out.append(
        f"*Step outcomes — unit tests: `{args.unit_outcome or 'unknown'}`, "
        f"evaluation: `{args.eval_outcome or 'unknown'}`.*"
    )
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------
# Python summary
# --------------------------------------------------------------------------

def render_python(args) -> str:
    out = [
        "### 🐍 Python AI Service Test Suite Summary",
        "",
        "| Suite | SLA Target | Result | Status |",
        "| :--- | :--- | :--- | :--- |",
    ]
    res = parse_pytest(read_text(args.pytest_log))
    if res is None:
        out.append(row("Pytest", "0 failed, 0 errors", f"{NA} ({outcome_note(args.pytest_outcome)})", NA_STATUS))
    else:
        parts = [f"{res['passed']} passed", f"{res['failed']} failed", f"{res['errors']} errors"]
        if res["skipped"]:
            parts.append(f"{res['skipped']} skipped")
        ok = (
            res["passed"] > 0
            and res["failed"] == 0
            and res["errors"] == 0
            and args.pytest_outcome == "success"
        )
        result = ", ".join(parts)
        if not ok and res["failed"] == 0 and res["errors"] == 0 and args.pytest_outcome != "success":
            result += f" ({outcome_note(args.pytest_outcome)})"
        out.append(row("Pytest", "0 failed, 0 errors", result, PASS if ok else FAIL))
    out.append("")
    out.append(f"*Step outcome — pytest: `{args.pytest_outcome or 'unknown'}`.*")
    return "\n".join(out) + "\n"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("backend")
    b.add_argument("--unit-log")
    b.add_argument("--unit-outcome", default="")
    b.add_argument("--eval-report")
    b.add_argument("--eval-outcome", default="")
    b.add_argument("--coverage-summary")

    p = sub.add_parser("python")
    p.add_argument("--pytest-log")
    p.add_argument("--pytest-outcome", default="")

    args = parser.parse_args(argv)
    try:
        md = render_backend(args) if args.cmd == "backend" else render_python(args)
    except Exception as exc:  # never let summary rendering crash silently into a green table
        md = f"❌ **CI summary could not be rendered:** `{type(exc).__name__}: {exc}`\n"
    sys.stdout.write(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
