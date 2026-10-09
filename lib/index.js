// src/index.ts
import { homedir } from "node:os";
import { join as join2, resolve as resolve2 } from "node:path";
import z from "@deepseek-ai/schemastery";
import { createUserMessage } from "@deepseek-ai/dsh-llm";

// src/store.ts
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, rename, unlink, lstat, realpath, readdir, open, chmod } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { createTwoFilesPatch } from "diff";
import lockfile from "proper-lockfile";
var exec = promisify(execFile);
var digest = (data) => createHash("sha256").update(data).digest("hex");
var isMissing = (error) => error instanceof Error && "code" in error && error.code === "ENOENT";
var defaults = { maxFileBytes: 2097152, maxFiles: 5e3, maxStoreBytes: 536870912, maxRecords: 2e3, timeoutMs: 3e4, maxDiffChars: 6e4 };
var same = (a, b) => (a ?? null) === (b ?? null) || a != null && b != null && a.hash === b.hash && a.mode === b.mode;
function validateVersion(value) {
  if (!value || typeof value !== "object" || !("hash" in value) || typeof value.hash !== "string" || !/^[a-f0-9]{64}$/u.test(value.hash) || !("mode" in value) || typeof value.mode !== "number" || !Number.isInteger(value.mode) || value.mode < 0 || value.mode > 511) throw new Error("Invalid file version.");
}
function safeRelative(path) {
  if (!path || isAbsolute(path) || path.includes("\\") || /[:\x00-\x1f]/u.test(path) || path.split("/").some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) {
    throw new Error(`Unsafe path: ${path}`);
  }
}
async function atomicJson(path, data) {
  await mkdir(dirname(path), { recursive: true, mode: 448 });
  const temp = `${path}.${randomUUID()}.tmp`;
  const fd = await open(temp, "wx", 384);
  try {
    await fd.writeFile(JSON.stringify(data));
    await fd.sync();
  } finally {
    await fd.close();
  }
  try {
    await rename(temp, path);
  } finally {
    await unlink(temp).catch((error) => {
      if (!isMissing(error)) throw error;
    });
  }
}
var TimeMachineStore = class _TimeMachineStore {
  constructor(root, directory, limits) {
    this.root = root;
    this.directory = directory;
    this.limits = limits;
  }
  static async create(cwd, storageRoot, limits = defaults) {
    const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD|^GIT_/iu.test(key)));
    const { stdout } = await exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      env: { ...environment, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
      timeout: limits.timeoutMs,
      windowsHide: true,
      maxBuffer: 1048576
    });
    const root = await realpath(stdout.trim());
    const directory = resolve(storageRoot, digest(root));
    if (directory === root || directory.startsWith(root + sep)) throw new Error("Snapshot storage must be outside the repository.");
    await mkdir(directory, { recursive: true, mode: 448 });
    await mkdir(join(directory, "objects"), { recursive: true, mode: 448 });
    await mkdir(join(directory, "records"), { recursive: true, mode: 448 });
    await writeFile(join(directory, "lock-anchor"), "", { flag: "a", mode: 384 });
    return new _TimeMachineStore(root, directory, limits);
  }
  /** Serialize cooperating hosts; a crashed owner expires after two minutes. */
  async exclusive(action) {
    let compromised;
    const release = await lockfile.lock(join(this.directory, "lock-anchor"), {
      retries: 0,
      stale: 12e4,
      update: 1e4,
      onCompromised: (error) => {
        compromised = error;
      }
    });
    try {
      const result = await action();
      if (compromised) throw compromised;
      return result;
    } finally {
      await release();
    }
  }
  recordPath(id) {
    if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error("Invalid checkpoint id.");
    return join(this.directory, "records", `${id}.json`);
  }
  pendingPath(sessionId) {
    return join(this.directory, `pending-${digest(sessionId)}.json`);
  }
  /** Fail closed on symlinks, junctions, nested repositories and non-file targets. */
  async checkedPath(path) {
    safeRelative(path);
    const parts = path.split("/");
    let current = this.root;
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]);
      let stat;
      try {
        stat = await lstat(current);
      } catch (error) {
        if (isMissing(error)) continue;
        throw error;
      }
      if (stat.isSymbolicLink()) throw new Error(`Symlink/junction is not supported: ${path}`);
      if (index < parts.length - 1) {
        if (!stat.isDirectory()) throw new Error(`Parent is not a directory: ${path}`);
        try {
          await lstat(join(current, ".git"));
          throw new Error(`Nested repository is not supported: ${path}`);
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
      } else if (!stat.isFile()) throw new Error(`Not a regular file: ${path}`);
    }
    return current;
  }
  async readVersion(path) {
    const absolute = await this.checkedPath(path);
    let stat;
    try {
      stat = await lstat(absolute);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    if (stat.size > this.limits.maxFileBytes) throw new Error(`File exceeds maxFileBytes: ${path}`);
    const bytes = await readFile(absolute);
    if (bytes.length > this.limits.maxFileBytes || bytes.includes(0)) throw new Error(`Binary or oversized file: ${path}`);
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`Non-UTF-8 file: ${path}`);
    }
    const after = await lstat(absolute);
    if (stat.ino !== after.ino || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs) throw new Error(`File changed while reading: ${path}`);
    return { version: { hash: digest(bytes), mode: stat.mode & 511 }, bytes };
  }
  async blob(hash) {
    if (!/^[a-f0-9]{64}$/u.test(hash)) throw new Error("Invalid content hash.");
    const bytes = await readFile(join(this.directory, "objects", hash));
    if (digest(bytes) !== hash) throw new Error("Snapshot content is corrupt.");
    return bytes;
  }
  async snapshot() {
    const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD|^GIT_/iu.test(key)));
    const { stdout } = await exec("git", ["-C", this.root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      env: { ...environment, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
      timeout: this.limits.timeoutMs,
      maxBuffer: 8388608,
      windowsHide: true
    });
    const paths = [...new Set(stdout.split("\0").filter(Boolean))].sort();
    if (paths.length > this.limits.maxFiles) throw new Error("Repository exceeds maxFiles; no incomplete checkpoint was created.");
    let used = 0;
    for (const entry of await readdir(join(this.directory, "objects"))) used += (await lstat(join(this.directory, "objects", entry))).size;
    const files = /* @__PURE__ */ Object.create(null);
    const skipped = [];
    for (const path of paths) {
      let read;
      try {
        read = await this.readVersion(path);
      } catch {
        skipped.push(path);
        continue;
      }
      if (!read) continue;
      const objectPath = join(this.directory, "objects", read.version.hash);
      try {
        await lstat(objectPath);
      } catch (error) {
        if (!isMissing(error)) throw error;
        if (used + read.bytes.length > this.limits.maxStoreBytes) throw new Error("Snapshot storage limit reached. Existing checkpoints remain readable.");
        const fd = await open(objectPath, "wx", 384);
        try {
          await fd.writeFile(read.bytes);
          await fd.sync();
        } finally {
          await fd.close();
        }
        used += read.bytes.length;
      }
      files[path] = read.version;
    }
    return { files, skipped };
  }
  async records(sessionId) {
    const names = (await readdir(join(this.directory, "records"))).filter((name2) => name2.endsWith(".json"));
    const rows = [];
    for (const name2 of names) {
      const record = await this.readRecord(name2.slice(0, -5));
      if (sessionId === void 0 || record.sessionId === sessionId) rows.push(record);
    }
    return rows.sort((a, b) => b.time.localeCompare(a.time) || b.id.localeCompare(a.id));
  }
  async readRecord(id) {
    const value = JSON.parse(await readFile(this.recordPath(id), "utf8"));
    if (!value || typeof value !== "object") throw new Error("Invalid checkpoint.");
    const record = value;
    if (record.schema !== 1 || record.id !== id || record.root !== this.root || !Array.isArray(record.changes) || !Array.isArray(record.skipped) || typeof record.sessionId !== "string" || typeof record.label !== "string" || typeof record.time !== "string" || !Number.isSafeInteger(record.turn) || !["complete", "prepared"].includes(record.status) || !["turn", "undo"].includes(record.kind)) throw new Error("Invalid checkpoint metadata.");
    const paths = /* @__PURE__ */ new Set();
    for (const change of record.changes) {
      safeRelative(change.path);
      if (paths.has(change.path)) throw new Error("Duplicate checkpoint path.");
      paths.add(change.path);
      for (const version of [change.before, change.after]) {
        if (version !== null) validateVersion(version);
      }
    }
    return record;
  }
  async assertReady() {
    if ((await this.records()).some((row) => row.status === "prepared")) throw new Error("An interrupted restore needs recovery first: /time_machine recover");
  }
  async begin(sessionId, turn) {
    await this.assertReady();
    await this.finishPending(sessionId, "Recovered interrupted turn");
    if ((await this.records()).length >= this.limits.maxRecords) throw new Error("Checkpoint count limit reached.");
    await atomicJson(this.pendingPath(sessionId), { schema: 1, sessionId, turn, before: await this.snapshot() });
  }
  async finishPending(sessionId, label = "") {
    let pending;
    try {
      pending = JSON.parse(await readFile(this.pendingPath(sessionId), "utf8"));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    if (pending.schema !== 1 || pending.sessionId !== sessionId || !Number.isSafeInteger(pending.turn) || !pending.before?.files || !Array.isArray(pending.before.skipped)) throw new Error("Invalid pending snapshot.");
    const validated = /* @__PURE__ */ Object.create(null);
    for (const [path, version] of Object.entries(pending.before.files)) {
      safeRelative(path);
      validateVersion(version);
      validated[path] = version;
    }
    for (const path of pending.before.skipped) {
      if (typeof path !== "string") throw new Error("Invalid skipped path.");
    }
    pending.before.files = validated;
    const after = await this.snapshot();
    const skipped = [.../* @__PURE__ */ new Set([...pending.before.skipped, ...after.skipped])];
    const omitted = new Set(skipped);
    const changes = [];
    for (const path of [.../* @__PURE__ */ new Set([...Object.keys(pending.before.files), ...Object.keys(after.files)])].sort()) {
      safeRelative(path);
      if (!omitted.has(path) && !same(pending.before.files[path], after.files[path])) {
        changes.push({ path, before: pending.before.files[path] ?? null, after: after.files[path] ?? null });
      }
    }
    if (!changes.length && !skipped.length) {
      await unlink(this.pendingPath(sessionId));
      return null;
    }
    const record = {
      schema: 1,
      id: randomUUID(),
      root: this.root,
      sessionId,
      turn: pending.turn,
      time: (/* @__PURE__ */ new Date()).toISOString(),
      label,
      kind: "turn",
      status: "complete",
      changes,
      skipped
    };
    await atomicJson(this.recordPath(record.id), record);
    await unlink(this.pendingPath(sessionId));
    return record;
  }
  async label(id, sessionId, label) {
    const record = await this.owned(id, sessionId);
    if (!label.trim() || label.length > 120) throw new Error("Checkpoint name must contain 1\u2013120 characters.");
    await atomicJson(this.recordPath(id), { ...record, label: label.trim() });
  }
  async owned(id, sessionId) {
    const row = await this.readRecord(id);
    if (row.sessionId !== sessionId) throw new Error("This checkpoint belongs to another session.");
    return row;
  }
  async preview(id, sessionId, paths) {
    const checkpoint = await this.owned(id, sessionId);
    if (checkpoint.status !== "complete") throw new Error("Recover the interrupted restore first.");
    if (paths?.some((path) => !checkpoint.changes.some((change) => change.path === path))) throw new Error("Unknown checkpoint file.");
    const changes = checkpoint.changes.filter((change) => paths === void 0 || paths.includes(change.path));
    if (!changes.length) throw new Error("No supported file changes selected.");
    const conflicts = [];
    let diff = "";
    for (const change of changes) {
      try {
        if (!same((await this.readVersion(change.path))?.version, change.after)) conflicts.push(change.path);
      } catch {
        conflicts.push(change.path);
      }
      const before = change.before === null ? "" : (await this.blob(change.before.hash)).toString("utf8");
      const after = change.after === null ? "" : (await this.blob(change.after.hash)).toString("utf8");
      if (diff.length < this.limits.maxDiffChars) diff += createTwoFilesPatch(`before/${change.path}`, `after/${change.path}`, before, after, void 0, void 0, { context: 3 });
    }
    if (diff.length > this.limits.maxDiffChars) diff = diff.slice(0, this.limits.maxDiffChars) + "\n[diff truncated]";
    return { checkpoint, changes, conflicts, diff, token: randomUUID() };
  }
  async replace(change, desired) {
    const path = await this.checkedPath(change.path);
    if (desired === null) {
      await unlink(path);
      return;
    }
    const bytes = await this.blob(desired.hash);
    await mkdir(dirname(path), { recursive: true });
    await this.checkedPath(change.path);
    const temp = join(dirname(path), `.dsh-tm-${randomUUID()}.tmp`);
    const fd = await open(temp, "wx", desired.mode);
    try {
      await fd.writeFile(bytes);
      await fd.sync();
    } finally {
      await fd.close();
    }
    try {
      await rename(temp, path);
      await chmod(path, desired.mode);
    } finally {
      await unlink(temp).catch((error) => {
        if (!isMissing(error)) throw error;
      });
    }
  }
  /** The durable prepared record is a write-ahead recovery journal, not a success claim. */
  async undo(preview) {
    await this.assertReady();
    if ((await this.records()).length >= this.limits.maxRecords) throw new Error("Checkpoint count limit reached; restoration requires space for a recovery record.");
    const fresh = await this.preview(preview.checkpoint.id, preview.checkpoint.sessionId, preview.changes.map((change) => change.path));
    if (fresh.conflicts.length) throw new Error(`Files changed since this checkpoint: ${fresh.conflicts.join(", ")}`);
    const journal = {
      ...fresh.checkpoint,
      id: randomUUID(),
      time: (/* @__PURE__ */ new Date()).toISOString(),
      label: "Undo",
      kind: "undo",
      status: "prepared",
      undoOf: fresh.checkpoint.id,
      changes: fresh.changes.map((change) => ({ path: change.path, before: change.after, after: change.before })),
      skipped: []
    };
    await atomicJson(this.recordPath(journal.id), journal);
    try {
      for (const change of journal.changes) {
        if (!same((await this.readVersion(change.path))?.version, change.before)) throw new Error(`Concurrent edit: ${change.path}`);
        await this.replace(change, change.after);
      }
      journal.status = "complete";
      await atomicJson(this.recordPath(journal.id), journal);
      return journal;
    } catch (error) {
      throw new Error(`Restore interrupted; recovery journal ${journal.id} was retained. Use /time_machine recover.`, { cause: error });
    }
  }
  /** Roll back an interrupted restore only where bytes still match its recorded versions. */
  async recover(sessionId) {
    const recovered = [];
    for (const record of await this.records()) {
      if (record.status !== "prepared") continue;
      if (record.sessionId !== sessionId) throw new Error("Another session has an interrupted restore. Recover it in that session.");
      const applied = [];
      for (const change of record.changes) {
        const current = (await this.readVersion(change.path))?.version;
        if (same(current, change.before)) continue;
        if (!same(current, change.after)) throw new Error(`Recovery conflict; preserve external edits: ${change.path}`);
        applied.push(change);
      }
      for (const change of applied) {
        if (!same((await this.readVersion(change.path))?.version, change.after)) throw new Error(`Concurrent edit during recovery: ${change.path}`);
        await this.replace(change, change.before);
      }
      await atomicJson(this.recordPath(record.id), { ...record, status: "complete", label: "Interrupted undo recovered", changes: [] });
      recovered.push(record.id);
    }
    return recovered;
  }
};

