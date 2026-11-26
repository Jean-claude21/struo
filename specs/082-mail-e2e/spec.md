# 082 — Real e-mails in the end-to-end simulation

**Branch**: `082-mail-e2e` (base `dev`) · **Status**: delivered for review

`e2e/mail.spec.ts` reads the messages staging really sends, in a testmail.app inbox
(`<namespace>.<tag>@inbox.testmail.app`, one tag per run), and follows their links like the person:

1. the owner of the test company invites an accountant by e-mail → « Invitation à rejoindre … »;
2. the guest opens the link, creates an account and joins → « Confirmez votre adresse e-mail », whose
   link confirms the address;
3. forgotten password → « Réinitialiser votre mot de passe », new password set → « Votre mot de passe
   Struo a été modifié », then signing in with the new password works;
4. the guest is removed from the test company (its seats stay free).

Runs once (desktop project), skipped without `TESTMAIL_API_KEY` / `TESTMAIL_NAMESPACE` (GitHub
secrets of the e2e workflow). Each wait is bounded (3 minutes per message). The workflow gains an
`only` input to run one spec on demand (`gh workflow run e2e --ref <branch> -f only=mail.spec.ts`).
Not covered: licence reminders (sent by the daily job, not by a click).
