/** Official Cordis host plugin: persistent snapshots and human-owned recovery commands. */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-tools'
import { defaults, TimeMachineStore } from './store.ts'
import type { Limits, Preview } from './store.ts'
import { parseRequest } from './protocol.ts'
import type { Reply } from './protocol.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap { 'time-machine': { kind: 'time-machine' } & ContextFormed }
}

export const name = 'time-machine'
export const inject = ['agents', 'commands', 'fs', 'sessions']
export interface Config extends Limits { storageRoot: string; previewTtlMs: number }
export const Config: z<Config> = z.object({
  storageRoot: z.string().default(''), previewTtlMs: z.number().step(1).min(1000).default(300_000),
  maxFileBytes: z.number().step(1).min(1).default(defaults.maxFileBytes),
  maxFiles: z.number().step(1).min(1).default(defaults.maxFiles),
  maxStoreBytes: z.number().step(1).min(1).default(defaults.maxStoreBytes),
  maxRecords: z.number().step(1).min(1).default(defaults.maxRecords),
  timeoutMs: z.number().step(1).min(1).default(defaults.timeoutMs),
  maxDiffChars: z.number().step(1).min(1000).default(defaults.maxDiffChars),
})

interface State { store: Promise<TimeMachineStore>; queue: Promise<void>; warning?: string }

