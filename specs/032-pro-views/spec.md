# 032 — Professional views (every behaviour of the reference prototype)

**Branch**: `032-pro-views` · **Status**: delivered

The view components were rewritten from the structure of the reference task manager (its legacy
prototype holds the full behaviour), not from its look. What was missing is now in:

| Component | Added |
|---|---|
| Shared | `ContextMenu` (right click or « … », keyboard, stays in the window); keyboard shortcuts: `?` help, `G` then a letter to go to a page, `N` to create on the page, `/` and `Ctrl K` search |
| Toolbar | « + filter » in the chips bar, reset columns (widths and hidden), rename a saved view |
| Table | cells edited in place (`Column.edit` opens a picker on the cell), rename by double click on the first cell, menu per row, « + » in a group header adds into that group, Escape clears the selection, empty state that offers to clear the filters |
| Kanban | column menu (add, collapse, actions on all its cards), card menu (right click or « … » on hover), quick composer at the bottom of a column (Enter adds and stays open, Escape closes) |
| Calendar | layers per source with checks (« only this one » by double click), « + » on a day, item menu, done items struck through |
| Gantt | layers, sites folded into one summary row with their milestones (expand one or all), month view by default for the portfolio, opens on today, phases as thin bars, menus on bars and milestones |
| Files | drop files on the explorer to upload, sort by date, name, type or size, file menu (preview, open origin, download, copy link) |

Pages using them: planning (layers per site on Gantt and calendar, add a milestone on a day, menus),
finance (invoice menu on rows and cards, export of a Kanban column), every list with saved views.

Not taken, on purpose: subtasks, recurrence and @mentions belong to a task manager; Struo has no
tasks (its work items are reports, incidents, milestones and invoices). Manual ordering inside a
column is not kept either: invoices and incidents are ordered by date and severity.
