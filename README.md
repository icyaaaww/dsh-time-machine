# DSH Time Machine

**An undo button for DeepSeek Harness workspace edits.**

Inspect a turn's changes, select files, and restore their earlier content while keeping the conversation. A third-party plugin built using DSH's documented bundle and client extension APIs; not an official DeepSeek product.

[中文说明](README.zh.md) · [Download v0.1.0](https://github.com/icyaaaww/dsh-time-machine/releases/tag/v0.1.0) · [Report a problem](https://github.com/icyaaaww/dsh-time-machine/issues)

- Automatic per-turn checkpoints that survive restarts.
- Diff preview and selected-file undo, with checks for later edits.
- Undo the restoration itself; recover interrupted restores.
- Notify the agent about restored files without rewriting chat history.
- Chinese and English Web UI; snapshots and undo require no model calls.

<details>
<summary>See the real DSH Web acceptance screenshot</summary>

![Successful restoration in an isolated DSH Web test workspace](docs/browser-proof.png)

This screenshot uses a deterministic test checkpoint. Automatic turn capture is covered by production-service integration tests.
</details>

## Install

Requires DSH **0.2.1-alpha.1**, Cordis **4.0.5-alpha.1**, Node 24+ and Git. Tested on Windows. Other pre-stable runtime versions are not claimed compatible. This first release is for local Git workspaces and bounded UTF-8 text files.

Download `dsh-time-machine-0.1.0.tgz` from [Releases](https://github.com/icyaaaww/dsh-time-machine/releases/tag/v0.1.0), then run:

```sh
dsh plugin --profile web add /absolute/path/dsh-time-machine-0.1.0.tgz
dsh --profile web --dump-config
```

Restart the Web host after installation. For Desktop, use its own plugin management and matching bundled runtime. The tarball includes compiled Host and lazy-CJS browser modules; no install-time build scripts are required.

## Use

After an agent changes a local Git workspace, select **Open change timeline** beside the composer. Inspect a turn, optionally select individual files and refresh the preview, then explicitly confirm undo. Later edits cause a conflict instead of being overwritten. Undo creates another checkpoint, so it can itself be undone. Chat history remains intact, and a persisted inbox notice tells the agent to inspect the restored files.

Human commands: `/time_machine`, `/time_machine preview <id>`, `/time_machine undo <preview-token>`, `/time_machine name <id> <label>`, `/time_machine recover`. Preview tokens are single-use, session-bound, and expire after five minutes by default. Commands operate only while the receiving agent is idle. Model tools cannot invoke restoration through this plugin.

## Configuration

The `time-machine` row accepts `storageRoot` (default `$DSH_HOME/plugins/time-machine`, falling back to `~/.dsh/plugins/time-machine`), `maxFileBytes` (2 MiB), `maxFiles` (5,000), `maxStoreBytes` (512 MiB per repository), `maxRecords` (2,000 per repository), `timeoutMs` (30,000), `maxDiffChars` (60,000), and `previewTtlMs` (300,000). Configure `storageRoot` explicitly when the launcher home differs from its environment. Storage must be outside the repository. Limits stop new captures rather than silently evicting checkpoints.

## Implementation and official conventions

`dsh.bundle.patch` mounts one function plugin with named `name/inject/Config/apply` exports. Runtime identity dependencies are declared as both peers and development dependencies. Registrations are Cordis effects; disposal removes admission and drains in-flight operations. Browser UI uses the official `conversation.input.dock` and keyed `conversation.chat.commandview` slots, typed locale dictionaries and the lazy `window.__ModuleLoader__.load({id,factory})` module format.

Snapshot records and content-addressed objects live outside the repository. `git ls-files` discovers tracked and non-ignored untracked files without changing Git state. SHA-256 plus permission modes identify file versions. A write-ahead journal precedes restoration; recovery rolls back applied files only if they still match one of the recorded versions. The plugin uses the existing `command/run`, `command/done`, and durable Agent inbox vocabulary, so removal does not introduce unknown custom Session event types.

## Development

```sh
npm ci --ignore-scripts
npm run typecheck
npm run build
npm test
npm pack
```

Tests cover real temporary repositories, the official YAML Loader, production Agent and command services, durable inbox notification, uninstall lifecycle, browser factory loading, and React interaction. The implementation has been executed on Windows; macOS/Linux require additional platform acceptance.

## Model Experience

### Workspace restoration notice

#### What the model sees

After a human restoration, an appended `time-machine` context notice identifies the checkpoint and restored paths, asks the agent to inspect files before editing and rerun tests when necessary. The notice enters the persistent Agent inbox and the Session is flushed. It does not wake the model.

#### Token effect

One path-list notice per restoration/recovery. Capturing snapshots and viewing changes perform no model requests.

#### KV Cache effect

Append-only context. Existing conversation history is not rewritten.

## Known Limitations and Deferred Work

- Host-local Git repositories and bounded UTF-8 regular files only. Binary, oversized, linked, ignored-untracked and nested-repository contents are excluded. Snapshot exclusions are surfaced.
- A turn captures workspace changes, including concurrent human edits; it cannot attribute authorship. Stop external writers before restoring. File hashes and cooperative locks do not provide atomic isolation from arbitrary outside processes.
- Restoration is per-file, journaled, and conflict checked; multi-file replacement is not atomic. An interruption requires `/time_machine recover`. Existing user edits that differ from the journal block recovery.
- Git index, commits, databases, deployments, empty directories, ACLs and extended attributes are not restored. Checkpoints preserve ordinary mode bits; Windows semantics differ.
- An interrupted turn baseline is compared with current disk on the next access, potentially including intervening manual edits. Capture failures warn but do not block ordinary agent work.
- Lists show the current session's latest 50 records. Older ids remain addressable. Cross-session browsing, automatic retention, branch switching and full-text search are deferred. Stored source history must be protected as project data.
- Exact DSH peer versions are required. No compatibility exemption or runtime installation is performed automatically.
