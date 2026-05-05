# Ausschreibungs-Scanner — Claude Code Guidance

## Project

Automated EU tender scanner for Figures (Berlin design agency). Polls TED API daily, triages with Claude Haiku (0-10 score), sends tiered HTML email digest via Gmail SMTP, runs full Sonnet analysis for top-scored tenders. Deployed as Railway cron job.

Planning docs: `.planning/`

## GSD Workflow

This project uses GSD for planning and execution.

**Before starting any phase:**
- Read `.planning/STATE.md` for current status
- Read `.planning/ROADMAP.md` for phase details and requirements
- Use `/gsd-discuss-phase N` to gather context, then `/gsd-plan-phase N` to plan

**During execution:**
- Commit after each completed task
- Never skip the SQLite WAL mode setup — required for Railway
- Always paginate TED results to exhaustion (log total vs. fetched)
- Hard cap: max 5 Sonnet full-analyses per day

## Critical Technical Constraints

- **TED API domain**: `api.ted.europa.eu` (NOT `tedapi.publications.europa.eu` — wrong domain)
- **Railway SQLite**: Must mount Volume at `/data` — container filesystem is ephemeral
- **Gmail SMTP**: Test auth at job startup before any pipeline work
- **Job lock**: Prevent concurrent Railway cron executions via SQLite job_lock table
- **Query overlap**: TED queries use 1-day overlap to avoid UTC midnight gaps

## Stack

- Node.js 22 + TypeScript + tsx
- `better-sqlite3` (WAL mode, `/data/scanner.db`)
- `nodemailer` + Gmail SMTP (App Password)
- Anthropic SDK — `claude-haiku-4-5` for triage, `claude-sonnet-4-6` for full analysis
- Railway (cron job + persistent Volume)

## Current Phase

See `.planning/STATE.md`
