import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, mkdir, unlink, symlink, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { TimeMachineStore, defaults, safeRelative } from '../src/store.ts'
import { parseRequest } from '../src/protocol.ts'

async function fixture(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-tm-test-'))
  const root = join(dir, 'repo'); await mkdir(root)
  execFileSync('git', ['init', '-q', root], { windowsHide: true })
  const storage = join(dir, 'data')
  const store = await TimeMachineStore.create(root, storage)
  t.after(() => rm(dir, { recursive: true, force: true }))
  return { dir, root, storage, store }
}

test('preserves pre-existing dirty work, persists over restart, supports selective undo and redo', async t => {
  const { root, store, storage } = await fixture(t)
  await writeFile(join(root, 'a.txt'), 'user uncommitted work\r\n')
  await writeFile(join(root, 'b.txt'), 'B\n')
  execFileSync('git', ['-C', root, 'add', '.'])
  const indexBefore = await readFile(join(root, '.git', 'index'))
  await store.exclusive(() => store.begin('session-a', 1))
  await writeFile(join(root, 'a.txt'), 'AI edit\n')
  await unlink(join(root, 'b.txt'))
  await writeFile(join(root, 'new.txt'), 'new\n')
  const checkpoint = await store.exclusive(() => store.finishPending('session-a'))
  assert.equal(checkpoint?.changes.length, 3)
  assert.deepEqual(await readFile(join(root, '.git', 'index')), indexBefore)
  const reopened = await TimeMachineStore.create(root, storage)
  const preview = await reopened.preview(checkpoint!.id, 'session-a', ['a.txt'])
  assert.deepEqual(preview.conflicts, [])
  const undo = await reopened.exclusive(() => reopened.undo(preview))
  assert.equal(await readFile(join(root, 'a.txt'), 'utf8'), 'user uncommitted work\r\n')
  assert.equal(await readFile(join(root, 'new.txt'), 'utf8'), 'new\n')
  await assert.rejects(readFile(join(root, 'b.txt')))
  await reopened.exclusive(async () => reopened.undo(await reopened.preview(undo.id, 'session-a')))
  assert.equal(await readFile(join(root, 'a.txt'), 'utf8'), 'AI edit\n')
  await reopened.exclusive(async () => reopened.undo(await reopened.preview(checkpoint!.id, 'session-a')))
  assert.equal(await readFile(join(root, 'b.txt'), 'utf8'), 'B\n')
  await assert.rejects(readFile(join(root, 'new.txt')))
})

test('rejects later edits and preview/commit races without touching any selected file', async t => {
  const { root, store } = await fixture(t)
  await writeFile(join(root, 'a'), 'old'); await writeFile(join(root, 'b'), 'old')
  await store.begin('s', 1)
  await writeFile(join(root, 'a'), 'new'); await writeFile(join(root, 'b'), 'new')
  const record = (await store.finishPending('s'))!
  const preview = await store.preview(record.id, 's')
  await writeFile(join(root, 'b'), 'user changed afterwards')
  await assert.rejects(store.exclusive(() => store.undo(preview)), /Files changed/)
  assert.equal(await readFile(join(root, 'a'), 'utf8'), 'new')
  assert.equal(await readFile(join(root, 'b'), 'utf8'), 'user changed afterwards')
  await assert.rejects(store.preview(record.id, 'other'), /another session/)
})

test('pending baseline survives a Host crash and ignores .gitignore, binary and oversized files', async t => {
  const { root, store, storage } = await fixture(t)
  await writeFile(join(root, '.gitignore'), 'ignored\n')
  await writeFile(join(root, 'ignored'), 'secret')
  await writeFile(join(root, 'binary'), Buffer.from([0, 1, 2]))
  await writeFile(join(root, 'text'), 'before')
  await store.begin('s', 1)
  await writeFile(join(root, 'text'), 'after')
  const reopened = await TimeMachineStore.create(root, storage)
  const result = (await reopened.finishPending('s'))!
  assert.deepEqual(result.changes.map(change => change.path), ['text'])
  assert.deepEqual(result.skipped, ['binary'])
  const bounded = await TimeMachineStore.create(root, join(storage, 'bounded'), { ...defaults, maxFiles: 1 })
  await assert.rejects(bounded.snapshot(), /maxFiles/)
})

test('interrupted restore journal rolls back applied files, refuses foreign edits and survives restart', async t => {
  const { root, store, storage } = await fixture(t)
  await writeFile(join(root, 'a'), 'before')
  await store.begin('s', 1)
  await writeFile(join(root, 'a'), 'after')
  const record = (await store.finishPending('s'))!
  const journal = { ...record, id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', kind: 'undo', status: 'prepared', changes: record.changes.map(c => ({ path: c.path, before: c.after, after: c.before })) }
  await writeFile(join(store.directory, 'records', `${journal.id}.json`), JSON.stringify(journal))
  const reopened = await TimeMachineStore.create(root, storage)
  await assert.rejects(reopened.begin('s', 2), /interrupted restore/)
  await writeFile(join(root, 'a'), 'unrelated edit')
  await assert.rejects(reopened.exclusive(() => reopened.recover('s')), /Recovery conflict/)
  assert.equal(await readFile(join(root, 'a'), 'utf8'), 'unrelated edit')
  await writeFile(join(root, 'a'), 'before')
  assert.equal((await reopened.exclusive(() => reopened.recover('s'))).length, 1)
  assert.equal(await readFile(join(root, 'a'), 'utf8'), 'after')
})

test('refuses traversal, junctions, corrupt content, and cooperating concurrent writers', async t => {
  const { root, store, dir } = await fixture(t)
  for (const path of ['../a', '.git/config', 'a/../../b', 'a\\b', 'C:/x', '/x']) assert.throws(() => safeRelative(path))
  const outside = join(dir, 'outside'); await mkdir(outside); await writeFile(join(outside, 'file'), 'keep')
  await symlink(outside, join(root, 'link'), 'junction')
  await writeFile(join(root, 'a'), 'before')
  await store.begin('s', 1); await writeFile(join(root, 'a'), 'after')
  const record = (await store.finishPending('s'))!
  const corrupt = record.changes.find(change => change.path === 'a')!.before!.hash
  await writeFile(join(store.directory, 'objects', corrupt), 'corrupt')
  await assert.rejects(store.preview(record.id, 's'), /corrupt/)
  await store.exclusive(async () => { await assert.rejects(store.exclusive(async () => {}), /already being held/) })
  assert.equal(await readFile(join(outside, 'file'), 'utf8'), 'keep')
})

test('hard caps stop new snapshots while preserving readable checkpoints', async t => {
  const { root, storage } = await fixture(t)
  await writeFile(join(root, 'a'), '123456789')
  const bounded = await TimeMachineStore.create(root, storage, { ...defaults, maxStoreBytes: 1 })
  await assert.rejects(bounded.begin('s', 1), /storage limit/)
  assert.equal((await readdir(join(bounded.directory, 'records'))).length, 0)
  assert.deepEqual(parseRequest('preview abc'), { action: 'preview', id: 'abc' })
  assert.throws(() => parseRequest('{"action":"preview","id":"x","paths":[]}'))
})
