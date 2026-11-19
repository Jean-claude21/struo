# 020 — Design system and shell

**Branch**: `020-design-system` · **Status**: delivered

## What it delivers

- Tokens in `apps/web/src/styles.css`: surfaces, four text levels, status colors with soft variants, radius, spacing, control heights, motion; a dark theme redefined (not inverted), chosen per device (light, dark, system) without a flash at load.
- Kit `apps/web/src/components/kit.tsx`: page header, panels, KPI tiles, status shown by a shape and a word (never color alone), progress, avatars, modals and drawers that keep the keyboard inside and give focus back, popover menus with arrow keys, toasts with « Undo », skeletons, empty states. SVG charts without a library (`charts.tsx`).
- Office shell: icon sidebar, company switcher for people in several companies, Ctrl K command palette (company search and commands), « Create » menu, theme and language menu, bottom navigation on phones.
- `/app/system`: every token and component live, and the empty, loading and error states.

## Acceptance and proof

- Pages checked in the browser in light theme, desktop and phone widths; i18n parity test.
