/** Versioned human-command response; stored in the existing command event vocabulary. */
import type { Checkpoint, Preview } from './store.ts'
export type Request = { action: 'list' } | { action: 'recover' } | { action: 'preview'; id: string; paths?: string[] }
  | { action: 'undo'; token: string } | { action: 'name'; id: string; label: string }
export type Reply = { protocol: 'dsh-time-machine/v1'; kind: 'list'; records: Checkpoint[]; warning?: string }
  | { protocol: 'dsh-time-machine/v1'; kind: 'preview'; preview: Preview }
  | { protocol: 'dsh-time-machine/v1'; kind: 'done'; message: string; record?: Checkpoint }

/** Validate commands at the human/RPC boundary. No shell parsing or evaluation. */
export function parseRequest(text: string): Request {
  const trimmed = text.trim()
  let value: unknown
  if (trimmed.startsWith('{')) value = JSON.parse(trimmed)
  else {
    const [action = 'list', argument = '', ...rest] = trimmed.split(/\s+/u)
    value = action === 'preview' ? { action, id: argument }
      : action === 'undo' ? { action, token: argument }
        : action === 'name' ? { action, id: argument, label: rest.join(' ') } : { action: action || 'list' }
  }
  if (!value || typeof value !== 'object') throw new Error('Invalid time-machine command.')
  const data = value as Record<string, unknown>
  if (data.action === 'list' || data.action === 'recover') return { action: data.action }
  if (data.action === 'undo' && typeof data.token === 'string') return { action: 'undo', token: data.token }
  if (data.action === 'name' && typeof data.id === 'string' && typeof data.label === 'string') return { action: 'name', id: data.id, label: data.label }
  if (data.action === 'preview' && typeof data.id === 'string' && (data.paths === undefined
    || (Array.isArray(data.paths) && data.paths.length > 0 && data.paths.every(path => typeof path === 'string')))) {
    return { action: 'preview', id: data.id, ...(data.paths === undefined ? {} : { paths: data.paths as string[] }) }
  }
  throw new Error('Usage: /time_machine [list | preview <id> | undo <preview-token> | name <id> <name> | recover]')
}

/** Stored transcript values can be older than the mounted browser plugin. */
export function readReply(text: string | undefined): Reply | undefined {
  if (!text) return undefined
  try {
    const data = JSON.parse(text) as Partial<Reply>
    return data.protocol === 'dsh-time-machine/v1' && ['list', 'preview', 'done'].includes(data.kind ?? '') ? data as Reply : undefined
  } catch { return undefined }
}

/** Decode the official RemoteResult envelope before reading CommandExecution. */
export function commandOutcome(value: unknown): string {
  if (!value || typeof value !== 'object' || !('ok' in value)) throw new Error('Invalid command response.')
  if (value.ok !== true) {
    const error = 'error' in value ? value.error : undefined
    throw new Error(error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Command request failed.')
  }
  const execution = 'value' in value ? value.value : undefined
  if (!execution || typeof execution !== 'object' || !('result' in execution)) throw new Error('Time Machine command is unavailable.')
  const result = execution.result
  if (!result || typeof result !== 'object' || !('kind' in result)) throw new Error('Invalid command outcome.')
  if (result.kind !== 'success') throw new Error('text' in result ? String(result.text) : 'Command failed.')
  return 'text' in result ? String(result.text) : ''
}
