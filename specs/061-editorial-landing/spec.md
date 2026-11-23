# 061 — The « editorial cockpit » landing

**Branch**: `061-editorial-landing` (base `dev`) · **Status**: delivered for review

- `/` is the founder's mockup `struo-landing-editorial-cockpit` as is: same sections (hero with the
  interactive cockpit, ticker, the problem, the cost, the day, the setup, the proof by role, prices,
  the call-back), same words, same photos (converted to WebP in `public/landing/ed/`), same look
  (Manrope, Newsreader, DM Mono, served locally with fontsource; CSS scoped under `.ed`, classes
  prefixed `ed-`, so nothing leaks into the app).
- Made real: the cockpit pins switch the site; the estimate uses the visitor's currency; prices come
  from the visitor's country (« on quote » when none is published, as in the mockup); each role opens
  its own demo; the call-back form sends a contact request; the footer adds the legal pages, sign-in
  and the language switch. All words are in the FR and EN catalogs.
