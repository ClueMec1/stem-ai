// Sends real phone notifications, even when the Connect 4 app is closed.
// Deploy with:  firebase deploy --only functions   (see README)
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

async function push(uid, data) {
  const ref = getFirestore().doc(`pushTokens/${uid}`);
  const snap = await ref.get();
  const token = snap.exists ? snap.get('token') : null;
  if (!token) return;
  try {
    await getMessaging().send({
      token,
      data, // data-only: the app's service worker draws the notification
      webpush: { headers: { Urgency: 'high', TTL: '300' } }
    });
  } catch (e) {
    // The phone uninstalled the app or turned notifications off: forget the token.
    if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'].includes(e.code)) {
      await ref.delete().catch(() => {});
    }
  }
}

// Someone challenged you.
exports.notifyChallenge = onDocumentCreated('invites/{id}', async event => {
  const d = event.data && event.data.data();
  if (!d || d.status !== 'pending' || !d.to) return;
  await push(d.to, {
    title: `${String(d.fromName || 'Someone').slice(0, 20)} challenges you!`,
    body: d.blitz ? `Blitz match, ${d.blitz} seconds per move. Tap to answer.` : 'Tap to open Connect 4 and answer.',
    tag: 'invite',
    url: './'
  });
});

// Your opponent moved, or the match ended.
exports.notifyTurn = onDocumentUpdated('games/{id}', async event => {
  const before = event.data.before.data(), after = event.data.after.data();
  if (!before || !after) return;
  const moved = (after.moves || []).length > (before.moves || []).length;
  const mover = before.turn;
  const other = (after.players || []).find(p => p !== mover);
  if (!other) return;
  const name = String((after.names && after.names[mover]) || 'Your opponent').slice(0, 20);
  const tag = 'game-' + event.params.id;
  if (moved && after.status === 'playing') {
    await push(other, { title: 'Your move', body: `${name} played column ${after.moves[after.moves.length - 1] + 1}.`, tag, url: './' });
  } else if (moved && after.status === 'won') {
    await push(other, { title: `${name} won`, body: 'Four in a row. Tap to see the board or ask for a rematch.', tag, url: './' });
  } else if (moved && after.status === 'draw') {
    await push(other, { title: 'Draw', body: `Your match with ${name} ended in a draw.`, tag, url: './' });
  } else if (after.status === 'left' && before.status === 'playing') {
    const leaver = after.leftBy;
    const stayer = (after.players || []).find(p => p !== leaver);
    const lname = String((after.names && after.names[leaver]) || 'Your opponent').slice(0, 20);
    if (stayer) await push(stayer, { title: `${lname} left the match`, body: 'You win by forfeit.', tag, url: './' });
  }
});
