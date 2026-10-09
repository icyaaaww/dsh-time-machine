import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Commands from '@deepseek-ai/dsh-commands'
import LocalFs from '@deepseek-ai/dsh-fs-local'
import { SessionId } from '@deepseek-ai/dsh-session'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { readReply } from '../src/protocol.ts'

test('published plugin boots through official YAML Loader, records turns and executes human undo with durable agent notice', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'dsh-tm-loader-'))
  const root = join(folder, 'repo'); await mkdir(root)
  execFileSync('git', ['init', '-q', root], { windowsHide: true })
  await writeFile(join(root, 'hello.txt'), 'user work\n')
  const ctx = new Context()
  t.after(async () => { await ctx.fiber.dispose(); await rm(folder, { recursive: true, force: true }) })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Commands)
  await ctx.plugin(LocalFs)
  const harness = await mountAgentLoopTestHarness(ctx)
  const configFile = join(folder, 'cordis.yml')
  await writeFile(configFile, `- id: time-machine\n  name: ${JSON.stringify(pathToFileURL(resolve('lib/index.js')).href)}\n  config:\n    storageRoot: ${JSON.stringify(join(folder, 'store'))}\n`)
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configFile).href } })
  await ctx.loader.await()
  assert.ok(ctx.commands.list().some(command => command.name === 'time_machine'))
  const agent = await harness.create(SessionId('integration'), {}, { cwd: root })
  agent.session.append('turn/start', { turn: 1 })
  // Production tool-policy waterfall fences the baseline before any file mutation.
  await ctx.waterfall('tools/pre-execute', { agent } as never, async () => ({ kind: 'allow' as const }))
  await writeFile(join(root, 'hello.txt'), 'agent edit\n')
  agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const run = async (args: string) => {
    const outcome = await ctx.commands.execute(agent, `/time_machine ${args}`, [], new AbortController().signal)
    assert.equal(outcome?.result.kind, 'success', outcome?.result.text)
    return readReply(outcome?.result.text)!
  }
  const list = await run('list')
  assert.equal(list.kind, 'list')
  if (list.kind !== 'list') throw new Error('Expected list')
  assert.equal(list.records.length, 1)
  const preview = await run(`preview ${list.records[0]!.id}`)
  assert.equal(preview.kind, 'preview')
  if (preview.kind !== 'preview') throw new Error('Expected preview')
  const restored = await run(`undo ${preview.preview.token}`)
  assert.equal(restored.kind, 'done')
  assert.equal(await readFile(join(root, 'hello.txt'), 'utf8'), 'user work\n')
  assert.ok(agent.inbox.nextStep.some(message => message.source.kind === 'time-machine'))
  assert.ok(agent.session.snapshotEvents().some(event => event.type === 'agent/inbox/spliced'))
  const replay = await ctx.commands.execute(agent, `/time_machine undo ${preview.preview.token}`, [], new AbortController().signal)
  assert.equal(replay?.result.kind, 'error')
  const pluginEntry = [...ctx.loader.entries()].find(entry => entry.options.id === 'time-machine')!
  assert.ok(pluginEntry)
  await pluginEntry.fiber!.dispose()
  assert.ok(!ctx.commands.list().some(command => command.name === 'time_machine'))
  assert.equal(await readFile(join(root, 'hello.txt'), 'utf8'), 'user work\n')
})
