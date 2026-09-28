Connect 4 (NEUMAI edition) - installable web app

FILES
  index.html            page markup
  css/app.css           styles and the 4 themes
  js/engine.js          NEUMAI search engine (runs in a background worker)
  js/app.js             game logic, NEUMAI feed and personas, pass & play, blitz, review, stats, settings
  js/online.js          online arena (Firebase): presence, challenges, rooms, spectating, quick chat
  sw.js, manifest.webmanifest, icon-*.png   installable app pieces
  firestore.rules, database.rules.json      paste into the Firebase console

FIREBASE SETUP (one time)
  1. Authentication > Get started > Sign-in method > turn on Anonymous.
  2. Authentication > Settings > Authorized domains > add your site address.
  3. Firestore Database > Rules > paste firestore.rules > Publish.
  4. Realtime Database > Rules > paste database.rules.json > Publish.
  5. If your Realtime Database URL is not https://project-3333600848385438143-default-rtdb.firebaseio.com
     put yours in index.html (databaseURL).

HOSTING
  Upload everything except the .rules files and this README to an HTTPS host
  (Netlify Drop, GitHub Pages, Firebase Hosting). Only 5 files: index.html, sw.js, manifest.webmanifest, icon-192.png, icon-512.png.
