# 040 — Account e-mails: forgotten password, verification, address change, invitations

**Branch**: `040-account-emails` · **Status**: delivered

## What a person can do

| Need | Where | What happens |
|---|---|---|
| Forgotten password | « Mot de passe oublié ? » on the sign-in page → `/forgot-password` | A link valid **one hour**, usable once, is e-mailed. The page answers the same whether or not the address has an account (nobody can probe who is a customer). |
| Choose the new password | `/reset-password?token=…` (from the e-mail) | 10 to 128 characters, typed twice. **Every session is closed**, and a « your password was changed » e-mail is sent with a « this was not me » link. An expired or used link explains itself and offers a new one. |
| Confirm the address | Welcome e-mail at sign-up (link valid **24 h**) | Lands on My account with « address confirmed ». Not confirming does not block work: a banner reminds the person, with « send the link again ». |
| My account | `/app/account` (user menu, and the field app) | Name; address with its verified state; change of address; change of password (current one required, other devices signed out); « sign out my other devices ». |
| Change the address | My account | Verified address: the **old** address must confirm first, then the new one is verified. Unverified address: replaced directly and the new one is verified. |
| Join a company | Invitation from Team, Settings, the assistant or MCP | Says who invites, to which company, with which role, valid 7 days, for which address. |

## E-mails

One layout (`apps/web/src/server/mail.server.ts`), HTML and plain text, in the language of the
person (language cookie, then the browser): welcome and verification, reset, password changed,
address change, invitation. Each says why it was sent and what to do if it was not expected. Sent
by Resend from the verified domain; a failed send is logged and never blocks the account action.
Without a Resend key (development), the text is written to the log so links can be followed.

## Protection

Rate limits: 3 reset requests and 3 verification e-mails per 5 minutes, 5 password changes per
minute, 3 address changes per 5 minutes (production). Precise error messages: wrong current
password, address already used (with the way to the forgotten password), expired link, too many
attempts, no network.

## Proof

- `apps/web/src/server/mail.test.ts` (3): escaping and text version, invitation in both languages,
  language of the request.
- End-to-end on a local server (23 checks): sign-up → verification mail → link → verified;
  duplicate sign-up refused; wrong current password refused; password changed; reset requested
  (and the same answer for an unknown address); link → page → new password; link refused the
  second time; old session closed; « changed » mail; sign-in with the new password; address change
  confirmation sent to the old address; pages render.
