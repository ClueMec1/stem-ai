Connect Four - installable app with online play

1. FIREBASE SETUP (one time, in console.firebase.google.com)
   a. Authentication > Sign-in method > turn on "Anonymous".
   b. Authentication > Settings > Authorized domains > add the website
      address where you host this app (for example yourname.netlify.app).
   c. Firestore Database > Create database (if not created) > Rules tab >
      paste everything from firestore.rules > Publish.
   d. Realtime Database > Create database (if not created) > Rules tab >
      paste everything from database.rules.json > Publish.
   e. Realtime Database > Data tab: look at the URL at the top.
      If it is NOT https://project-3333600848385438143-default-rtdb.firebaseio.com
      open index.html, search for databaseURL, and paste your URL there.

2. PUT IT ONLINE
   Upload index.html, manifest.webmanifest, sw.js and the two icons to any
   HTTPS host (Netlify Drop, GitHub Pages, Firebase Hosting).
   The .rules files do not need to be uploaded.

3. PLAY
   Open the site, tap "Play friends", type your name, tap "Go online".
   Everyone online shows up in the list. Tap "Invite" next to a name.
