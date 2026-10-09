/** Official lazy-CJS browser half. Uses the existing human command RPC and keyed command renderer. */
import { useState, useRef } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { readReply, commandOutcome } from './protocol.ts'
import type { Request, Reply } from './protocol.ts'
import type { Checkpoint, Preview } from './store.ts'
import { zh, en } from './locales.ts'
import type { Key } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'timeMachine': Key }
}
type Localized = PropsLocale<'timeMachine'>
interface Actions { run: (request: Request) => Promise<Reply | void> }
type ActionProps = InjectFace<Actions> & Localized
export const inject = ['slots', 'locale', 'remote', 'remote.commands']
export const name = 'time-machine-client'

const css = `
.dsh-tm{box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.6;max-width:100%;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-specific-menu)}
.dsh-tm header,.dsh-tm footer{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.dsh-tm header{justify-content:space-between}.dsh-tm h3{margin:0;font-size:14px}.dsh-tm p{margin:8px 0;color:var(--dsw-alias-label-secondary)}
.dsh-tm button,.dsh-tm input{font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:5px 10px}.dsh-tm button{cursor:pointer}.dsh-tm button:disabled{opacity:.45;cursor:default}.dsh-tm button:focus-visible,.dsh-tm input:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.dsh-tm article{padding:12px 0;border-top:1px solid var(--dsw-alias-border-l1);overflow-wrap:anywhere}.dsh-tm small{color:var(--dsw-alias-label-tertiary)}.dsh-tm pre{white-space:pre;overflow:auto;max-height:420px;font-size:12px;padding:10px;border:1px solid var(--dsw-alias-border-l1)}
.dsh-tm fieldset{border:0;margin:10px 0;padding:0;max-height:180px;overflow:auto}.dsh-tm label{display:block;overflow-wrap:anywhere}.dsh-tm label input{margin-right:8px}.dsh-tm [role=alert]{padding:8px;border-left:3px solid currentColor}.dsh-tm-dock{padding:4px 10px;margin:4px auto;width:fit-content}
`

/** A synchronous latch prevents repeated clicks before React has rendered disabled controls. */
function useAction(run: Actions['run']) {
  const latch = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return { pending, error, invoke: async (request: Request) => {
    if (latch.current) return
    latch.current = true; setPending(true); setError('')
    try { await run(request) } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { latch.current = false; setPending(false) }
  } }
}

export function Dock({ run, t }: PropsRuntime<'conversation.input.dock'> & ActionProps) {
  const [reply, setReply] = useState<Reply>()
  const show = async (request: Request) => { const next = await run(request); if (next) setReply(next) }
  const { invoke, pending, error } = useAction(show)
  return <div className="dsh-tm dsh-tm-dock"><button disabled={pending} onClick={() => reply ? setReply(undefined) : void invoke({ action: 'list' })}>{pending ? t('working') : reply ? t('close') : t('open')}</button>{error && <p role="alert">{error}</p>}
    {reply && <div style={{ maxHeight: '50vh', overflow: 'auto' }}><ReplyView reply={reply} run={show} t={t} /></div>}
  </div>
}

function RecordRow({ record, run, t }: { record: Checkpoint } & ActionProps) {
  const [label, setLabel] = useState(record.label)
  const { invoke, pending, error } = useAction(run)
  return <article>
    <strong>{record.label || `${t('turn')} ${record.turn}`}</strong> <small>{new Date(record.time).toLocaleString()} · {record.changes.length} {t('files')}</small>
    {record.skipped.length > 0 && <p>{record.skipped.length} {t('skipped')}</p>}
    {record.status === 'prepared' ? <p role="alert">{t('prepared')}</p> : <p>{record.changes.slice(0, 8).map(change => change.path).join(' · ')}{record.changes.length > 8 ? ' …' : ''}</p>}
    <footer>
      <button disabled={pending || !record.changes.length || record.status !== 'complete'} onClick={() => void invoke({ action: 'preview', id: record.id })}>{t('preview')}</button>
      <input aria-label={t('name')} placeholder={t('name')} value={label} maxLength={120} onChange={event => setLabel(event.target.value)} />
      <button disabled={pending || !label.trim()} onClick={() => void invoke({ action: 'name', id: record.id, label })}>{t('save')}</button>
    </footer>{error && <p role="alert">{error}</p>}
  </article>
}