// src/protocol.ts
function parseRequest(text) {
  const trimmed = text.trim();
  let value;
  if (trimmed.startsWith("{")) value = JSON.parse(trimmed);
  else {
    const [action = "list", argument = "", ...rest] = trimmed.split(/\s+/u);
    value = action === "preview" ? { action, id: argument } : action === "undo" ? { action, token: argument } : action === "name" ? { action, id: argument, label: rest.join(" ") } : { action: action || "list" };
  }
  if (!value || typeof value !== "object") throw new Error("Invalid time-machine command.");
  const data = value;
  if (data.action === "list" || data.action === "recover") return { action: data.action };
  if (data.action === "undo" && typeof data.token === "string") return { action: "undo", token: data.token };
  if (data.action === "name" && typeof data.id === "string" && typeof data.label === "string") return { action: "name", id: data.id, label: data.label };
  if (data.action === "preview" && typeof data.id === "string" && (data.paths === void 0 || Array.isArray(data.paths) && data.paths.length > 0 && data.paths.every((path) => typeof path === "string"))) {
    return { action: "preview", id: data.id, ...data.paths === void 0 ? {} : { paths: data.paths } };
  }
  throw new Error("Usage: /time_machine [list | preview <id> | undo <preview-token> | name <id> <name> | recover]");
}

