// Connect 4 — free notification sender (Cloudflare Workers free plan, no card needed).
//
// The app calls this after it sends a challenge or makes a move. This worker
// checks who is asking (Firebase sign-in), reads the real challenge/game from
// Firestore, writes the notification text itself, and asks Firebase Cloud
// Messaging (free) to deliver it to the other player's phone — even when their
// app is closed.
//
// Setup: paste this file into a new Cloudflare Worker, then add a Secret named
// SERVICE_ACCOUNT containing your Firebase service account JSON (see README).

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwks = { keys: null, exp: 0 };
let oauth = { token: null, exp: 0 };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return reply({ ok: true, service: 'connect4-notify' });
    try {
      if (!env.SERVICE_ACCOUNT) throw new Error('SERVICE_ACCOUNT secret is missing');
      const sa = JSON.parse(env.SERVICE_ACCOUNT);
      const body = await request.json();
      const uid = await verifyIdToken(String(body.idToken || ''), sa.project_id);
      const access = await accessToken(sa);
      const msg = await buildMessage(body, uid, sa.project_id, access);
      if (!msg) return reply({ ok: false, reason: 'nothing to send' });
      const sent = await sendPush(msg.to, msg.data, sa.project_id, access);
      return reply({ ok: sent });
    } catch (e) {
      return reply({ ok: false, error: String((e && e.message) || e) }, 400);
    }
  }
};

// ---------- what to send (text is built here, never taken from the caller) ----------
const clip = s => String(s || '').slice(0, 20);
async function buildMessage(body, uid, pid, access) {
  const kind = body.kind;
  if (kind === 'invite') {
    const id = String(body.inviteId || '');
    if (!/^[A-Za-z0-9]{1,40}$/.test(id)) return null;
    const inv = await getDoc(pid, access, `invites/${id}`);
    if (!inv || inv.from !== uid || inv.status !== 'pending') return null;
    return {
      to: inv.to,
      data: {
        title: `${clip(inv.fromName) || 'Someone'} challenges you!`,
        body: inv.blitz ? `Blitz match, ${inv.blitz} seconds per move. Tap to answer.` : 'Tap to open Connect 4 and answer.',
        tag: 'invite', url: './'
      }
    };
  }
  if (kind === 'move' || kind === 'left') {
    const id = String(body.gameId || '');
    if (!/^[A-Za-z0-9]{1,40}$/.test(id)) return null;
    const g = await getDoc(pid, access, `games/${id}`);
    if (!g || !Array.isArray(g.players) || !g.players.includes(uid)) return null;
    const other = g.players.find(p => p !== uid);
    const name = clip(g.names && g.names[uid]) || 'Your opponent';
    const tag = 'game-' + id;
    const moves = g.moves || [];
    if (kind === 'left') {
      if (g.status !== 'left' || g.leftBy !== uid) return null;
      return { to: other, data: { title: `${name} left the match`, body: 'You win by forfeit.', tag, url: './' } };
    }
    if (!moves.length) return null;
    if (g.status === 'playing' && g.turn === other) {
      return { to: other, data: { title: 'Your move', body: `${name} played column ${Number(moves[moves.length - 1]) + 1}.`, tag, url: './' } };
    }
    if (g.status === 'won' && g.winner === uid) {
      return { to: other, data: { title: `${name} won`, body: 'Four in a row. Tap to see the board or ask for a rematch.', tag, url: './' } };
    }
    if (g.status === 'draw') {
      return { to: other, data: { title: 'Draw', body: `Your match with ${name} ended in a draw.`, tag, url: './' } };
    }
  }
  return null;
}

// ---------- Firebase Cloud Messaging ----------
async function sendPush(to, data, pid, access) {
  if (!/^[A-Za-z0-9]{1,128}$/.test(String(to || ''))) return false;
  const tokDoc = await getDoc(pid, access, `pushTokens/${to}`);
  if (!tokDoc || !tokDoc.token) return false;
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${pid}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token: tokDoc.token, data, webpush: { headers: { Urgency: 'high', TTL: '300' } } } })
  });
  if (res.ok) return true;
  const txt = await res.text();
  if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(txt)) {
    // The phone removed the app or turned notifications off: forget its address.
    await fetch(docUrl(pid, `pushTokens/${to}`), { method: 'DELETE', headers: { Authorization: `Bearer ${access}` } });
  }
  return false;
}

// ---------- Firestore (read with the service account) ----------
const docUrl = (pid, path) => `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/${path}`;
async function getDoc(pid, access, path) {
  const res = await fetch(docUrl(pid, path), { headers: { Authorization: `Bearer ${access}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Firestore read failed: ' + res.status);
  const j = await res.json();
  const out = {};
  for (const [k, v] of Object.entries(j.fields || {})) out[k] = val(v);
  return out;
}
function val(v) {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = val(x); return o; }
  return undefined;
}

// ---------- Google sign-in for the service account ----------
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (oauth.token && oauth.exp - 60 > now) return oauth.token;
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  };
  const unsigned = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claims));
  const key = await crypto.subtle.importKey('pkcs8', pemToBytes(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = unsigned + '.' + b64urlBytes(new Uint8Array(sig));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt
  });
  if (!res.ok) throw new Error('Google sign-in failed: ' + res.status);
  const j = await res.json();
  oauth = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return oauth.token;
}

// ---------- check the player's Firebase sign-in ----------
async function verifyIdToken(token, pid) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('not signed in');
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256') throw new Error('bad token');
  if (payload.aud !== pid || payload.iss !== `https://securetoken.google.com/${pid}`) throw new Error('wrong project');
  if (!payload.sub || payload.exp < now || payload.iat > now + 300) throw new Error('expired sign-in');
  if (!jwks.keys || jwks.exp < Date.now()) {
    const res = await fetch(JWKS_URL);
    const j = await res.json();
    jwks = { keys: j.keys || [], exp: Date.now() + 3600 * 1000 };
  }
  const jwk = jwks.keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('bad signature');
  return payload.sub;
}

// ---------- helpers ----------
function b64url(str) { return b64urlBytes(new TextEncoder().encode(str)); }
function b64urlBytes(bytes) {
  let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function pemToBytes(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
