# Installable offline app (Android)

The website can now be installed on an Android phone like an app. It works without internet, asks before updating your notes, and only downloads PDFs/files when you ask.

## Install it (on the phone)
1. Open the site in **Chrome** on Android (it must be the deployed `https://` address).
2. Use the **Install UNINotes** card at the bottom of the page, or Chrome menu **⋮ → Install app / Add to Home screen**.
3. Open it from the home screen **once with internet**. That first run saves your notes and app pages on the phone.

## How it behaves
| | Browser tab | Installed app |
|---|---|---|
| Notes | Always live | Shown from the copy saved on the phone |
| New notes on the server | Appear immediately | **You are asked: Update now / Later** |
| No internet | Pages you visited still open | Everything you saved opens |
| PDFs / files | Download as before | **Save offline** button on each file; nothing downloads by itself |

- The app checks for new notes when it opens, when it comes back to the screen, and when the phone gets internet again. If notes changed you see **"Notes update available: 2 new notes, 1 updated note"** with **Update now** and **Later**. Choosing Later hides it until the notes change again or you reopen the app.
- **Update alerts:** in the installed app, tap **Turn on** on the "Get notified about new notes" card. Android can then show a notification with **Update now / Later** buttons when it checks in the background.
- A notice at the bottom says "Offline · showing notes saved <date>" when there is no connection.
- Saved files show **Saved offline ✓** (tap ✕ to remove). Offline, files that were not saved say **Needs internet**.
- If you sign in as administrator inside the app you always see live notes and drafts. Drafts are never saved on the phone.

## What to know (honest limits)
- **Wi-Fi alerts are best effort.** A website cannot be woken the moment Wi-Fi connects. The notification is sent from Chrome's occasional background check, which Android only runs for installed apps you use regularly, roughly every 12 hours or less often, and only if notifications are allowed. The reliable moments are when you open the app or when it regains internet while open. A native Android app could react faster.
- Saving a file on **mobile data** asks for confirmation first.
- Max file size is still 4 MB. Pages for notes are saved after the first online run; a note that was added later is saved when you tap **Update now**.
- Notes containing math may show without their special fonts offline until a math note has been opened once online.
- iPhone: installing works (Share → Add to Home Screen) and offline reading works, but background alerts are not available.

## Developer notes
- `public/sw.js` is the service worker (plain JS). Cache names must match `lib/offline.ts`. It is registered in production only.
- Saved notes live in the browser Cache API (`rz-meta`), files in `rz-files`. The worker never changes saved notes by itself.
- Regenerate icons with `python3 scripts/make-icons.py`.
- No database changes and no new environment variables.
