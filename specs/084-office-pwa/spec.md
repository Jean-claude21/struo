# 084 — The office installs like an app

**Branch**: `084-office-pwa` (base `dev`) · **Status**: delivered for review

- `/api/app/manifest`: the office's install file, in the person's language (language cookie, then the
  browser's): « Struo », opens on `/app`, scope `/app`, standalone window, shortcuts Today and Sites.
  The office layout declares it, with the Apple « home screen » metas.
- The account menu shows « Installer Struo sur cet appareil » when the browser offers installation
  (Chrome, Edge, Android); on iPhone, Safari's « Add to Home Screen » uses the same file.
- The office still needs the network: the service worker (`sw.js`, v3) never keeps office pages or
  data. Without network, an office page shows `offline.html` (static, FR/EN): why, « Try again »,
  reload by itself when the network is back, and a link to the field app, which works offline.
- The field app's install file gets an explicit `id` (`/field`, same as before) so both apps stay
  distinct when installed on one device.
