/**
 * Host loader entry for the dsh-timer-agent plugin — the host-authoritative
 * engine (hermes-agent cron shape): a 60s in-process ticker that fires due
 * jobs through the real agent registry (GUI open or not), a file-backed
 * ledger at ~/.dsh/timer-agent/jobs.json, the `timer_agent` model tool so
 * any conversation can create/manage jobs, and /api/dsh-timer-agent routes
 * the web UI reads and writes through.
 */

import type { Context } from '@deepseek-ai/cordis'
// `ctx.settings` is an optional Cordis service: importing the module only for its
// type augmentation. The runtime wiring goes through `ctx.inject(['settings'], …)`,
// never through a named export — `installSettingsSection`/`settingsNamespace` were
// removed in dsh-settings 0.1.2 and replaced by `settings.installSection`.
import type {} from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { HostPluginContext } from './host/contracts.ts'
import { HostJobStore } from './host/store.ts'
import { TimerRunner } from './host/runner.ts'
import { registerTimerTool } from './host/tools.ts'
import { makeRoutes } from './host/routes.ts'

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 201

export const inject = ['webServer', 'tools', 'systemPrompt', 'agents']

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const TIMER_AGENT_GUIDANCE = '本机已安装 dsh-timer-agent 插件（定时任务）：60 秒 ticker 在 dsh web 宿主进程常驻，GUI 关闭也会触发。台账在 ~/.dsh/timer-agent/jobs.json。支持 5 段 cron；可指定项目 workdir 或钉住会话；未指定 workdir 时默认跑在 IM 工作区（插件配置 defaultWorkdir）。到点通过真实 agent 会话执行自包含 prompt。可用 timer_agent 工具或侧边栏「定时任务」管理。执行消耗 API 额度；无人在场，prompt 不可提问。'

/**
 * Settings namespace of the plugin's capability.
 * A lowercase-hyphenated identifier — dsh-settings validates the literal shape
 * at compile time and again at registration.
 */
export const TIMER_AGENT_SETTINGS_NAMESPACE = 'timer-agent'

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /** When true (default), a system-prompt section announces the plugin. */
  announceToAgent?: boolean
  /** Master switch for the plugin (ticker + tool + routes). */
  enabled?: boolean
  /**
   * Absolute path used when a job leaves workdir blank (new-session runs).
   * Defaults to the DSH IM sandbox so timed jobs land with the right AGENTS.md.
   */
  defaultWorkdir?: string
}

export const Config: z<Config> = z.object({
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
  defaultWorkdir: z.string().default('D:\\DSH\\im-workspace'),
})

/** Schema default, re-read for hand-built test contexts. */
const DEFAULT_ANNOUNCE = true
const DEFAULT_WORKDIR = 'D:\\DSH\\im-workspace'

/**
 * Mount the engine: ticker + runner, tool, routes, announcement.
 * @param ctx - host plugin context (webServer/tools/systemPrompt/agents).
 * @param config - resolved plugin config.
 */
export function apply(ctx: Context, config?: Config): void {
  const host = ctx as unknown as HostPluginContext
  let current: () => Config = () => config ?? {}
  let disposeEngine: (() => void) | undefined
  let disposeTool: (() => void) | undefined
  let disposeSection: (() => void) | undefined

  const sync = (): void => {
    for (const dispose of [disposeEngine, disposeTool, disposeSection]) dispose?.()
    disposeEngine = undefined
    disposeTool = undefined
    disposeSection = undefined
    if ((current().enabled ?? true) === false) return

    const store = new HostJobStore()
    const runner = new TimerRunner({
      ctx: host,
      store,
      defaultWorkdir: current().defaultWorkdir ?? DEFAULT_WORKDIR,
    })
    runner.start()

    disposeTool = ctx.effect(() => registerTimerTool(ctx.tools!, {
      store,
      runner,
      now: () => Date.now(),
    }), 'dsh-timer-agent: tool')

    const routes = makeRoutes({ store, runner, ctx: host, now: () => Date.now() })
    disposeEngine = () => {
      void runner.dispose()
      for (const route of routes) void route
    }
    const disposeRoutes = ctx.effect(() => {
      const disposers = routes.map(route => ctx.webServer.register(route))
      return () => { for (const dispose of disposers) dispose() }
    }, 'dsh-timer-agent: routes')
    // Routes unregister with the engine (single teardown path).
    const engineTeardown = disposeEngine
    disposeEngine = () => {
      engineTeardown()
      disposeRoutes()
    }

    if ((current().announceToAgent ?? DEFAULT_ANNOUNCE) === true) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:timer-agent',
        order: SECTION_ORDER,
        text: TIMER_AGENT_GUIDANCE,
      })
    }
  }

  // `settings` is an optional service, so it must NOT go in the top-level `inject`
  // array — that would make the plugin fail to load wherever no provider is
  // mounted. Going through `ctx.inject` keeps the composition entry (`config`)
  // authoritative until a provider appears, and falls back to it on detach —
  // exactly the old `installSettingsSection` contract.
  const entry: Config = config ?? {}
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, TIMER_AGENT_SETTINGS_NAMESPACE, Config, entry, {
      setSource: (source) => { current = source },
      onChange: sync,
    })
  })

  sync()
}
