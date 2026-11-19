# 021 — View engine: table, board, timeline, calendar, files

**Branch**: `020-design-system` · **Status**: delivered

Inspired by the ideas (not the code, which has no licence) of a task-management prototype: one view state per view key (search, filters « is / is not », sort, group, visible columns and widths, collapsed groups, saved views), shown by several renderers.

## What it delivers

- Data table: resizable columns (pointer events, remembered), sticky header and first column, sort by header, collapsible groups with counts, multi-select with a bulk bar, card list on phones.
- Board: dnd-kit, mouse, long press and keyboard; collapsible columns that still accept cards; a move the domain refuses is put back with the reason.
- Gantt: weeks or months, two-level header, weekends, « today » line it opens on, progress inside bars, milestones, dependency curves (dashed red when the order is broken); bars move and resize, milestones move, snapped to the day, with « Undo ».
- Calendar: month and week, « +N more », drag an item to another day.
- File explorer: every file of the company (report photos, voice notes, documents, invoices) as a grid or a list, filtered by type and site, each linked to its origin.
- Used by Finances (invoices table and board: the status follows the payments; dropping on « Paid » opens the payment form), Sites (grid, table, board by status), Planning, Documents.

## Acceptance and proof

- Board refusal and Gantt milestone move (with undo) checked in the browser; core `fileLibrary` and `searchCompany` stay inside the company (`journeys.test.ts`).
