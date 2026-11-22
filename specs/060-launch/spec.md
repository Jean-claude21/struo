# 060 — Launch: the offer landing, the legal pages, the end of a licence

**Branch**: `060-launch` (base `dev`) · **Status**: delivered for review

## The landing (offer method)
- `/` follows the page validated with the founder (mockup « mise en ordre »): who it is for and the
  outcome in the title (« every site under control in 30 days, without evenings on the phone »), the
  pain in three scenes, the visitor's own cost estimate, the day it leads to, the offer stacked as
  deliverables (« your company in order in 30 days », included in Pro: data brought over, method set
  up, team trained, client space, a weekly check-in for 30 days), proof by the demo per role, the
  country's prices then one block that removes the risk, eight objections, one final call-back.
- Main action everywhere: « Get a call back » (`#rappel`, the existing contact request). The demo
  stays the second action. Photos are shown whole (3:2), never cropped. No testimonial until a real
  one is given; no guarantee; WhatsApp sending is not claimed (not configured).
- The highlighted plan shows « … in 30 days, included » on top of its own bullets (edited in the
  console). The plan bullets themselves are the founder's.

## The legal pages
- `/mentions-legales`, `/confidentialite`, `/cookies`, `/conditions`, `/traitement-donnees`, in French
  and English (`i18n/legal.fr.ts`, `legal.en.ts`, same pages and sections: tested). Publisher: Kete,
  independent activity, `contact@kete.digital`. Hosting: Contabo (application server), Neon in
  Frankfurt (database, files). Sub-processors: Neon, Contabo, Resend, Sentry (EU), OpenAI (when the
  AI features are used), Chariow. Umami is self-hosted and cookie-free. Only facts that exist are
  written; linked from every public footer.

## The end of a trial or licence
- Founder settings (`platform_settings`, migration `0034`; Console › Licences, or the platform MCP
  tools `licence_settings` / `set_licence_settings`): warn N days before the end (default 14), then a
  grace period of N days (default 7).
- Stages (`companyAccess`): active → ending (within the window) → grace (ended, everything open) →
  locked. A demo, or a paying plan the platform set without a period, never ends.
- Locked = read-only: `ensure()` refuses every write with `licence_locked`; reading, the books
  (`finance.read`, `cash.read`) and the settings where a licence is entered (`org.manage`) stay
  open. Entering a licence opens the space again at once.
- Warnings: a bar in the office and in the field app (renew button for owners and admins), and
  e-mails to owners and admins at the start of the window, then 7, 3 and 1 days before, once when it
  ends and once when it turns read-only (job `licence-notices`, from 7:00 local time, each notice
  once per period).

## Settings › MCP
- How to connect an assistant lives on the Intelligence page; Settings › MCP keeps the connected
  assistants and, folded, the access keys for scripts (revoked keys are no longer listed; the Claude
  Code command is shown with the real key right after it is created).

## Tests
- `licence.test.ts` (stages, notice steps, read-only and reopening, founder settings, once-only
  notices), `i18n.test.ts` (legal pages parity).
