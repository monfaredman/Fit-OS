# AI Workflow Hub — GymOS

Shared coordination layer for all coding agents. **Do not duplicate project rules
in tool-specific files.**

## Read order (every agent, every task)

1. [PROJECT.md](PROJECT.md) — project facts, commands, constraints
2. [WORKFLOW.md](WORKFLOW.md) — lifecycle, ownership, handoff, review
3. Active task under [tasks/](tasks/) — current work state

New tasks: copy [TASK_TEMPLATE.md](TASK_TEMPLATE.md) into `tasks/`.

## Source-of-truth order

1. Current code and configuration
2. [`.env.example`](../.env.example) and root [`package.json`](../package.json) scripts
3. [DECISIONS.md](DECISIONS.md)
4. Design + product pack — [`design/`](../design/), [`product/`](../product/), [`ai/`](../ai/)
5. [`gymos-iran-teardown.html`](../gymos-iran-teardown.html) — strategy, least operational

The planning pack is deep and deliberate. **Read the relevant design doc before
implementing** — most questions are already answered there, with the reasoning.

## Native adapter discovery matrix

| Tool | Native entrypoint |
|------|-------------------|
| Codex / generic | [`AGENTS.md`](../AGENTS.md) (primary) |
| Claude Code | [`CLAUDE.md`](../CLAUDE.md) |
| Gemini CLI | [`GEMINI.md`](../GEMINI.md) |

All adapters must point here — not invent parallel instructions.
