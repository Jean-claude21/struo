# 031 — Milestone dependencies and dated phases

**Branch**: `031-dependencies` · **Status**: delivered

Before: the Gantt drew an arrow from each milestone to the next one of its site, by date. Nothing was
stored, nothing moved in cascade, a milestone could not wait for another site.

- `milestone_dependency` (migration 0011, RLS per company): a milestone waits for one or more others,
  of its site or of another one, with a minimum gap in days (`lag_days`).
- `setMilestoneDependencies` replaces the list; a loop at any depth (A → B → C → A) or a milestone
  waiting for itself is refused (`dependency_cycle`).
- `moveMilestone` moves a milestone and pushes what waits for it, then what waits for those, so each
  stays after all its predecessors plus their gap. Only later: a milestone already further away keeps
  its date; a reached milestone never moves. The answer lists what moved with former dates.
- `restoreMilestoneDates` is the « undo » of a move (no cascade).
- Phases get a planned window (`start_date`, `end_date`), drawn as bars under their site, red when the
  planned end has passed before 100 %.
- Planning: the milestone drawer shows « waits for » (editable, with the gap) and « blocks » (click to
  open); moving a milestone in the Gantt or the calendar says how many followed and offers undo.
- MCP: `move_milestone`, `set_milestone_dependencies`; `gantt` returns sites, phases and dependencies.

Proof: `packages/core/tests/dependencies.test.ts` (cascade with lag across sites, earlier move pushes
nothing, undo, loops refused, reached milestone locked, other company refused, phase window).
