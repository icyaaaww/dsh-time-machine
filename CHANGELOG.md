# Changelog

## 0.1.0 — 2026-10-09

First public preview for DSH 0.2.1-alpha.1.

- Persistent turn checkpoints for local Git workspaces.
- Chinese/English timeline, diff preview, labels and selected-file undo.
- Conflict checks, restoration checkpoints and interrupted-restore recovery.
- Durable Agent notice after human restoration.
- Official bundle, Cordis lifecycle, client slots and command protocol integration.
- Windows validation: typecheck, build, 10 tests and real DSH Web restore flow.

Known scope: bounded UTF-8 regular files; no binary or external-system rollback. Multi-file restoration is journaled but not atomic. Other DSH versions and operating systems have not been accepted yet.
