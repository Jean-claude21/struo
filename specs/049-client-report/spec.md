# 049 — Client report and notifications

**Branch**: `049-client-report` · **Status**: delivered for review

## Why

The landing promised « reports with your logo, ready to send » and nothing was sent to the client.
A task given to someone, or a change order waiting for the client, reached nobody.

## Client report

- Built only from what is recorded: validated progress (overall and by stage), photos of validated
  reports of the period, stages reached and next ones, change orders sent. **Costs, expenses and
  margins are never read.**
- In the company's look: the invoice look (logo, colour, font). Settings › Client report: intro text,
  number of photos, which blocks to show, and the automatic send every Monday morning (local time).
- Site › « Client report »: period, a word for the client, live preview, send, print / PDF, history.
- Sent by e-mail with a button to the report in the client's space (`/portal/<token>/report/<id>`,
  only on a confirmed device); the space lists the reports received.
- The client's link is now kept sealed (`portal_link.token_enc`, encrypted by the application) so
  later messages can carry it. Links made before this spec have none: the e-mail then says to use
  the invitation link, and inviting the client again adds it.

## Notifications (e-mail)

- **Task given** to someone (office, or the task of an incident raised in the field, given to the
  site's manager): title, site, due date, button to the tasks (the field app for a site lead).
- **Change order sent**: the client is told it waits for their answer, with the button to their space.
- **Client report** (above), on demand or weekly.
- Never from a demo company, never to the person acting; a failed e-mail never blocks the gesture.

## Proof

`packages/core/tests/client-report.test.ts`; `pnpm check` green (98 tests); report previewed in the
office and opened by the client on a phone.
