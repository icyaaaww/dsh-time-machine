/** All browser copy is owned by the plugin's typed dictionaries. */
export const zh = {
  title: '改动时光机', open: '查看改动时间线', close: '收起时间线', refresh: '刷新', working: '正在处理…',
  empty: '还没有文件改动。完成一次修改后，记录会出现在这里。',
  preview: '查看差异 / 撤回预览', undo: '确认撤回所选文件', select: '仅预览所选文件',
  conflict: '以下文件已有后续改动，已阻止撤回：', stale: '预览过期或文件状态可能已变化时，请重新预览。',
  scope: '撤回只恢复列出的文件内容；聊天记录保留。数据库、部署和外部操作不在恢复范围内。',
  files: '个文件', skipped: '个不支持的文件未纳入快照', turn: '轮次', name: '检查点名称', save: '保存名称',
  done: '操作完成', restored: '文件已恢复，并已通知 Agent。此次恢复也已保存为可撤回的记录。',
  recover: '恢复中断的撤回操作', prepared: '上次撤回中断，请先恢复', failure: '操作失败',
  diff: '本次改动（撤回将恢复为修改前内容）', all: '全部文件', busy: 'Agent 空闲后可查看和恢复。',
  recovered: '中断的恢复操作已处理。', saved: '检查点名称已保存。',
} satisfies Record<string, string>
export type Key = keyof typeof zh
export const en: Record<Key, string> = {
  title: 'Time Machine', open: 'Open change timeline', close: 'Close timeline', refresh: 'Refresh', working: 'Working…',
  empty: 'No file changes yet. Records appear after a turn changes your files.',
  preview: 'View diff / preview undo', undo: 'Confirm undo of selected files', select: 'Preview selected files only',
  conflict: 'Later edits detected; undo is blocked for:', stale: 'Preview again if this preview expired or files changed.',
  scope: 'Undo restores only the listed files. Chat history is preserved. Databases, deployments and external actions are not restored.',
  files: 'files', skipped: 'unsupported files excluded', turn: 'Turn', name: 'Checkpoint name', save: 'Save name',
  done: 'Done', restored: 'Files restored and the agent informed. This restoration has its own undo checkpoint.',
  recover: 'Recover interrupted undo', prepared: 'An interrupted undo needs recovery', failure: 'Operation failed',
  diff: 'Recorded change (undo restores the before side)', all: 'All files', busy: 'Browse and restore while the agent is idle.',
  recovered: 'Interrupted restoration handled.', saved: 'Checkpoint name saved.',
}
