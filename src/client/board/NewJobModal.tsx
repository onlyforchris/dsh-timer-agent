/**
 * New-job modal: title + description + prompt + session targeting
 * (collapsible workspace tree) + optional cron schedule.
 *
 * The targeting tree is this plugin's headline feature: per workspace
 * (project) group a "new session each run" leaf plus that project's
 * existing sessions (pinned continuation); the leading default group
 * covers the default workspace. Selecting a session pins the job to that
 * conversation (hermes context_from semantics).
 */
import { useEffect, useMemo, useState } from 'react'
import type { ModelOptions, TargetGroup } from '../target-options.ts'
import type { BoardControllerFace } from '../controller-face.ts'
import { isValidCron } from '../../core/schedule.ts'
import { t, type TimerAgentKey } from '../locales.ts'
import css from '../board.module.css'
import { SelectField } from './SelectField.tsx'

/** One selectable leaf inside a group. */
export interface Leaf {
  key: string
  label: string
  workdir: string
  sessionId: string
}

/** Common scheduled-run presets (cron → locale label), task-board parity. */
const SCHEDULE_PRESETS: ReadonlyArray<{ cron: string; label: TimerAgentKey }> = [
  { cron: '*/2 * * * *', label: 'detail.schedule.preset.twoMin' },
  { cron: '*/10 * * * *', label: 'detail.schedule.preset.tenMin' },
  { cron: '0 * * * *', label: 'detail.schedule.preset.hourly' },
  { cron: '0 9 * * *', label: 'detail.schedule.preset.daily9' },
  { cron: '0 9 * * 1', label: 'detail.schedule.preset.weeklyMon9' },
]

/** The default-workspace placeholder group (used before options load). */
export const DEFAULT_TARGET_GROUPS: TargetGroup[] = []

/** Flatten a group into its selectable leaves: new-session first, sessions after. */
export function leavesOf(group: TargetGroup): Leaf[] {
  return [
    { key: `${group.key}:new`, label: '新增会话', workdir: group.workdir, sessionId: '' },
    ...group.sessions.map(session => ({
      key: `${group.key}:ss:${session.id}`,
      label: session.title,
      workdir: group.workdir,
      sessionId: session.id,
    })),
  ]
}

/** One selectable model option (flattened across provider groups). */
interface ModelLeaf {
  key: string
  label: string
  provider: string
  model: string
}

/**
 * The collapsible session-target tree (shared by the new-job modal and the
 * job-detail editor). Pure presentational: callers own groups/selection.
 */
