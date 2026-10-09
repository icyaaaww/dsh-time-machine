/** Local Git-worktree snapshots. Git's index and object database are never mutated. */
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile, rename, unlink, lstat, realpath, readdir, open, chmod } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createTwoFilesPatch } from 'diff'
import lockfile from 'proper-lockfile'

const exec = promisify(execFile)
const digest = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex')
const isMissing = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT'
export interface Limits { maxFileBytes: number; maxFiles: number; maxStoreBytes: number; maxRecords: number; timeoutMs: number; maxDiffChars: number }
export const defaults: Limits = { maxFileBytes: 2_097_152, maxFiles: 5000, maxStoreBytes: 536_870_912, maxRecords: 2000, timeoutMs: 30_000, maxDiffChars: 60_000 }
export interface FileVersion { hash: string; mode: number }
export interface Snapshot { files: Record<string, FileVersion>; skipped: string[] }
export interface Change { path: string; before: FileVersion | null; after: FileVersion | null }
export interface Checkpoint {
  schema: 1; id: string; root: string; sessionId: string; turn: number; time: string; label: string;
  kind: 'turn' | 'undo'; status: 'complete' | 'prepared'; changes: Change[]; skipped: string[]; undoOf?: string
}
export interface Preview { checkpoint: Checkpoint; changes: Change[]; conflicts: string[]; diff: string; token: string }
interface Pending { schema: 1; sessionId: string; turn: number; before: Snapshot }
const same = (a: FileVersion | null | undefined, b: FileVersion | null | undefined): boolean =>
  (a ?? null) === (b ?? null) || (a != null && b != null && a.hash === b.hash && a.mode === b.mode)
function validateVersion(value: unknown): asserts value is FileVersion {
  if (!value || typeof value !== 'object' || !('hash' in value) || typeof value.hash !== 'string'
    || !/^[a-f0-9]{64}$/u.test(value.hash) || !('mode' in value) || typeof value.mode !== 'number'
    || !Number.isInteger(value.mode) || value.mode < 0 || value.mode > 0o777) throw new Error('Invalid file version.')
}

/** Reject path traversal and all metadata paths before using a stored or requested path. */
export function safeRelative(path: string): void {
  if (!path || isAbsolute(path) || path.includes('\\') || /[:\x00-\x1f]/u.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')) {
    throw new Error(`Unsafe path: ${path}`)
  }
}

async function atomicJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temp = `${path}.${randomUUID()}.tmp`
  const fd = await open(temp, 'wx', 0o600)
  try { await fd.writeFile(JSON.stringify(data)); await fd.sync() } finally { await fd.close() }
  try { await rename(temp, path) } finally { await unlink(temp).catch(error => { if (!isMissing(error)) throw error }) }
}

/** One local repository's append-only checkpoints and deduplicated content objects. */
export class TimeMachineStore {
  private constructor(readonly root: string, readonly directory: string, readonly limits: Limits) {}

