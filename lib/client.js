window.__ModuleLoader__.load({id:"dsh-time-machine",factory:(require)=>{var module={exports:{}};var exports=module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  Dock: () => Dock,
  ReplyView: () => ReplyView,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");

// src/protocol.ts
function readReply(text) {
  if (!text) return void 0;
  try {
    const data = JSON.parse(text);
    return data.protocol === "dsh-time-machine/v1" && ["list", "preview", "done"].includes(data.kind ?? "") ? data : void 0;
  } catch {
    return void 0;
  }
}
function commandOutcome(value) {
  if (!value || typeof value !== "object" || !("ok" in value)) throw new Error("Invalid command response.");
  if (value.ok !== true) {
    const error = "error" in value ? value.error : void 0;
    throw new Error(error && typeof error === "object" && "message" in error ? String(error.message) : "Command request failed.");
  }
  const execution = "value" in value ? value.value : void 0;
  if (!execution || typeof execution !== "object" || !("result" in execution)) throw new Error("Time Machine command is unavailable.");
  const result = execution.result;
  if (!result || typeof result !== "object" || !("kind" in result)) throw new Error("Invalid command outcome.");
  if (result.kind !== "success") throw new Error("text" in result ? String(result.text) : "Command failed.");
  return "text" in result ? String(result.text) : "";
}

// src/locales.ts
var zh = {
  title: "\u6539\u52A8\u65F6\u5149\u673A",
  open: "\u67E5\u770B\u6539\u52A8\u65F6\u95F4\u7EBF",
  close: "\u6536\u8D77\u65F6\u95F4\u7EBF",
  refresh: "\u5237\u65B0",
  working: "\u6B63\u5728\u5904\u7406\u2026",
  empty: "\u8FD8\u6CA1\u6709\u6587\u4EF6\u6539\u52A8\u3002\u5B8C\u6210\u4E00\u6B21\u4FEE\u6539\u540E\uFF0C\u8BB0\u5F55\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
  preview: "\u67E5\u770B\u5DEE\u5F02 / \u64A4\u56DE\u9884\u89C8",
  undo: "\u786E\u8BA4\u64A4\u56DE\u6240\u9009\u6587\u4EF6",
  select: "\u4EC5\u9884\u89C8\u6240\u9009\u6587\u4EF6",
  conflict: "\u4EE5\u4E0B\u6587\u4EF6\u5DF2\u6709\u540E\u7EED\u6539\u52A8\uFF0C\u5DF2\u963B\u6B62\u64A4\u56DE\uFF1A",
  stale: "\u9884\u89C8\u8FC7\u671F\u6216\u6587\u4EF6\u72B6\u6001\u53EF\u80FD\u5DF2\u53D8\u5316\u65F6\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002",
  scope: "\u64A4\u56DE\u53EA\u6062\u590D\u5217\u51FA\u7684\u6587\u4EF6\u5185\u5BB9\uFF1B\u804A\u5929\u8BB0\u5F55\u4FDD\u7559\u3002\u6570\u636E\u5E93\u3001\u90E8\u7F72\u548C\u5916\u90E8\u64CD\u4F5C\u4E0D\u5728\u6062\u590D\u8303\u56F4\u5185\u3002",
  files: "\u4E2A\u6587\u4EF6",
  skipped: "\u4E2A\u4E0D\u652F\u6301\u7684\u6587\u4EF6\u672A\u7EB3\u5165\u5FEB\u7167",
  turn: "\u8F6E\u6B21",
  name: "\u68C0\u67E5\u70B9\u540D\u79F0",
  save: "\u4FDD\u5B58\u540D\u79F0",
  done: "\u64CD\u4F5C\u5B8C\u6210",
  restored: "\u6587\u4EF6\u5DF2\u6062\u590D\uFF0C\u5E76\u5DF2\u901A\u77E5 Agent\u3002\u6B64\u6B21\u6062\u590D\u4E5F\u5DF2\u4FDD\u5B58\u4E3A\u53EF\u64A4\u56DE\u7684\u8BB0\u5F55\u3002",
  recover: "\u6062\u590D\u4E2D\u65AD\u7684\u64A4\u56DE\u64CD\u4F5C",
  prepared: "\u4E0A\u6B21\u64A4\u56DE\u4E2D\u65AD\uFF0C\u8BF7\u5148\u6062\u590D",
  failure: "\u64CD\u4F5C\u5931\u8D25",
  diff: "\u672C\u6B21\u6539\u52A8\uFF08\u64A4\u56DE\u5C06\u6062\u590D\u4E3A\u4FEE\u6539\u524D\u5185\u5BB9\uFF09",
  all: "\u5168\u90E8\u6587\u4EF6",
  busy: "Agent \u7A7A\u95F2\u540E\u53EF\u67E5\u770B\u548C\u6062\u590D\u3002",
  recovered: "\u4E2D\u65AD\u7684\u6062\u590D\u64CD\u4F5C\u5DF2\u5904\u7406\u3002",
  saved: "\u68C0\u67E5\u70B9\u540D\u79F0\u5DF2\u4FDD\u5B58\u3002"
};
var en = {
  title: "Time Machine",
  open: "Open change timeline",
  close: "Close timeline",
  refresh: "Refresh",
  working: "Working\u2026",
  empty: "No file changes yet. Records appear after a turn changes your files.",
  preview: "View diff / preview undo",
  undo: "Confirm undo of selected files",
  select: "Preview selected files only",
  conflict: "Later edits detected; undo is blocked for:",
  stale: "Preview again if this preview expired or files changed.",
  scope: "Undo restores only the listed files. Chat history is preserved. Databases, deployments and external actions are not restored.",
  files: "files",
  skipped: "unsupported files excluded",
  turn: "Turn",
  name: "Checkpoint name",
  save: "Save name",
  done: "Done",
  restored: "Files restored and the agent informed. This restoration has its own undo checkpoint.",
  recover: "Recover interrupted undo",
  prepared: "An interrupted undo needs recovery",
  failure: "Operation failed",
  diff: "Recorded change (undo restores the before side)",
  all: "All files",
  busy: "Browse and restore while the agent is idle.",
  recovered: "Interrupted restoration handled.",
  saved: "Checkpoint name saved."
};

// src/client.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots", "locale", "remote", "remote.commands"];
var name = "time-machine-client";
var css = `
.dsh-tm{box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.6;max-width:100%;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-specific-menu)}
.dsh-tm header,.dsh-tm footer{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.dsh-tm header{justify-content:space-between}.dsh-tm h3{margin:0;font-size:14px}.dsh-tm p{margin:8px 0;color:var(--dsw-alias-label-secondary)}
.dsh-tm button,.dsh-tm input{font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:5px 10px}.dsh-tm button{cursor:pointer}.dsh-tm button:disabled{opacity:.45;cursor:default}.dsh-tm button:focus-visible,.dsh-tm input:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.dsh-tm article{padding:12px 0;border-top:1px solid var(--dsw-alias-border-l1);overflow-wrap:anywhere}.dsh-tm small{color:var(--dsw-alias-label-tertiary)}.dsh-tm pre{white-space:pre;overflow:auto;max-height:420px;font-size:12px;padding:10px;border:1px solid var(--dsw-alias-border-l1)}
.dsh-tm fieldset{border:0;margin:10px 0;padding:0;max-height:180px;overflow:auto}.dsh-tm label{display:block;overflow-wrap:anywhere}.dsh-tm label input{margin-right:8px}.dsh-tm [role=alert]{padding:8px;border-left:3px solid currentColor}.dsh-tm-dock{padding:4px 10px;margin:4px auto;width:fit-content}
`;
function useAction(run) {
  const latch = (0, import_react.useRef)(false);
  const [pending, setPending] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)("");
  return { pending, error, invoke: async (request) => {
    if (latch.current) return;
    latch.current = true;
    setPending(true);
    setError("");
    try {
      await run(request);
    } catch (error2) {
      setError(error2 instanceof Error ? error2.message : String(error2));
    } finally {
      latch.current = false;
      setPending(false);
    }
  } };
}
function Dock({ run, t }) {
  const [reply, setReply] = (0, import_react.useState)();
  const show = async (request) => {
    const next = await run(request);
    if (next) setReply(next);
  };
  const { invoke, pending, error } = useAction(show);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-tm dsh-tm-dock", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: pending, onClick: () => reply ? setReply(void 0) : void invoke({ action: "list" }), children: pending ? t("working") : reply ? t("close") : t("open") }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: error }),
    reply && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { maxHeight: "50vh", overflow: "auto" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReplyView, { reply, run: show, t }) })
  ] });
}
function RecordRow({ record, run, t }) {
  const [label, setLabel] = (0, import_react.useState)(record.label);
  const { invoke, pending, error } = useAction(run);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: record.label || `${t("turn")} ${record.turn}` }),
    " ",
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
      new Date(record.time).toLocaleString(),
      " \xB7 ",
      record.changes.length,
      " ",
      t("files")
    ] }),
    record.skipped.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
      record.skipped.length,
      " ",
      t("skipped")
    ] }),
    record.status === "prepared" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: t("prepared") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
      record.changes.slice(0, 8).map((change) => change.path).join(" \xB7 "),
      record.changes.length > 8 ? " \u2026" : ""
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: pending || !record.changes.length || record.status !== "complete", onClick: () => void invoke({ action: "preview", id: record.id }), children: t("preview") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { "aria-label": t("name"), placeholder: t("name"), value: label, maxLength: 120, onChange: (event) => setLabel(event.target.value) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: pending || !label.trim(), onClick: () => void invoke({ action: "name", id: record.id, label }), children: t("save") })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: error })
  ] });
}
function PreviewCard({ preview, run, t }) {
  const [selected, setSelected] = (0, import_react.useState)(() => new Set(preview.changes.map((change) => change.path)));
  const [used, setUsed] = (0, import_react.useState)(false);
  const { invoke, pending, error } = useAction(run);
  const whole = selected.size === preview.changes.length;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("scope") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", { children: t("files") }),
      preview.changes.map((change) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: selected.has(change.path), onChange: () => setSelected((old) => {
          const copy = new Set(old);
          copy.has(change.path) ? copy.delete(change.path) : copy.add(change.path);
          return copy;
        }) }),
        change.path
      ] }, change.path))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("diff") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { children: preview.diff })
    ] }),
    preview.conflicts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { role: "alert", children: [
      t("conflict"),
      " ",
      preview.conflicts.join(", ")
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("stale") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: pending || selected.size === 0, onClick: () => void invoke({ action: "preview", id: preview.checkpoint.id, paths: [...selected] }), children: whole ? t("refresh") : t("select") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: pending || used || !whole || preview.conflicts.length > 0, onClick: () => {
        setUsed(true);
        void invoke({ action: "undo", token: preview.token });
      }, children: t("undo") })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: error })
  ] });
}
function ReplyView({ reply, run, t }) {
  const { invoke, pending, error } = useAction(run);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsh-tm", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: t("title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: pending, onClick: () => void invoke({ action: "list" }), children: t("refresh") })
    ] }),
    reply.kind === "list" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("busy") }),
      reply.warning && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: reply.warning }),
      reply.records.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: t("empty") }) : reply.records.map((record) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RecordRow, { record, run, t }, record.id)),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { disabled: pending, onClick: () => void invoke({ action: "recover" }), children: t("recover") })
    ] }),
    reply.kind === "preview" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewCard, { preview: reply.preview, run, t }, reply.preview.token),
    reply.kind === "done" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "status", children: reply.record ? t("restored") : t("done") }),
    error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: error })
  ] });
}
function CommandCard({ node, run, t }) {
  if (!node.outcome) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", { className: "dsh-tm", role: "status", children: t("working") });
  const reply = readReply(node.outcome.text);
  return reply ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReplyView, { reply, run, t }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", { className: "dsh-tm", role: "alert", children: node.outcome.text || t("failure") });
}
function apply(ctx) {
  ctx.effect(() => ctx.locale.register("timeMachine", { zh, en }));
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-time-machine";
    style.textContent = css;
    document.head.append(style);
    return () => style.remove();
  });
  const actions = (sessionId) => ({ run: async (request) => {
    const result = await ctx.remote.commands.execute(sessionId, `/time_machine ${JSON.stringify(request)}`, []);
    const reply = readReply(commandOutcome(result));
    if (!reply) throw new Error("Invalid Time Machine response.");
    return reply;
  } });
  ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
    name: "conversation.input.dock",
    id: "dsh-time-machine",
    locale: "timeMachine",
    inject: actions
  }, Dock));
  ctx.slots.inject("conversation.chat.commandview", () => ctx.slots.register({
    name: "conversation.chat.commandview",
    key: "time_machine",
    locale: "timeMachine",
    inject: actions
  }, CommandCard));
}
return module.exports;}});
