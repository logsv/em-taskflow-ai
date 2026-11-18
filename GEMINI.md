# GEMINI.md

Guidance for Gemini CLI in this repository. Architecture, hard rules and commands are maintained in **AGENTS.md**, the single source of truth for all coding agents, and imported here:

@./AGENTS.md

## Gemini CLI notes
- Task procedures are in `.agents/skills/*/SKILL.md` (a symlink to `.claude/skills/`). The index is in `SKILLS.md`. Read the relevant skill before changing an area.
- Before declaring a change done, run `bash scripts/verify.sh` and report its actual output.
