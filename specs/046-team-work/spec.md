# 046 — Tasks, internal thread, document versions

**Branch**: `045-landing-clarity` (same delivery) · **Status**: delivered for review

## Why

The landing says « the right actions for the right people » and « find the proof in seconds »: a
site needs tasks given to someone with a due date, the team's own notes, and the history of its files.

## What

- **Tasks** (`project_task`): title, site, person, due date, priority (low, normal, urgent), status
  (to do, in progress, done). Owner, admin and engineer create, edit and delete; the person a task is
  given to moves it forward (status only). Late when the due date is past and it is not done.
  Office page `/app/tasks` (all sites; filters open, mine, done) and tab « Tâches et fil interne » on
  each site. Screen `tasks` in `SCREENS` (owner, admin, engineer).
- **Internal thread** (`project_note`): any member writes on a site; newest first; never shown in the
  client portal (the client messages stay in « Messages »).
- **Document versions** (`document_version`): when a file replaces another on a document, the
  previous file is kept with who replaced it and when; « Versions » lists them, each downloadable
  (`/api/files/document/<id>?version=<versionId>`).
- Every table carries `org_id` with its row-level security policy (migration 0020); every write is
  journaled.
- The demo company gets ten tasks and five internal notes.

## Proof

`packages/core/tests/work.test.ts`: assignment and status rights, outsider refused, companies apart,
thread order and isolation, versions kept and served only inside the company.
