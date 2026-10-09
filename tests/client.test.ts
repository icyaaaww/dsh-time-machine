import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import React from 'react'
import * as jsx from 'react/jsx-runtime'
import { JSDOM } from 'jsdom'
import { ReplyView, Dock } from '../src/client.tsx'
import { zh } from '../src/locales.ts'
import { commandOutcome } from '../src/protocol.ts'
import type { Preview } from '../src/store.ts'

test('official RemoteResult envelope reports business and transport failures', () => {
  commandOutcome({ ok: true, value: { result: { kind: 'success', text: '{}' } } })
  assert.throws(() => commandOutcome({ ok: false, error: { code: 'x', message: 'host offline' } }), /host offline/)
  assert.throws(() => commandOutcome({ ok: true, value: { result: { kind: 'error', text: 'conflict' } } }), /conflict/)
  assert.throws(() => commandOutcome({ ok: true, value: undefined }), /unavailable/)
})

test('built client registers the official lazy module factory without running it at script evaluation', async () => {
  let registered: { id: string; factory: (require: (id: string) => unknown) => unknown } | undefined
  vm.runInNewContext(await readFile('lib/client.js', 'utf8'), {
    window: { __ModuleLoader__: { load: (value: typeof registered) => { registered = value } } },
  })
  assert.equal(registered?.id, 'dsh-time-machine')
  const plugin = registered!.factory(id => {
    if (id === 'react') return React
    if (id === 'react/jsx-runtime') return jsx
    throw new Error(`Unexpected browser runtime import: ${id}`)
  }) as { apply: unknown; inject: string[] }
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(Array.from(plugin.inject), ['slots', 'locale', 'remote', 'remote.commands'])
})

test('Chinese preview shows conflicts, selection requires a new preview, and undo needs an explicit click', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const { render, fireEvent, cleanup, waitFor } = await import('@testing-library/react')
  const calls: unknown[] = []
  const version = { hash: 'a'.repeat(64), mode: 0o644 }
  const preview: Preview = {
    checkpoint: { schema: 1, id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', sessionId: 's', root: '/repo', turn: 1, time: '2026-10-09T00:00:00Z', label: '', kind: 'turn', status: 'complete', skipped: [], changes: [] },
    changes: [{ path: 'a.txt', before: version, after: version }, { path: 'b.txt', before: version, after: version }], conflicts: [], diff: '-before\n+after', token: 'token',
  }
  const props = { reply: { protocol: 'dsh-time-machine/v1' as const, kind: 'preview' as const, preview },
    run: async (request: unknown) => { calls.push(request) }, t: (key: keyof typeof zh) => zh[key] }
  const view = render(React.createElement(ReplyView, props))
  assert.equal(calls.length, 0)
  fireEvent.click(view.getByLabelText('b.txt'))
  assert.equal((view.getByText(zh.undo) as HTMLButtonElement).disabled, true)
  fireEvent.click(view.getByText(zh.select))
  await waitFor(() => assert.equal(calls.length, 1))
  assert.deepEqual(calls[0], { action: 'preview', id: preview.checkpoint.id, paths: ['a.txt'] })
  cleanup()
  const blocked = render(React.createElement(ReplyView, { ...props, reply: { ...props.reply, preview: { ...preview, conflicts: ['a.txt'] } } }))
  assert.equal((blocked.getByText(zh.undo) as HTMLButtonElement).disabled, true)
  assert.match(blocked.getByRole('alert').textContent!, /a.txt/)
  cleanup()
  // Blank sessions have no visible chat flow: the dock must render the RPC reply itself.
  const dock = render(React.createElement(Dock, {
    run: async () => ({ protocol: 'dsh-time-machine/v1', kind: 'list', records: [] }),
    t: props.t,
  } as Parameters<typeof Dock>[0]))
  fireEvent.click(dock.getByText(zh.open))
  await waitFor(() => assert.ok(dock.getByText(zh.empty)))
  fireEvent.click(dock.getByText(zh.close))
  assert.equal(dock.queryByText(zh.empty), null)
  cleanup(); dom.window.close()
})
