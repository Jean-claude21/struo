# Struo design system

The tokens live at the top of `apps/web/src/styles.css`; every screen (public site, office, field
app, client space, console, e-mails) uses them. This page explains the choices.

## Idea: paper and site ink

A warm off-white page like a site notebook, a green-black ink, and one accent: terracotta, the colour
of laterite and fired brick. Validated work is a muted site green. Nothing shouts; what needs
attention is marked by a status, never by decoration.

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f8f7f1` paper | `#121612` | page |
| `--surface` | `#ffffff` | `#191e19` | cards and sheets on the page |
| `--surface-2` | `#eeefe7` | `#212721` | bands, panels, sunken areas |
| `--line` | `#d7d9d0` | `#2b332b` | hairlines |
| `--ink` | `#202820` | `#eceee6` | text, dark buttons |
| `--ink-soft` | `#515c52` | `#a2aa9d` | secondary text |
| `--brand` | `#b9461e` terracotta | `#e0693d` | the one accent: main action, emphasis |
| `--ok` | `#3d704e` | `#7fb58c` | validated, paid, on track |
| `--warn` / `--bad` / `--info` | ochre / brick red / slate blue | lighter | statuses |

The logo mark is a rounded square `#d94d20` with a white hard hat. Charts and avatars use an earthy
categorical range (terracotta, slate blue, site green, plum, rose, teal, ochre, grey).

## Type

- **DM Sans** (self-hosted, works offline in the field app) for everything. Titles are heavy and
  tight (`--track-title`; the landing goes to −0.065em).
- **DM Mono** for labels, eyebrows, table headers, times, codes and KPI labels: uppercase, spaced.
- An **eyebrow** (`.eyebrow`) is a short orange line followed by a mono uppercase label.

## Shape

- Radius 6 px for controls, 10–12 px for cards and panels, 4 px for tags.
- Hairline borders first; a soft shadow only for what floats (menus, a report card over a photo).
- **Never an accent bar on the top (or side) edge of a card**: a highlighted card is marked by a label
  and a filled button, not by a coloured border.
- Buttons: filled terracotta for the main action, ink for the secondary strong action, outlined or
  underlined text for the rest.

## Dark mode

Redrawn, not inverted: green-black surfaces, the accent lightened, statuses softened for reading in
the evening. It follows the system setting unless the person chooses a theme.
