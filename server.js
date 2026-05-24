require('dotenv').config();
const express = require('express');
const admin   = require('firebase-admin');
const twilio  = require('twilio');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Firebase Admin ────────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://ai-1-46a29-default-rtdb.firebaseio.com'
});
const db = admin.database();

async function getData() {
  const snap = await db.ref('hotline').once('value');
  return snap.val() || {};
}

const VoiceResponse = twilio.twiml.VoiceResponse;

function comingSoonTwiml(menuId, msg) {
  const t = new VoiceResponse();
  t.say(msg || 'This option is coming soon.');
  t.redirect(`/api/phone/menu?menuId=${menuId}`);
  return t.toString();
}

// ── Entry point ───────────────────────────────────────────────────────────────
app.post('/api/phone/start', async (req, res) => {
  res.type('text/xml');
  res.send(await buildMenuTwiml('main'));
});

app.get('/api/phone/menu', async (req, res) => {
  res.type('text/xml');
  res.send(await buildMenuTwiml(req.query.menuId || 'main'));
});

async function buildMenuTwiml(menuId) {
  const data  = await getData();
  const menu  = data.menus?.[menuId];
  const t     = new VoiceResponse();
  if (!menu) { t.say('Menu not found.'); t.hangup(); return t.toString(); }

  const g = t.gather({
    numDigits: 2, action: `/api/phone/input?menuId=${menuId}`,
    method: 'POST', timeout: 10, input: 'dtmf speech', speechTimeout: 'auto'
  });
  if (menu.greeting) g.play(menu.greeting);
  else g.say('Welcome. Please press or say a number to continue.');
  t.redirect(`/api/phone/menu?menuId=${menuId}`);
  return t.toString();
}

// ── Handle input ──────────────────────────────────────────────────────────────
app.post('/api/phone/input', async (req, res) => {
  const menuId = req.query.menuId || 'main';
  const digits = (req.body.Digits || '').trim();
  const speech = (req.body.SpeechResult || '').toLowerCase().trim();
  const data   = await getData();
  const t      = new VoiceResponse();
  const cs     = data.settings?.comingSoon || 'This option is coming soon.';

  let key = digits;
  if (!key && speech) {
    if (speech.includes('main menu') || speech.includes('go back')) {
      t.redirect('/api/phone/menu?menuId=main');
      res.type('text/xml'); return res.send(t.toString());
    }
    const m = speech.match(/\b(\d{1,2})\b/);
    if (m) key = m[1];
  }

  if (!key) {
    t.say('I did not catch that. Please try again.');
    t.redirect(`/api/phone/menu?menuId=${menuId}`);
    res.type('text/xml'); return res.send(t.toString());
  }

  const button = data.menus?.[menuId]?.buttons?.[key];
  if (!button) { res.type('text/xml'); return res.send(comingSoonTwiml(menuId, cs)); }

  switch (button.type) {
    case 'recording':
      if (button.recording) {
        const g = t.gather({ input:'dtmf speech', action:`/api/phone/input?menuId=${menuId}`,
          method:'POST', timeout:8, speechTimeout:'auto' });
        g.play(button.recording);
        g.say('Press a number or say main menu to continue.');
        t.redirect(`/api/phone/menu?menuId=${menuId}`);
      } else res.type('text/xml'), res.send(comingSoonTwiml(menuId, cs));
      break;
    case 'submenu':
      if (button.menuId && data.menus?.[button.menuId]) t.redirect(`/api/phone/menu?menuId=${button.menuId}`);
      else res.type('text/xml'), res.send(comingSoonTwiml(menuId, cs));
      break;
    case 'forward':
      if (button.forwardTo) { t.say('Please hold while we connect you.'); t.dial(button.forwardTo); }
      else res.type('text/xml'), res.send(comingSoonTwiml(menuId, cs));
      break;
    case 'transfer':
      if (button.forwardTo) {
        t.say('Please hold while we transfer your call.');
        const dial = t.dial();
        dial.number(button.forwardTo);
      } else res.type('text/xml'), res.send(comingSoonTwiml(menuId, cs));
      break;
    case 'voicemail':
      t.say('Please leave your message after the beep. Press pound when done.');
      t.record({ action:`/api/phone/voicemail-saved?menuId=${menuId}`,
        method:'POST', finishOnKey:'#', maxLength:180, playBeep:true });
      break;
    default:
      res.type('text/xml'); return res.send(comingSoonTwiml(menuId, cs));
  }
  res.type('text/xml');
  res.send(t.toString());
});

// ── Voicemail saved ───────────────────────────────────────────────────────────
app.post('/api/phone/voicemail-saved', async (req, res) => {
  const menuId = req.query.menuId || 'main';
  const id     = Date.now().toString();
  await db.ref(`hotline/voicemails/${id}`).set({
    id, url: req.body.RecordingUrl||'', duration: req.body.RecordingDuration||'0',
    from: req.body.From||'Unknown', date: new Date().toISOString(), heard: false
  });
  const t = new VoiceResponse();
  t.say('Your message has been saved. Thank you.');
  t.redirect(`/api/phone/menu?menuId=${menuId}`);
  res.type('text/xml'); res.send(t.toString());
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Family Hotline running on port ${PORT}`));