/** Register all contributions as effects and drain asynchronous work before unloading. */
export function apply(ctx: Context, config: Config): void {
  const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  const expandedHome = home.startsWith('~') ? join(homedir(), home.slice(1)) : home
  const storage = config.storageRoot ? resolve(config.storageRoot) : resolve(expandedHome, 'plugins', 'time-machine')
  const states = new Map<Session, State>()
  const previews = new Map<string, { preview: Preview; session: Session; expires: number }>()
  const running = new Set<Promise<unknown>>()
  let closing = false

  function stateFor(session: Session): State {
    const existing = states.get(session)
    if (existing) return existing
    const cwd = session.header.cwd
    if (!cwd) throw new Error('Time Machine needs a local Git workspace.')
    // This seam explicitly guarantees the host and execution-world paths name the same file.
    if (ctx.fs.processPathFromHostPath(resolve(cwd)) !== resolve(cwd)) throw new Error('Time Machine supports host-local workspaces only.')
    const store = TimeMachineStore.create(cwd, storage, config)
    const state = { store, queue: Promise.resolve() }
    states.set(session, state)
    return state
  }

  function track<T>(promise: Promise<T>): Promise<T> {
    running.add(promise)
    void promise.then(() => running.delete(promise), () => running.delete(promise))
    return promise
  }

  function enqueue(session: Session, operation: (store: TimeMachineStore) => Promise<unknown>, clearWarning = false): void {
    if (closing || session.header.origin === 'subagent' || (session.header.delegationDepth ?? 0) > 0 || !session.header.cwd) return
    let state: State
    try { state = stateFor(session) } catch (error) { ctx.logger.warn(String(error)); return }
    state.queue = track(state.queue.then(async () => {
      const store = await state.store
      await store.exclusive(() => operation(store))
      if (clearWarning) state.warning = undefined
    }).catch((error: unknown) => {
      state.warning = error instanceof Error ? error.message : String(error)
      ctx.logger.warn(`time-machine: ${state.warning}`)
    }))
  }

  async function notify(agent: Agent, text: string): Promise<void> {
    agent.inject(createUserMessage({ content: [{ type: 'text', text }],
      source: { kind: 'time-machine', form: 'notice', summary: 'Workspace files restored' } }))
    await ctx.sessions.flush(agent.session)
  }

  async function execute(invocation: CommandInvocation): Promise<CommandResult> {
    if (closing) return { kind: 'error', text: 'Time Machine is unloading.' }
    try {
      const request = parseRequest(invocation.rawInput)
      const agent = invocation.agent
      const state = stateFor(agent.session)
      const reply = await agent.runMaintenance(async (maintenanceSignal): Promise<Reply> => {
        invocation.signal.throwIfAborted()
        maintenanceSignal.throwIfAborted()
        await state.queue
        const store = await state.store
        return store.exclusive(async () => {
          invocation.signal.throwIfAborted()
          maintenanceSignal.throwIfAborted()
          const sessionId = String(agent.session.id)
          if (request.action === 'undo' || request.action === 'recover') {
            for (const other of ctx.agents.list()) {
              if (other === agent || other.status !== 'running' || !other.session.header.cwd) continue
              const otherPath = resolve(other.session.header.cwd)
              if (otherPath === store.root || otherPath.startsWith(store.root + (process.platform === 'win32' ? '\\' : '/'))) {
                throw new Error('Another agent is running in this repository. Wait for it to stop before restoring files.')
              }
            }
          }
          for (const [token, value] of previews) if (value.expires < Date.now()) previews.delete(token)
          if (request.action === 'recover') {
            const recovered = await store.recover(sessionId)
            if (recovered.length) await notify(agent, `Time Machine recovered interrupted file restoration(s): ${recovered.join(', ')}. Inspect the workspace before continuing. Conversation history was preserved.`)
            return { protocol: 'dsh-time-machine/v1', kind: 'done', message: `Recovered ${recovered.length} interrupted restore(s).` }
          }
          // Finalize a baseline left by an earlier Host process, before offering any restore.
          await store.finishPending(sessionId, 'Recovered interrupted turn')
          if (request.action === 'list') return { protocol: 'dsh-time-machine/v1', kind: 'list', records: (await store.records(sessionId)).slice(0, 50), ...(state.warning ? { warning: state.warning } : {}) }
          if (request.action === 'preview') {
            const preview = await store.preview(request.id, sessionId, request.paths)
            previews.set(preview.token, { preview, session: agent.session, expires: Date.now() + config.previewTtlMs })
            return { protocol: 'dsh-time-machine/v1', kind: 'preview', preview }
          }
          if (request.action === 'name') {
            await store.label(request.id, sessionId, request.label)
            return { protocol: 'dsh-time-machine/v1', kind: 'done', message: request.label }
          }
          const pending = previews.get(request.token)
          if (!pending || pending.session !== agent.session) throw new Error('Preview expired or belongs to another session. Preview the changes again.')
          previews.delete(request.token)
          // Once a journal is persisted, finish the bounded file transaction even if the UI disconnects.
          const record = await store.undo(pending.preview)
          await notify(agent, `Time Machine restored files from checkpoint ${pending.preview.checkpoint.id}: ${record.changes.map(change => change.path).join(', ')}. The current working files supersede earlier descriptions. Read them before editing. Tests may need rerunning. Conversation history was preserved.`)
          return { protocol: 'dsh-time-machine/v1', kind: 'done', message: 'Files restored. A new checkpoint can undo this restoration.', record }
        })
      })
      return { kind: 'success', text: JSON.stringify(reply) }
    } catch (error) { return { kind: 'error', text: error instanceof Error ? error.message : String(error) } }
  }

  ctx.effect(function* () {
    yield async () => { closing = true; await Promise.allSettled([...running]); previews.clear(); states.clear() }
    yield ctx.commands.register({ name: 'time_machine', description: 'Browse persistent file changes and preview safe undo / 改动时光机',
      input: { hint: 'list | preview <id> | undo <preview-token> | name <id> <name> | recover' },
      handler: invocation => track(execute(invocation)),
    })
    yield ctx.on('session/event', (session, event) => {
      if (event.type === 'turn/start') enqueue(session, store => store.begin(String(session.id), event.data.turn), true)
      else if (event.type === 'turn/end') enqueue(session, store => store.finishPending(String(session.id)))
    })
    yield ctx.on('tools/pre-execute', async (execution, next) => {
      const state = execution.agent && states.get(execution.agent.session)
      if (state) await state.queue
      return next()
    })
    yield ctx.on('session/disposed', (session) => {
      for (const [token, value] of previews) if (value.session === session) previews.delete(token)
      const state = states.get(session)
      if (state) void state.queue.then(() => states.delete(session))
    })
  }, 'time-machine lifecycle')
}
