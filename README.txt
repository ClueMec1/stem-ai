Connect 4 (NEUMAI edition) - everything here is free, no card needed.

UPLOAD TO YOUR WEBSITE (side by side, no folders):
  index.html, sw.js, manifest.webmanifest, icon-192.png, icon-512.png

FIREBASE CONSOLE (re-paste both rule files after every update):
  1. Authentication > Sign-in method > Anonymous is ON.
  2. Authentication > Settings > Authorized domains has your site.
  3. Firestore Database > Rules > paste firestore.rules > Publish.
  4. Realtime Database > Rules > paste database.rules.json > Publish.

STORAGE CLEANUP - automatic
  Finished matches and their chat are saved on each player's phone
  (Stats > Recent matches > Review) and erased from Firebase about
  45 seconds after the match ends. Answered challenges, used rooms and
  your online status are deleted too.

NOTIFICATIONS
  Works right away (no setup): alerts while the app is open in the
  background. Turn on Notifications in Settings.

  Alerts while the app is FULLY CLOSED - free setup, about 10 minutes.
  Uses Firebase Cloud Messaging (free on the Spark plan) and a
  Cloudflare Worker (free plan, no card).

  A. Web Push key (Firebase):
     Project settings (gear) > Cloud Messaging > Web Push certificates >
     Generate key pair. Copy the key.
  B. Service account (Firebase):
     Project settings > Service accounts > Generate new private key.
     A .json file downloads. Keep it private: never upload it to your
     website or share it.
  C. Worker (Cloudflare):
     1. Sign up free at dash.cloudflare.com.
     2. Workers & Pages > Create > Create Worker > name it
        connect4-notify > Deploy.
     3. Edit code > delete everything > paste notify-worker.js > Deploy.
     4. Worker > Settings > Variables and Secrets > Add:
        Type: Secret, Name: SERVICE_ACCOUNT,
        Value: open the .json from step B and paste ALL of its text.
        Save / Deploy.
     5. Copy the worker address, like
        https://connect4-notify.yourname.workers.dev
  D. Open index.html in a text editor and replace:
       PASTE_YOUR_WEB_PUSH_KEY_HERE  with the key from step A
       PASTE_YOUR_WORKER_URL_HERE    with the address from step C5
     (keep the quotes). Upload index.html again.
  E. Open the app, go online, turn on Notifications, allow them.

  Android: Chrome, best with the app installed.
  iPhone: add the app to the Home Screen first (iOS 16.4+).

FILES
  notify-worker.js   paste into Cloudflare (step C3), not your website
  firestore.rules, database.rules.json   paste into Firebase (steps 3-4)
