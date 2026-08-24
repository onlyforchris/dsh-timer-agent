# dsh-timer-agent — Scheduled jobs for DSH

[中文](./README.md) | English

A personally maintained [DeepSeek Harness (DSH)](https://deepseek-harness.github.io/deepseek-harness/) Web plugin: a host-resident cron engine inside `dsh web` that **runs your prompt in a real agent session** on schedule — including when the GUI is closed. Forked from [LouisHaoL/dsh-timer-agent](https://github.com/LouisHaoL/dsh-timer-agent) and tuned for an IM sandbox workdir (`im-workspace`).

Repo: [onlyforchris/dsh-timer-agent](https://github.com/onlyforchris/dsh-timer-agent) · Release: [v0.1.2](https://github.com/onlyforchris/dsh-timer-agent/releases/tag/v0.1.2)

![New job modal: real workspace target tree + model picker](docs/screenshot.png)

## What it does

At each due cron (5-field) it executes your prompt through a **real agent session**:

- **Pin an existing session** → every run continues that conversation
- **Set a project workdir** → every run starts a fresh session in that project (`AGENTS.md` loads)
- **Prefer a real workspace** (e.g. `im-workspace`) for new sessions; the empty “default workspace” placeholder is removed

Manage jobs from any chat with the `timer_agent` tool (create / list / update / pause / resume / remove / run), or from the sidebar「定时任务」board — **one ledger, three doorways** (tool / WebUI / file).

## Architecture

```
┌─ dsh web host process ────────────────────────────┐
│  60s ticker (resident; runs with GUI closed)      │
│   ├─ HostJobStore   ~/.dsh/timer-agent/jobs.json  │
│   │                 (atomic writes, safe degrade) │
│   ├─ TimerRunner    at-most-once: roll nextRunAt  │
│   │                 before fire; skip while busy  │
│   │   ├─ agents.resume (pinned session)           │
│   │   └─ agents.create + workspaceRegistry        │
│   │       (optional default IM sandbox workdir)   │
│   ├─ timer_agent tool                             │
│   └─ /api/dsh-timer-agent/* (loopback only)       │
└────────────────────────┬──────────────────────────┘
                         │ HTTP poll mirror (5s)
┌─ Browser half (thin)───┴──────────────────────────┐
│  Sidebar + jobs board (React)                     │
│  Workspace/session tree · cron presets · history  │
└───────────────────────────────────────────────────┘
```

Settlement uses `session/event` (`turn/end` `reason.kind`); failure reasons land in the ledger.

## Features

- **Scheduling**: 5-field cron + presets (daily 09:00 / hourly / every 10 min / Mondays 09:00)
- **Target tree**: per-workspace groups with “new session” + existing sessions; picking a session pins it
- **Jobs board**: list, search, detail (cron edit / history / open session / run now / reset / delete)
- **Model selection**: optional provider/model on create, including deployment `reasoningEffort`
- **Model tool**: `timer_agent` in any conversation
- **System-prompt injection**: host `plugin:timer-agent` section
- **Safety**: loopback + same-origin API fence

## Fork deltas vs upstream

- Optional default workdir → `im-workspace` (IM sandbox)
- **ASCII-only session ids** (Chinese titles no longer break DeepSeek header ByteString → fake `TRANSPORT`)
- 「查看会话」closes the timer board before opening the transcript
- Board forms styled with host UI tokens (custom select, etc.)

## Install

**A · Release tarball**

Download `dsh-timer-agent-*.tgz` from [Releases](https://github.com/onlyforchris/dsh-timer-agent/releases):

```sh
dsh plugin --profile web add ./dsh-timer-agent-0.1.2.tgz
```

**B · Local link**

```sh
pnpm install && pnpm run build
dsh plugin --profile web add link:<absolute path to this directory>
```

Then **restart `dsh web`** (e.g. via your DSH management bat). Sidebar「定时任务」confirms it is live (`Ctrl+F5` for browser-side changes).

## Build & test

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm test           # behavioral E2E (fake host; no live dsh)
pnpm run smoke-test
```

E2E covers cron/next-run, ledger atomic write + corrupt degrade, at-most-once fire, pinned resume, `turn/end` settlement, skip-while-running, disabled schedules, manual run, workdir / defaultWorkdir, Chinese title → ASCII session id, `timer_agent` actions, and HTTP CRUD + loopback fence.

## Known limits

- Needs a live `dsh web` process; after restart only already-rolled-forward dues run (missed = missed)
- Mid-run dues are skipped until the next cron match
- Uses API quota; unattended prompts must be self-contained
- Sessions whose ids already contain non-ASCII may still `TRANSPORT` — re-run under this version to mint a new session

## License

[MIT](./LICENSE)