export function TargetTree({ groups, expanded, selectedKey, onToggle, onSelect }: {
  groups: TargetGroup[]
  expanded: ReadonlySet<string>
  selectedKey: string
  onToggle(key: string): void
  onSelect(key: string): void
}) {
  return (
    <div className={css.targetTree} role="tree" aria-label={t('new.target')}>
      {groups.map(group => {
        const open = expanded.has(group.key)
        const leaves = leavesOf(group)
        return (
          <div key={group.key} className={css.targetGroup} role="group">
            <button
              type="button"
              className={css.targetGroupHeader}
              aria-expanded={open}
              onClick={() => { onToggle(group.key) }}
            >
              <span className={`${css.targetCaret} ${open ? css.targetCaretOpen : ''}`} aria-hidden="true">▸</span>
              <span className={css.targetGroupName}>{group.name}</span>
              <span className={css.targetGroupCount}>{group.sessions.length > 0 ? `${group.sessions.length}` : ''}</span>
            </button>
            {open && (
              <div className={css.targetGroupBody}>
                {leaves.map(leaf => (
                  <button
                    key={leaf.key}
                    type="button"
                    role="treeitem"
                    aria-selected={leaf.key === selectedKey}
                    className={`${css.targetRow} ${leaf.key === selectedKey ? css.targetRowSelected : ''}`}
                    onClick={() => { onSelect(leaf.key) }}
                    title={leaf.sessionId === '' ? `${group.name} · 新增会话` : leaf.label}
                  >
                    <span className={css.targetRowDot} aria-hidden="true" />
                    <span className={css.targetRowLabel}>{leaf.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Prefer the multimodal Flash-Vision-Exp entry; otherwise the last catalog leaf. */
export function pickDefaultModelKey(leaves: ReadonlyArray<ModelLeaf>): string {
  if (leaves.length === 0) return ''
  const preferred = [...leaves].reverse().find(leaf =>
    /flash-vision-exp/i.test(leaf.model) || /flash-vision-exp/i.test(leaf.label),
  )
  return preferred?.key ?? leaves[leaves.length - 1].key
}

/** Flatten provider groups into selectable model leaves. */
function modelLeavesOf(options: ModelOptions): ModelLeaf[] {
  const leaves: ModelLeaf[] = []
  for (const group of options.groups) {
    for (const model of group.models) {
      leaves.push({
        key: `${group.id}\u0000${model.id}`,
        label: `${group.name} · ${model.name}`,
        provider: group.id,
        model: model.id,
      })
    }
  }
  return leaves
}

/** New-job form overlay. */
export function NewJobModal({ controller, targetOptions, modelOptions, onClose }: { controller: BoardControllerFace; targetOptions: () => Promise<TargetGroup[]>; modelOptions: () => Promise<ModelOptions>; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [groups, setGroups] = useState<TargetGroup[]>(DEFAULT_TARGET_GROUPS)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set<string>())
  const [selectedKey, setSelectedKey] = useState('')
  const [modelOptionsState, setModelOptionsState] = useState<ModelOptions>({ groups: [] })
  const [modelKey, setModelKey] = useState('')
  const [cronEnabled, setCronEnabled] = useState(false)
  const [cron, setCron] = useState('0 9 * * *')
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let alive = true
    void targetOptions().then(next => {
      if (!alive || next.length === 0) return
      setGroups(next)
      const preferred = next.find(group => /im-workspace$/i.test(group.workdir.replaceAll('\\', '/')))
        ?? next[0]
      setSelectedKey(`${preferred.key}:new`)
      setExpanded(new Set([preferred.key]))
    }).catch(() => undefined)
    void modelOptions().then(next => {
      if (!alive) return
      setModelOptionsState(next)
      const leaves = modelLeavesOf(next)
      setModelKey(prev => (prev !== '' ? prev : pickDefaultModelKey(leaves)))
    }).catch(() => undefined)
    return () => { alive = false }
  }, [targetOptions, modelOptions])

  /** All leaves across groups, for resolving the current selection. */
  const leafOf = useMemo(() => {
    const map = new Map<string, Leaf>()
    for (const group of groups) for (const leaf of leavesOf(group)) map.set(leaf.key, leaf)
    return map
  }, [groups])

  const selected = leafOf.get(selectedKey) ?? (
    groups[0] !== undefined
      ? { key: `${groups[0].key}:new`, label: '', workdir: groups[0].workdir, sessionId: '' }
      : { key: '', label: '', workdir: 'D:\\DSH\\im-workspace', sessionId: '' }
  )

  /** Catalog models only — no synthetic “follow default” row. */
  const modelLeaves = useMemo(() => modelLeavesOf(modelOptionsState), [modelOptionsState])
  const modelSelectOptions = useMemo(
    () => modelLeaves.map(leaf => ({ value: leaf.key, label: leaf.label })),
    [modelLeaves],
  )
  const toggleGroup = (key: string): void => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const submit = (): void => {
    // Stage the cron so createJob arms the schedule server-side in one call.
    controller.stageCreateCron?.(cronEnabled && isValidCron(cron) ? cron : undefined)
    const model = modelLeaves.find(leaf => leaf.key === modelKey)
      ?? modelLeaves.find(leaf => leaf.key === pickDefaultModelKey(modelLeaves))
    const defaultEffort = modelOptionsState.default?.reasoningEffort
    const created = controller.createJob({
      title,
      description,
      prompt,
      target: { workdir: selected.workdir, sessionId: selected.sessionId },
      ...model === undefined ? {} : {
        modelSelection: {
          provider: model.provider,
          model: model.model,
          ...defaultEffort === undefined || defaultEffort === ''
            ? {}
            : { reasoningEffort: defaultEffort },
        },
      },
    })
    void Promise.resolve(created).then(job => {
      if (job === undefined) {
        setError(t('new.required'))
        return
      }
      onClose()
    })
  }

  return (
    <div className={css.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <form
        className={css.modal}
        role="dialog"
        aria-label={t('board.new')}
        onSubmit={event => { event.preventDefault(); submit() }}
      >
        <h2 className={css.modalTitle}>{t('board.new')}</h2>

        <label className={css.field}>
          <span className={css.fieldLabel}>{t('new.title')}</span>
          <input
            className={css.input}
            value={title}
            autoFocus
            placeholder={t('new.titlePlaceholder')}
            onChange={event => { setTitle(event.target.value); setError(undefined) }}
          />
        </label>

        <label className={css.field}>
          <span className={css.fieldLabel}>{t('new.description')}</span>
          <textarea
            className={css.input}
            rows={1}
            value={description}
            placeholder={t('new.descriptionPlaceholder')}
            onChange={event => { setDescription(event.target.value) }}
          />
        </label>

        <label className={css.field}>
          <span className={css.fieldLabel}>{t('new.prompt')}</span>
          <textarea
            className={css.input}
            rows={3}
            value={prompt}
            placeholder={t('new.promptPlaceholder')}
            onChange={event => { setPrompt(event.target.value) }}
          />
        </label>

        <div className={css.field}>
          <span className={css.fieldLabel}>{t('new.target')}</span>
          <TargetTree
            groups={groups}
            expanded={expanded}
            selectedKey={selectedKey}
            onToggle={toggleGroup}
            onSelect={setSelectedKey}
          />
          <span className={css.fieldHint}>{t('new.target.hint')}</span>
        </div>

        <label className={css.field}>
          <span className={css.fieldLabel}>{t('new.model')}</span>
          <SelectField
            value={modelKey}
            options={modelSelectOptions}
            ariaLabel={t('new.model')}
            onChange={setModelKey}
          />
        </label>

        <div className={css.field}>
          <label className={css.scheduleToggle}>
            <input
              type="checkbox"
              className={css.checkbox}
              checked={cronEnabled}
              onChange={event => { setCronEnabled(event.target.checked) }}
            />
            <span>{t('new.schedule.enable')}</span>
          </label>
          {cronEnabled && (
            <div className={css.scheduleRow}>
              <input
                className={`${css.input} ${css.scheduleInput}`}
                value={cron}
                placeholder="0 9 * * *"
                spellCheck={false}
                aria-label={t('new.schedule.cron')}
                onChange={event => { setCron(event.target.value); setError(undefined) }}
              />
              <SelectField
                className={css.schedulePreset}
                value={SCHEDULE_PRESETS.some(preset => preset.cron === cron) ? cron : ''}
                options={[
                  { value: '', label: `${t('detail.schedule.presets')}…` },
                  ...SCHEDULE_PRESETS.map(preset => ({ value: preset.cron, label: t(preset.label) })),
                ]}
                ariaLabel={t('detail.schedule.presets')}
                onChange={next => {
                  if (next !== '') {
                    setCron(next)
                    setError(undefined)
                  }
                }}
              />
            </div>
          )}
        </div>

        {error !== undefined && <p className={css.formError}>{error}</p>}

        <footer className={css.modalFooter}>
          <button type="button" className={css.ghostButton} onClick={onClose}>
            {t('new.cancel')}
          </button>
          <button type="submit" className={css.primaryButton}>
            {t('new.submit')}
          </button>
        </footer>
      </form>
    </div>
  )
}