function PreviewCard({ preview, run, t }: { preview: Preview } & ActionProps) {
  const [selected, setSelected] = useState(() => new Set(preview.changes.map(change => change.path)))
  const [used, setUsed] = useState(false)
  const { invoke, pending, error } = useAction(run)
  const whole = selected.size === preview.changes.length
  return <>
    <p>{t('scope')}</p>
    <fieldset><legend>{t('files')}</legend>{preview.changes.map(change => <label key={change.path}>
      <input type="checkbox" checked={selected.has(change.path)} onChange={() => setSelected(old => { const copy = new Set(old); copy.has(change.path) ? copy.delete(change.path) : copy.add(change.path); return copy })} />{change.path}
    </label>)}</fieldset>
    <details><summary>{t('diff')}</summary><pre>{preview.diff}</pre></details>
    {preview.conflicts.length > 0 && <p role="alert">{t('conflict')} {preview.conflicts.join(', ')}</p>}
    <p>{t('stale')}</p>
    <footer>
      <button disabled={pending || selected.size === 0} onClick={() => void invoke({ action: 'preview', id: preview.checkpoint.id, paths: [...selected] })}>{whole ? t('refresh') : t('select')}</button>
      <button disabled={pending || used || !whole || preview.conflicts.length > 0} onClick={() => { setUsed(true); void invoke({ action: 'undo', token: preview.token }) }}>{t('undo')}</button>
    </footer>{error && <p role="alert">{error}</p>}
  </>
}

export function ReplyView({ reply, run, t }: { reply: Reply } & ActionProps) {
  const { invoke, pending, error } = useAction(run)
  return <section className="dsh-tm">
    <header><h3>{t('title')}</h3><button disabled={pending} onClick={() => void invoke({ action: 'list' })}>{t('refresh')}</button></header>
    {reply.kind === 'list' && <>
      <p>{t('busy')}</p>{reply.warning && <p role="alert">{reply.warning}</p>}
      {reply.records.length === 0 ? <p>{t('empty')}</p> : reply.records.map(record => <RecordRow key={record.id} record={record} run={run} t={t} />)}
      <button disabled={pending} onClick={() => void invoke({ action: 'recover' })}>{t('recover')}</button>
    </>}
    {reply.kind === 'preview' && <PreviewCard key={reply.preview.token} preview={reply.preview} run={run} t={t} />}
    {reply.kind === 'done' && <p role="status">{reply.record ? t('restored') : t('done')}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}

function CommandCard({ node, run, t }: PropsRuntime<'conversation.chat.commandview'> & ActionProps) {
  if (!node.outcome) return <section className="dsh-tm" role="status">{t('working')}</section>
  const reply = readReply(node.outcome.text)
  return reply ? <ReplyView reply={reply} run={run} t={t} />
    : <section className="dsh-tm" role="alert">{node.outcome.text || t('failure')}</section>
}

/** Registrations and style ownership follow the browser plugin's Cordis lifetime. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('timeMachine', { zh, en }))
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.plugin = 'dsh-time-machine'; style.textContent = css
    document.head.append(style)
    return () => style.remove()
  })
  const actions = (sessionId: string): Actions => ({ run: async request => {
    const result = await ctx.remote.commands.execute(sessionId as SessionId, `/time_machine ${JSON.stringify(request)}`, [])
    const reply = readReply(commandOutcome(result))
    if (!reply) throw new Error('Invalid Time Machine response.')
    return reply
  } })
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'dsh-time-machine', locale: 'timeMachine', inject: actions,
  }, Dock))
  ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
    name: 'conversation.chat.commandview', key: 'time_machine', locale: 'timeMachine', inject: actions,
  }, CommandCard))
}