// src/index.ts
var name = "time-machine";
var inject = ["agents", "commands", "fs", "sessions"];
var Config = z.object({
  storageRoot: z.string().default(""),
  previewTtlMs: z.number().step(1).min(1e3).default(3e5),
  maxFileBytes: z.number().step(1).min(1).default(defaults.maxFileBytes),
  maxFiles: z.number().step(1).min(1).default(defaults.maxFiles),
  maxStoreBytes: z.number().step(1).min(1).default(defaults.maxStoreBytes),
  maxRecords: z.number().step(1).min(1).default(defaults.maxRecords),
  timeoutMs: z.number().step(1).min(1).default(defaults.timeoutMs),
  maxDiffChars: z.number().step(1).min(1e3).default(defaults.maxDiffChars)
});
function apply(ctx, config) {
  const home = process.env.DSH_HOME?.trim() || join2(homedir(), ".dsh");
  const expandedHome = home.startsWith("~") ? join2(homedir(), home.slice(1)) : home;
  const storage = config.storageRoot ? resolve2(config.storageRoot) : resolve2(expandedHome, "plugins", "time-machine");
  const states = /* @__PURE__ */ new Map();
  const previews = /* @__PURE__ */ new Map();
  const running = /* @__PURE__ */ new Set();
  let closing = false;
  function stateFor(session) {
    const existing = states.get(session);
    if (existing) return existing;
    const cwd = session.header.cwd;
    if (!cwd) throw new Error("Time Machine needs a local Git workspace.");
    if (ctx.fs.processPathFromHostPath(resolve2(cwd)) !== resolve2(cwd)) throw new Error("Time Machine supports host-local workspaces only.");
    const store = TimeMachineStore.create(cwd, storage, config);
    const state = { store, queue: Promise.resolve() };
    states.set(session, state);
    return state;
  }
  function track(promise) {
    running.add(promise);
    void promise.then(() => running.delete(promise), () => running.delete(promise));
    return promise;
  }
  function enqueue(session, operation, clearWarning = false) {
    if (closing || session.header.origin === "subagent" || (session.header.delegationDepth ?? 0) > 0 || !session.header.cwd) return;
    let state;
    try {
      state = stateFor(session);
    } catch (error) {
      ctx.logger.warn(String(error));
      return;
    }
    state.queue = track(state.queue.then(async () => {
      const store = await state.store;
      await store.exclusive(() => operation(store));
      if (clearWarning) state.warning = void 0;
    }).catch((error) => {
      state.warning = error instanceof Error ? error.message : String(error);
      ctx.logger.warn(`time-machine: ${state.warning}`);
    }));
  }
  async function notify(agent, text) {
    agent.inject(createUserMessage({
      content: [{ type: "text", text }],
      source: { kind: "time-machine", form: "notice", summary: "Workspace files restored" }
    }));
    await ctx.sessions.flush(agent.session);
  }
  async function execute(invocation) {
    if (closing) return { kind: "error", text: "Time Machine is unloading." };
    try {
      const request = parseRequest(invocation.rawInput);
      const agent = invocation.agent;
      const state = stateFor(agent.session);
      const reply = await agent.runMaintenance(async (maintenanceSignal) => {
        invocation.signal.throwIfAborted();
        maintenanceSignal.throwIfAborted();
        await state.queue;
        const store = await state.store;
        return store.exclusive(async () => {
          invocation.signal.throwIfAborted();
          maintenanceSignal.throwIfAborted();
          const sessionId = String(agent.session.id);
          if (request.action === "undo" || request.action === "recover") {
            for (const other of ctx.agents.list()) {
              if (other === agent || other.status !== "running" || !other.session.header.cwd) continue;
              const otherPath = resolve2(other.session.header.cwd);
              if (otherPath === store.root || otherPath.startsWith(store.root + (process.platform === "win32" ? "\\" : "/"))) {
                throw new Error("Another agent is running in this repository. Wait for it to stop before restoring files.");
              }
            }
          }
          for (const [token, value] of previews) if (value.expires < Date.now()) previews.delete(token);
          if (request.action === "recover") {
            const recovered = await store.recover(sessionId);
            if (recovered.length) await notify(agent, `Time Machine recovered interrupted file restoration(s): ${recovered.join(", ")}. Inspect the workspace before continuing. Conversation history was preserved.`);
            return { protocol: "dsh-time-machine/v1", kind: "done", message: `Recovered ${recovered.length} interrupted restore(s).` };
          }
          await store.finishPending(sessionId, "Recovered interrupted turn");
          if (request.action === "list") return { protocol: "dsh-time-machine/v1", kind: "list", records: (await store.records(sessionId)).slice(0, 50), ...state.warning ? { warning: state.warning } : {} };
          if (request.action === "preview") {
            const preview = await store.preview(request.id, sessionId, request.paths);
            previews.set(preview.token, { preview, session: agent.session, expires: Date.now() + config.previewTtlMs });
            return { protocol: "dsh-time-machine/v1", kind: "preview", preview };
          }
          if (request.action === "name") {
            await store.label(request.id, sessionId, request.label);
            return { protocol: "dsh-time-machine/v1", kind: "done", message: request.label };
          }
          const pending = previews.get(request.token);
          if (!pending || pending.session !== agent.session) throw new Error("Preview expired or belongs to another session. Preview the changes again.");
          previews.delete(request.token);
          const record = await store.undo(pending.preview);
          await notify(agent, `Time Machine restored files from checkpoint ${pending.preview.checkpoint.id}: ${record.changes.map((change) => change.path).join(", ")}. The current working files supersede earlier descriptions. Read them before editing. Tests may need rerunning. Conversation history was preserved.`);
          return { protocol: "dsh-time-machine/v1", kind: "done", message: "Files restored. A new checkpoint can undo this restoration.", record };
        });
      });
      return { kind: "success", text: JSON.stringify(reply) };
    } catch (error) {
      return { kind: "error", text: error instanceof Error ? error.message : String(error) };
    }
  }
  ctx.effect(function* () {
    yield async () => {
      closing = true;
      await Promise.allSettled([...running]);
      previews.clear();
      states.clear();
    };
    yield ctx.commands.register({
      name: "time_machine",
      description: "Browse persistent file changes and preview safe undo / \u6539\u52A8\u65F6\u5149\u673A",
      input: { hint: "list | preview <id> | undo <preview-token> | name <id> <name> | recover" },
      handler: (invocation) => track(execute(invocation))
    });
    yield ctx.on("session/event", (session, event) => {
      if (event.type === "turn/start") enqueue(session, (store) => store.begin(String(session.id), event.data.turn), true);
      else if (event.type === "turn/end") enqueue(session, (store) => store.finishPending(String(session.id)));
    });
    yield ctx.on("tools/pre-execute", async (execution, next) => {
      const state = execution.agent && states.get(execution.agent.session);
      if (state) await state.queue;
      return next();
    });
    yield ctx.on("session/disposed", (session) => {
      for (const [token, value] of previews) if (value.session === session) previews.delete(token);
      const state = states.get(session);
      if (state) void state.queue.then(() => states.delete(session));
    });
  }, "time-machine lifecycle");
}
export {
  Config,
  apply,
  inject,
  name
};
