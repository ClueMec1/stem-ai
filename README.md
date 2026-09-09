# Family Board

A family-only PWA: chat, calendar, and a media/link board. Every page
is **fully self-contained** — its own HTML, its own `<style>`, its own
`<script>`, its own Firebase setup, all in one file. Editing one
page's look or behavior never touches any other file.

## File map

```
index.html       hub / corkboard linking to each mode
passcode.html     family question gate (first thing anyone sees)
join.html         name + phone form, then "waiting for approval"
host.html         host-only: approve/reject joins, remove members
chat.html         family chat (Firestore: chat_messages)
calendar.html     shared events (Firestore: calendar_events)
links.html        host-curated media board (Firestore: media_links)
manifest.json    PWA metadata (name, icons, colors) — shared on purpose, it's not "design," it's app identity
sw.js            minimal service worker — caches the app shell only, never the live data
icons/           put icon-192.png and icon-512.png here
```

There is **no shared CSS or JS file**. Each page repeats its own
`<style>` block and its own Firebase config/auth check. That's
intentional: change `chat.html`'s color or layout and nothing else is
at risk of breaking.

**Adding a new mode later** (e.g. `photos.html` or `notes.html`): copy
`calendar.html` whole, change the Firestore collection name and the
visible text/labels, add a card to `index.html`'s `.board`, and add
the filename to `SHELL_FILES` in `sw.js`. Nothing else needs to change.

**The cost of this approach:** if you ever want every page's color
palette to change at once, you'll edit that `<style>` block in five
files instead of one `style.css`. That's the trade you're choosing —
isolation over single-point-of-change.

## Firebase setup for the sign-in system

There's no email/password anymore. Sign-in works like this:
1. **`passcode.html`** asks a family question (edit `FAMILY_QUESTION` and
   `FAMILY_ANSWER` right in that file).
2. **`join.html`** asks for name + phone number, then shows a "waiting
   for approval" screen that updates live.
3. **`host.html`** is where the host approves/rejects people waiting,
   and can remove anyone already in.

### One-time setup
- **Firestore Database → Create database** → production mode.
- **Firestore → Rules** → paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
- You do **not** need to enable Email/Password anymore — this app now
  uses **Anonymous** sign-in behind the scenes (Authentication →
  Sign-in method → enable **Anonymous**). This just gives each device
  a way to talk to Firestore; it has nothing to do with who the person
  says they are — that's tracked separately in the `members` collection.
- **Set the host phone number**: open `join.html` and change the
  `HOST_PHONE` constant near the top of the `<script>` block to your
  own phone number (digits only or with dashes — either works, it gets
  normalized). Whoever registers with that number becomes host
  automatically, no approval needed.

### Good to know: this is trust-based, not lockdown-secure
The rule above lets *any* signed-in device read and write anything —
approval, host status, and who-can-delete-what are enforced by the
app's own screens, not by the database. That's the right trade-off for
a real family who has the passcode: nobody sees the app without
answering the question first. But someone who opened their browser's
developer console could, in principle, edit their own record directly
in Firestore and grant themselves host status. If that's a real
concern for your family, it's possible to write stricter Firestore
rules that check roles server-side — worth doing later if you want it,
just not included here to keep things simple for now.

### How identity works
Each person is a document in Firestore's `members` collection, keyed
by their phone number (digits only) — `{ name, phone, status,
isHost, createdAt }`. `status` is `pending`, `approved`, or `kicked`.
The browser remembers `myMemberId` in `localStorage` so you don't have
to re-register every visit. "Switch user" just clears that — it
doesn't delete your record, so you (or someone else) can sign back in
with the same phone number later and pick up where you left off.

### Add real app icons
Drop a 192×192 and a 512×512 PNG into `icons/` named `icon-192.png`
and `icon-512.png` (any square logo/photo works) so the "Add to Home
Screen" prompt looks right instead of using a broken icon.

## Deploying to GitHub Pages

1. Create a new GitHub repo, push this whole folder to it.
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** →
   branch `main`, folder `/ (root)`. Save.
3. GitHub gives you a URL like `https://yourname.github.io/repo-name/`.
   Open it — you'll land on the family passcode question, then get
   asked for your name and phone number.
4. On a phone, open that URL in the browser and use **"Add to Home
   Screen"** — it installs like an app using `manifest.json`.

## Notes on the two Firebase projects you set up

Every page currently points at `fam-pwa` (your primary project).
Your `fam-pwa-2` config is your backup — if you ever need to switch,
you'll need to replace the `firebaseConfig` object in each page's
`<script>` block (this is the one real downside of not sharing that
config in one file). Keep in mind: the two projects have **separate
Firestore databases**, so switching projects means switching to an
empty chat/calendar unless you export and re-import the data.
