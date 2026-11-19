# 022 — Client journey

**Branch**: `020-design-system` · **Status**: delivered

## What it delivers

- Site page, « Client » tab: who the client is, whether they were invited and opened their space, their last visit; invitation by WhatsApp (the message opens ready on the sender's phone), e-mail or link; what the client sees (progress and photos, planning, invoices, documents, messages; expenses and margins never). A new invitation revokes the previous link. No SMS.
- Client space `/portal/:token`, phone first: access confirmed once per device by a 6-digit code sent by e-mail (hash only, 15 minutes, 5 tries, 5 codes per quarter hour); the device keeps an httpOnly cookie. Then: progress as steps, photo stories, field reports in plain words, milestones validated by a finger signature with an optional reserve, payments, messages.
- Security: the portal goes through security-definer SQL functions (`struo_portal_access`, `struo_portal_issue_code`, `struo_portal_verify_code`, `struo_portal_sign_milestone`, `struo_portal_reports`); files and signatures only for a confirmed device; what a link shows is enforced on the server.

## Acceptance and proof

- Code flow (wrong code, single use, device remembered), visibility flags, signature once with reserve, unknown link refused (`journeys.test.ts`).
- Browser: invitation, gate, code from the mail log, client space, signature recorded; the manager's « Today » shows the client's activity.