  static async create(cwd: string, storageRoot: string, limits: Limits = defaults): Promise<TimeMachineStore> {
    const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD|^GIT_/iu.test(key)))
    const { stdout } = await exec('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      env: { ...environment, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
      timeout: limits.timeoutMs, windowsHide: true, maxBuffer: 1_048_576,
    })
    const root = await realpath(stdout.trim())
    const directory = resolve(storageRoot, digest(root))
    if (directory === root || directory.startsWith(root + sep)) throw new Error('Snapshot storage must be outside the repository.')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await mkdir(join(directory, 'objects'), { recursive: true, mode: 0o700 })
    await mkdir(join(directory, 'records'), { recursive: true, mode: 0o700 })
    await writeFile(join(directory, 'lock-anchor'), '', { flag: 'a', mode: 0o600 })
    return new TimeMachineStore(root, directory, limits)
  }

  /** Serialize cooperating hosts; a crashed owner expires after two minutes. */
  async exclusive<T>(action: () => Promise<T>): Promise<T> {
    let compromised: Error | undefined
    const release = await lockfile.lock(join(this.directory, 'lock-anchor'), {
      retries: 0, stale: 120_000, update: 10_000, onCompromised: error => { compromised = error },
    })
    try {
      const result = await action()
      if (compromised) throw compromised
      return result
    } finally { await release() }
  }

  private recordPath(id: string): string {
    if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error('Invalid checkpoint id.')
    return join(this.directory, 'records', `${id}.json`)
  }

  private pendingPath(sessionId: string): string { return join(this.directory, `pending-${digest(sessionId)}.json`) }

  /** Fail closed on symlinks, junctions, nested repositories and non-file targets. */
  private async checkedPath(path: string): Promise<string> {
    safeRelative(path)
    const parts = path.split('/')
    let current = this.root
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]!)
      let stat
      try { stat = await lstat(current) } catch (error) { if (isMissing(error)) continue; throw error }
      if (stat.isSymbolicLink()) throw new Error(`Symlink/junction is not supported: ${path}`)
      if (index < parts.length - 1) {
        if (!stat.isDirectory()) throw new Error(`Parent is not a directory: ${path}`)
        try { await lstat(join(current, '.git')); throw new Error(`Nested repository is not supported: ${path}`) }
        catch (error) { if (!isMissing(error)) throw error }
      } else if (!stat.isFile()) throw new Error(`Not a regular file: ${path}`)
    }
    return current
  }

  private async readVersion(path: string): Promise<{ version: FileVersion; bytes: Buffer } | null> {
    const absolute = await this.checkedPath(path)
    let stat
    try { stat = await lstat(absolute) } catch (error) { if (isMissing(error)) return null; throw error }
    if (stat.size > this.limits.maxFileBytes) throw new Error(`File exceeds maxFileBytes: ${path}`)
    const bytes = await readFile(absolute)
    if (bytes.length > this.limits.maxFileBytes || bytes.includes(0)) throw new Error(`Binary or oversized file: ${path}`)
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw new Error(`Non-UTF-8 file: ${path}`) }
    const after = await lstat(absolute)
    if (stat.ino !== after.ino || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs) throw new Error(`File changed while reading: ${path}`)
    return { version: { hash: digest(bytes), mode: stat.mode & 0o777 }, bytes }
  }

  private async blob(hash: string): Promise<Buffer> {
    if (!/^[a-f0-9]{64}$/u.test(hash)) throw new Error('Invalid content hash.')
    const bytes = await readFile(join(this.directory, 'objects', hash))
    if (digest(bytes) !== hash) throw new Error('Snapshot content is corrupt.')
    return bytes
  }

  async snapshot(): Promise<Snapshot> {
    const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD|^GIT_/iu.test(key)))
    const { stdout } = await exec('git', ['-C', this.root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      env: { ...environment, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
      timeout: this.limits.timeoutMs, maxBuffer: 8_388_608, windowsHide: true,
    })
    const paths = [...new Set(stdout.split('\0').filter(Boolean))].sort()
    if (paths.length > this.limits.maxFiles) throw new Error('Repository exceeds maxFiles; no incomplete checkpoint was created.')
    let used = 0
    for (const entry of await readdir(join(this.directory, 'objects'))) used += (await lstat(join(this.directory, 'objects', entry))).size
    const files: Record<string, FileVersion> = Object.create(null)
    const skipped: string[] = []
    for (const path of paths) {
      let read
      try { read = await this.readVersion(path) } catch { skipped.push(path); continue }
      if (!read) continue
      const objectPath = join(this.directory, 'objects', read.version.hash)
      try { await lstat(objectPath) } catch (error) {
        if (!isMissing(error)) throw error
        if (used + read.bytes.length > this.limits.maxStoreBytes) throw new Error('Snapshot storage limit reached. Existing checkpoints remain readable.')
        const fd = await open(objectPath, 'wx', 0o600)
        try { await fd.writeFile(read.bytes); await fd.sync() } finally { await fd.close() }
        used += read.bytes.length
      }
      files[path] = read.version
    }
    return { files, skipped }
  }

  async records(sessionId?: string): Promise<Checkpoint[]> {
    const names = (await readdir(join(this.directory, 'records'))).filter(name => name.endsWith('.json'))
    const rows: Checkpoint[] = []
    for (const name of names) {
      const record = await this.readRecord(name.slice(0, -5))
      if (sessionId === undefined || record.sessionId === sessionId) rows.push(record)
    }
    return rows.sort((a, b) => b.time.localeCompare(a.time) || b.id.localeCompare(a.id))
  }

  async readRecord(id: string): Promise<Checkpoint> {
    const value: unknown = JSON.parse(await readFile(this.recordPath(id), 'utf8'))
    if (!value || typeof value !== 'object') throw new Error('Invalid checkpoint.')
    const record = value as Checkpoint
    if (record.schema !== 1 || record.id !== id || record.root !== this.root || !Array.isArray(record.changes)
      || !Array.isArray(record.skipped) || typeof record.sessionId !== 'string' || typeof record.label !== 'string'
      || typeof record.time !== 'string' || !Number.isSafeInteger(record.turn)
      || !['complete', 'prepared'].includes(record.status) || !['turn', 'undo'].includes(record.kind)) throw new Error('Invalid checkpoint metadata.')
    const paths = new Set<string>()
    for (const change of record.changes) {
      safeRelative(change.path)
      if (paths.has(change.path)) throw new Error('Duplicate checkpoint path.')
      paths.add(change.path)
      for (const version of [change.before, change.after]) {
        if (version !== null) validateVersion(version)
      }
    }
    return record
  }

  private async assertReady(): Promise<void> {
    if ((await this.records()).some(row => row.status === 'prepared')) throw new Error('An interrupted restore needs recovery first: /time_machine recover')
  }

  async begin(sessionId: string, turn: number): Promise<void> {
    await this.assertReady()
    await this.finishPending(sessionId, 'Recovered interrupted turn')
    if ((await this.records()).length >= this.limits.maxRecords) throw new Error('Checkpoint count limit reached.')
    await atomicJson(this.pendingPath(sessionId), { schema: 1, sessionId, turn, before: await this.snapshot() } satisfies Pending)
  }

  async finishPending(sessionId: string, label = ''): Promise<Checkpoint | null> {
    let pending: Pending
    try { pending = JSON.parse(await readFile(this.pendingPath(sessionId), 'utf8')) as Pending }
    catch (error) { if (isMissing(error)) return null; throw error }
    if (pending.schema !== 1 || pending.sessionId !== sessionId || !Number.isSafeInteger(pending.turn)
      || !pending.before?.files || !Array.isArray(pending.before.skipped)) throw new Error('Invalid pending snapshot.')
    const validated: Record<string, FileVersion> = Object.create(null)
    for (const [path, version] of Object.entries(pending.before.files)) {
      safeRelative(path); validateVersion(version); validated[path] = version
    }
    for (const path of pending.before.skipped) { if (typeof path !== 'string') throw new Error('Invalid skipped path.') }
    pending.before.files = validated
    const after = await this.snapshot()
    const skipped = [...new Set([...pending.before.skipped, ...after.skipped])]
    const omitted = new Set(skipped)
    const changes: Change[] = []
    for (const path of [...new Set([...Object.keys(pending.before.files), ...Object.keys(after.files)])].sort()) {
      safeRelative(path)
      if (!omitted.has(path) && !same(pending.before.files[path], after.files[path])) {
        changes.push({ path, before: pending.before.files[path] ?? null, after: after.files[path] ?? null })
      }
    }
    if (!changes.length && !skipped.length) { await unlink(this.pendingPath(sessionId)); return null }
    const record: Checkpoint = { schema: 1, id: randomUUID(), root: this.root, sessionId, turn: pending.turn,
      time: new Date().toISOString(), label, kind: 'turn', status: 'complete', changes, skipped }
    await atomicJson(this.recordPath(record.id), record)
    await unlink(this.pendingPath(sessionId))
    return record
  }

  async label(id: string, sessionId: string, label: string): Promise<void> {
    const record = await this.owned(id, sessionId)
    if (!label.trim() || label.length > 120) throw new Error('Checkpoint name must contain 1–120 characters.')
    await atomicJson(this.recordPath(id), { ...record, label: label.trim() })
  }

  private async owned(id: string, sessionId: string): Promise<Checkpoint> {
    const row = await this.readRecord(id)
    if (row.sessionId !== sessionId) throw new Error('This checkpoint belongs to another session.')
    return row
  }

  async preview(id: string, sessionId: string, paths?: string[]): Promise<Preview> {
    const checkpoint = await this.owned(id, sessionId)
    if (checkpoint.status !== 'complete') throw new Error('Recover the interrupted restore first.')
    if (paths?.some(path => !checkpoint.changes.some(change => change.path === path))) throw new Error('Unknown checkpoint file.')
    const changes = checkpoint.changes.filter(change => paths === undefined || paths.includes(change.path))
    if (!changes.length) throw new Error('No supported file changes selected.')
    const conflicts: string[] = []
    let diff = ''
    for (const change of changes) {
      try { if (!same((await this.readVersion(change.path))?.version, change.after)) conflicts.push(change.path) }
      catch { conflicts.push(change.path) }
      const before = change.before === null ? '' : (await this.blob(change.before.hash)).toString('utf8')
      const after = change.after === null ? '' : (await this.blob(change.after.hash)).toString('utf8')
      if (diff.length < this.limits.maxDiffChars) diff += createTwoFilesPatch(`before/${change.path}`, `after/${change.path}`, before, after, undefined, undefined, { context: 3 })
    }
    if (diff.length > this.limits.maxDiffChars) diff = diff.slice(0, this.limits.maxDiffChars) + '\n[diff truncated]'
    return { checkpoint, changes, conflicts, diff, token: randomUUID() }
  }

  private async replace(change: Change, desired: FileVersion | null): Promise<void> {
    const path = await this.checkedPath(change.path)
    if (desired === null) { await unlink(path); return }
    const bytes = await this.blob(desired.hash)
    await mkdir(dirname(path), { recursive: true })
    await this.checkedPath(change.path)
    const temp = join(dirname(path), `.dsh-tm-${randomUUID()}.tmp`)
    const fd = await open(temp, 'wx', desired.mode)
    try { await fd.writeFile(bytes); await fd.sync() } finally { await fd.close() }
    try { await rename(temp, path); await chmod(path, desired.mode) }
    finally { await unlink(temp).catch(error => { if (!isMissing(error)) throw error }) }
  }

  /** The durable prepared record is a write-ahead recovery journal, not a success claim. */
  async undo(preview: Preview): Promise<Checkpoint> {
    await this.assertReady()
    if ((await this.records()).length >= this.limits.maxRecords) throw new Error('Checkpoint count limit reached; restoration requires space for a recovery record.')
    const fresh = await this.preview(preview.checkpoint.id, preview.checkpoint.sessionId, preview.changes.map(change => change.path))
    if (fresh.conflicts.length) throw new Error(`Files changed since this checkpoint: ${fresh.conflicts.join(', ')}`)
    const journal: Checkpoint = { ...fresh.checkpoint, id: randomUUID(), time: new Date().toISOString(),
      label: 'Undo', kind: 'undo', status: 'prepared', undoOf: fresh.checkpoint.id,
      changes: fresh.changes.map(change => ({ path: change.path, before: change.after, after: change.before })), skipped: [] }
    await atomicJson(this.recordPath(journal.id), journal)
    try {
      for (const change of journal.changes) {
        if (!same((await this.readVersion(change.path))?.version, change.before)) throw new Error(`Concurrent edit: ${change.path}`)
        await this.replace(change, change.after)
      }
      journal.status = 'complete'
      await atomicJson(this.recordPath(journal.id), journal)
      return journal
    } catch (error) {
      throw new Error(`Restore interrupted; recovery journal ${journal.id} was retained. Use /time_machine recover.`, { cause: error })
    }
  }

  /** Roll back an interrupted restore only where bytes still match its recorded versions. */
  async recover(sessionId: string): Promise<string[]> {
    const recovered: string[] = []
    for (const record of await this.records()) {
      if (record.status !== 'prepared') continue
      if (record.sessionId !== sessionId) throw new Error('Another session has an interrupted restore. Recover it in that session.')
      const applied: Change[] = []
      for (const change of record.changes) {
        const current = (await this.readVersion(change.path))?.version
        if (same(current, change.before)) continue
        if (!same(current, change.after)) throw new Error(`Recovery conflict; preserve external edits: ${change.path}`)
        applied.push(change)
      }
      for (const change of applied) {
        if (!same((await this.readVersion(change.path))?.version, change.after)) throw new Error(`Concurrent edit during recovery: ${change.path}`)
        await this.replace(change, change.before)
      }
      await atomicJson(this.recordPath(record.id), { ...record, status: 'complete', label: 'Interrupted undo recovered', changes: [] })
      recovered.push(record.id)
    }
    return recovered
  }
}
