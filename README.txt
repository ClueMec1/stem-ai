Connect 4 (NEUMAI edition)

UPLOAD TO YOUR WEBSITE (side by side, no folders):
  index.html, sw.js, manifest.webmanifest, icon-192.png, icon-512.png

FIREBASE CONSOLE (after every update, re-paste both rule files):
  1. Authentication > Sign-in method > Anonymous is ON.
  2. Authentication > Settings > Authorized domains has your site.
  3. Firestore Database > Rules > paste firestore.rules > Publish.
  4. Realtime Database > Rules > paste database.rules.json > Publish.

STORAGE CLEANUP (automatic, nothing to set up)
  - Finished matches and their chat are saved on each player's phone
    (Stats > Recent matches > Review), then erased from Firebase
    about 45 seconds after the match ends.
  - Answered challenges, joined or closed rooms, and your online status
    are deleted as soon as they are no longer needed.
  - Every time you go online, the app also deletes anything of yours
    left behind (for example a match where both players closed the app).

NOTIFICATIONS
  Works right away: challenges and "your move" alerts while the app is
  open in the background (switched away, screen off for a short while).

  For alerts while the app is FULLY CLOSED you need two extra steps.
  This is how every web app does it: a small Firebase program sends the
  alert to the phone, and the phone shows it even if the app is closed.

  5. Web Push key:
     Firebase console > Project settings (gear) > Cloud Messaging >
     Web Push certificates > Generate key pair. Copy the long key.
     Open index.html, search for PASTE_YOUR_WEB_PUSH_KEY_HERE and replace
     it with your key (keep the quotes). Upload index.html again.

  6. Notification program (needs a computer, one time):
     a. Firebase console > Upgrade > Blaze plan. It needs a card, but a
        game like this stays inside the free monthly allowance. Set a
        budget alert (for example $1) so you are warned about any cost.
     b. Install Node.js from nodejs.org.
     c. Open a terminal in this folder and run:
          npm install -g firebase-tools
          firebase login
          cd functions && npm install && cd ..
          firebase deploy --only functions
     Done. Turn on Notifications in the app (Settings, or the button in
     Online Arena) and allow them when the phone asks.

  Android: works in Chrome, best when the app is installed.
  iPhone: only after adding the app to the Home Screen (iOS 16.4+),
  then turn notifications on from the installed app.

OTHER FILES
  functions/        the notification program (step 6)
  firebase.json, .firebaserc   settings for the firebase command
  firestore.rules, database.rules.json   paste into the console (steps 3-4)
