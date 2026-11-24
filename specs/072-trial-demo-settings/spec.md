# 072 — Sign-in and trial on the landing; trial and demo limit set by the founder

**Branch**: `072-trial-settings` (base `dev`) · **Status**: delivered for review

- Landing: « Sign in » in the header; « Or try it on your own, N days free » under the main action
  and « Try N days free » on Starter and Pro, both to `/signup`, when the trial is offered.
- **Free trial** (`platform_settings.trial_days`, `trial_public`, migration `0038`; Console › Prices,
  MCP `set_trial`): length of the trial given to new companies, and whether the public site offers it.
  Off: no trial link nor « N days free » on the site (a direct link still creates an account with a
  trial). The terms speak of « the length shown when signing up ».
- **Demo limit** (`platform_settings.demo_per_day`, migration `0039`; Console › Prices, MCP
  `set_demo_limit`, `reset_demo_limits`): demos one address may open per day, 0 = no limit; a button
  lifts today's counts. The cap of 150 copies open at once stays (database protection).
