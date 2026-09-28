/* Connect Four X — online arena (Firebase): presence, challenges, rooms, spectating, chat. */
(() => {
  'use strict';
  const C4 = window.C4;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyByDZXSnvDcEWigjDXcUxsAwWfkfB-hXmo',
    authDomain: 'project-3333600848385438143.firebaseapp.com',
    // If your Realtime Database is not in the US, paste its URL from the Firebase console here.
    databaseURL: 'https://project-3333600848385438143-default-rtdb.firebaseio.com',
    projectId: 'project-3333600848385438143',
    storageBucket: 'project-3333600848385438143.firebasestorage.app',
    messagingSenderId: '492552413084',
    appId: '1:492552413084:web:95453150b6f5f5972f3259',
    measurementId: 'G-WK74MMJ5XZ'
  };
  const FB_VER = '10.12.2';
  const hosted = !!document.querySelector('link[rel="manifest"]');
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), ms))]);

  let auth = null, rdb = null, fs = null, me = null, statusRef = null, started = false, wentOffline = false;
  let myName = ''; try { myName = localStorage.getItem('c4g-name') || ''; } catch (e) {}
  let people = {}, peopleQ = null, invitesUnsub = null;
  let sent = null, incoming = null; const seen = new Set();
  let room = null; // { code, unsub }
  let OG = null;   // current online game { id, ref, spectator, myPiece, opp, oppName, unsub, chatUnsub, watchRef, ... }
  let idle = false, idleTimer = null, oppGoneTimer = null;
  const ts = () => firebase.firestore.FieldValue.serverTimestamp();

  // ---------- firebase loading ----------
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej({ code: 'network' }); document.head.appendChild(s); });
  async function loadFirebase() {
    if (window.firebase && firebase.firestore && firebase.database && firebase.auth) return;
    let last = null;
    for (const base of [`https://www.gstatic.com/firebasejs/${FB_VER}/`, `https://cdn.jsdelivr.net/npm/firebase@${FB_VER}/`]) {
      try {
        if (!window.firebase) await loadScript(base + 'firebase-app-compat.js');
        await Promise.all(['auth', 'database', 'firestore'].map(n => loadScript(base + `firebase-${n}-compat.js`)));
        return;
      } catch (e) { last = e; }
    }
    throw last;
  }
  function explain(e) {
    const c = String((e && (e.code || '')) + ' ' + ((e && e.message) || ''));
    let t = 'Could not go online.';
    if (/configuration-not-found/.test(c)) t = 'Sign-in is not set up yet. In Firebase, open Authentication, tap Get started, then turn on Anonymous.';
    else if (/operation-not-allowed|admin-restricted/.test(c)) t = 'Anonymous sign-in is turned off. In Firebase, open Authentication > Sign-in method and turn on Anonymous.';
    else if (/unauthorized-domain|referer/i.test(c)) t = 'This website is not allowed yet. Add it in Firebase under Authentication > Settings > Authorized domains.';
    else if (/api-key/i.test(c)) t = 'Firebase says the API key is not valid. Check apiKey in js/online.js.';
    else if (/database url|firebaseio|firebasedatabase|different region|Cannot parse/i.test(c)) t = 'The Realtime Database address is wrong. Copy the URL from Realtime Database > Data into databaseURL in js/online.js.';
    else if (/permission/i.test(c)) t = 'Firebase blocked the request. Check that both sets of rules are published.';
    else if (/timeout/.test(c)) t = 'The server did not answer. Make sure the Realtime Database exists and its URL in js/online.js is right.';
    else if (/network/i.test(c)) t = 'Could not reach the server. Check your internet and try again.';
    const detail = c.trim().slice(0, 160);
    return detail ? `${t} (Details: ${detail})` : t;
  }
  const msg = t => { $('#signin-msg').textContent = t; };

  // ---------- presence ----------
  function myState() { return OG && !OG.spectator && OG.live ? 'match' : idle ? 'idle' : 'lobby'; }
  function presence(online) {
    return { name: myName, online, state: myState(), gameId: OG && !OG.spectator && OG.live ? OG.id : null, lastSeen: firebase.database.ServerValue.TIMESTAMP };
  }
  function pushPresence() { if (statusRef && started) statusRef.update({ state: myState(), gameId: OG && !OG.spectator && OG.live ? OG.id : null }).catch(() => {}); renderMe(); }
  function onConn(snap) {
    if (snap.val() !== true || !statusRef || wentOffline) return;
    statusRef.onDisconnect().update({ online: false, state: 'lobby', gameId: null, lastSeen: firebase.database.ServerValue.TIMESTAMP })
      .then(() => statusRef.set(presence(true))).catch(() => {});
  }
  function bumpIdle() {
    clearTimeout(idleTimer);
    if (idle) { idle = false; pushPresence(); }
    idleTimer = setTimeout(() => { idle = true; pushPresence(); }, 120000);
  }
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (started) bumpIdle(); }, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (!started) return; if (document.hidden) { idle = true; pushPresence(); } else bumpIdle(); });

  // ---------- lobby rendering ----------
  function open() {
    if (!hosted) { $('#lobby-na').hidden = false; $('#signin').hidden = true; $('#online-home').hidden = true; $('#rooms').hidden = true; return; }
    $('#lobby-na').hidden = true;
    renderBlitzSeg();
    if (started) { showHome(); return; }
    showSignin();
    if (myName && !wentOffline) goOnline(myName);
  }
  function showSignin() {
    $('#signin').hidden = false; $('#online-home').hidden = true; $('#rooms').hidden = true;
    $('#name-input').value = myName;
    $('#go-online').textContent = started ? 'Save name' : 'Go online';
  }
  function showHome() {
    $('#signin').hidden = true; $('#online-home').hidden = false; $('#rooms').hidden = false;
    renderMe(); renderPeople(); renderRoom();
  }
  function renderMe() {
    const n = $('#my-name'); if (n) n.textContent = myName;
    const pill = $('#my-pill'); if (!pill) return;
    const st = myState();
    pill.className = 'pill ' + (st === 'match' ? 'match' : st === 'idle' ? 'idle' : '');
    pill.lastChild.textContent = st === 'match' ? 'In match' : st === 'idle' ? 'Idle' : 'In lobby';
  }
  function renderBlitzSeg() {
    const box = $('#oblitz'); box.textContent = '';
    [[0, 'Off'], [10, '10 s'], [5, '5 s']].forEach(([v, t]) => {
      const b = el('button', '', t); b.type = 'button'; b.setAttribute('aria-pressed', C4.prefs.oblitz === v);
      b.onclick = () => { C4.prefs.oblitz = v; C4.savePrefs(); renderBlitzSeg(); C4.Snd.tap(); };
      box.appendChild(b);
    });
  }
  function renderPeople() {
    const ul = $('#people'); if (!ul) return;
    ul.textContent = '';
    const ids = Object.keys(people).sort((a, b) => people[a].name.localeCompare(people[b].name));
    if (!ids.length) { const li = el('li', 'empty-note', 'Nobody else is online right now. Share a room code with a friend.'); li.style.display = 'block'; ul.appendChild(li); return; }
    for (const id of ids) {
      const p = people[id];
      const li = el('li');
      const av = el('span', 'avatar', (p.name.trim()[0] || '?').toUpperCase());
      const who = el('div', 'who');
      who.appendChild(el('b', '', p.name));
      const pill = el('span', 'pill ' + (p.state === 'match' ? 'match' : p.state === 'idle' ? 'idle' : ''));
      pill.append(el('i'), document.createTextNode(sent && sent.to === id ? 'Challenge sent…' : p.state === 'match' ? 'In match' : p.state === 'idle' ? 'Idle' : 'In lobby'));
      who.appendChild(pill);
      const acts = el('div', 'acts');
      if (sent && sent.to === id) {
        const b = el('button', 'btn', 'Cancel'); b.type = 'button'; b.onclick = () => cancelInvite(false); acts.appendChild(b);
      } else if (p.state === 'match' && p.gameId) {
        const b = el('button', 'btn', 'Watch'); b.type = 'button'; b.onclick = () => watch(p.gameId); acts.appendChild(b);
      } else {
        const b = el('button', 'btn primary', 'Challenge'); b.type = 'button'; b.disabled = !!sent || !!(OG && OG.live && !OG.spectator);
        b.onclick = () => sendInvite(id); acts.appendChild(b);
      }
      li.append(av, who, acts); ul.appendChild(li);
    }
  }

  // ---------- sign in / out ----------
  async function goOnline(raw) {
    const name = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 20);
    if (!name) { msg('Type your name first.'); $('#name-input').focus(); return; }
    myName = name; try { localStorage.setItem('c4g-name', name); } catch (e) {}
    if (started) { statusRef.update({ name }).catch(() => {}); msg(''); showHome(); return; }
    msg('Connecting…'); $('#go-online').disabled = true;
    let step = 'loading';
    try {
      await withTimeout(loadFirebase(), 12000);
      step = 'sign-in';
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth(); rdb = firebase.database(); fs = firebase.firestore();
      if (!auth.currentUser) await withTimeout(auth.signInAnonymously(), 12000);
      me = auth.currentUser.uid;
      step = 'realtime database';
      wentOffline = false; rdb.goOnline();
      statusRef = rdb.ref('status/' + me);
      await withTimeout(statusRef.set(presence(true)), 12000);
      rdb.ref('.info/connected').on('value', onConn);
      step = 'firestore';
      listenPeople(); listenInvites();
      started = true; bumpIdle(); msg(''); showHome(); C4.Snd.tap();
    } catch (e) { msg(explain(e) + ' [step: ' + step + ']'); try { console.error(e); } catch (x) {} }
    finally { $('#go-online').disabled = false; }
  }
  async function goOffline() {
    wentOffline = true;
    if (sent) await cancelInvite(false);
    if (room) await closeRoom();
    try { rdb.ref('.info/connected').off('value', onConn); } catch (e) {}
    if (peopleQ) peopleQ.off(); if (invitesUnsub) invitesUnsub();
    try { await statusRef.update({ online: false, state: 'lobby', gameId: null, lastSeen: firebase.database.ServerValue.TIMESTAMP }); } catch (e) {}
    try { rdb.goOffline(); } catch (e) {}
    started = false; people = {};
    showSignin(); msg('You are offline. Nobody can see you.');
  }
  $('#signin').addEventListener('submit', e => { e.preventDefault(); C4.Snd.init(); goOnline($('#name-input').value); });
  $('#rename').addEventListener('click', () => { msg(''); showSignin(); $('#name-input').focus(); });
  $('#go-offline').addEventListener('click', goOffline);

  function listenPeople() {
    peopleQ = rdb.ref('status').orderByChild('online').equalTo(true);
    peopleQ.on('value', snap => {
      people = {};
      snap.forEach(ch => {
        if (ch.key === me) return;
        const v = ch.val() || {};
        people[ch.key] = { name: String(v.name || 'Player').slice(0, 20), state: ['lobby', 'match', 'idle'].includes(v.state) ? v.state : 'lobby', gameId: typeof v.gameId === 'string' ? v.gameId : null };
      });
      renderPeople(); checkOpp();
    }, e => C4.toast(explain(e)));
  }

  // ---------- challenges ----------
  async function sendInvite(uid) {
    if (sent || !started) return;
    const toName = (people[uid] && people[uid].name) || (OG && OG.opp === uid ? OG.oppName : 'Player');
    const blitz = C4.prefs.oblitz || 0;
    try {
      const ref = await fs.collection('invites').add({ from: me, fromName: myName, to: uid, toName, blitz, status: 'pending', createdAt: ts() });
      sent = { id: ref.id, to: uid, toName, ref };
      C4.Snd.tap(); C4.toast(`Challenge sent to ${toName}.`);
      sent.unsub = ref.onSnapshot(s => {
        const d = s.data(); if (!d || !sent || sent.id !== s.id) return;
        if (d.status === 'accepted' && d.gameId) { clearSent(); enterGame(d.gameId, false); }
        else if (d.status === 'declined') { clearSent(); C4.toast(`${toName} said no thanks.`); }
        else if (d.status === 'cancelled') clearSent();
      });
      sent.timer = setTimeout(() => cancelInvite(true), 45000);
      renderPeople();
    } catch (e) { C4.toast(explain(e)); }
  }
  function clearSent() { if (!sent) return; if (sent.unsub) sent.unsub(); clearTimeout(sent.timer); sent = null; renderPeople(); }
  async function cancelInvite(timedOut) {
    if (!sent) return;
    const s = sent; clearSent();
    try { await s.ref.update({ status: 'cancelled', updatedAt: ts() }); } catch (e) {}
    C4.toast(timedOut ? `${s.toName} didn't answer.` : 'Challenge cancelled.');
  }
  function listenInvites() {
    invitesUnsub = fs.collection('invites').where('to', '==', me).where('status', '==', 'pending').onSnapshot(qs => {
      const list = [];
      qs.forEach(d => { const v = d.data(); const t = v.createdAt && v.createdAt.toMillis ? v.createdAt.toMillis() : Date.now(); if (Date.now() - t < 60000) list.push(Object.assign({ id: d.id }, v)); });
      handleIncoming(list);
    }, e => C4.toast(explain(e)));
  }
  function handleIncoming(list) {
    const modal = $('#invite');
    if (incoming && !list.find(i => i.id === incoming.id)) { modal.hidden = true; modal.textContent = ''; C4.toast(`${incoming.fromName} cancelled the challenge.`); incoming = null; }
    if (incoming) return;
    if (C4.inActiveMatch()) return;
    const inv = list.find(i => !seen.has(i.id)); if (!inv) return;
    seen.add(inv.id); incoming = inv;
    C4.Snd.ding(); C4.buzz([100, 80, 100]);
    modal.textContent = '';
    const card = el('div', 'card invite-card'); card.setAttribute('role', 'dialog');
    const av = el('div', 'avatar', (inv.fromName || '?').trim().charAt(0).toUpperCase());
    const h = el('h2', 'display', `${inv.fromName} challenges you!`); h.style.fontSize = '22px';
    const p = el('p', '', `${inv.fromName} goes first.${inv.blitz ? ` Blitz: ${inv.blitz} seconds per move.` : ''}`);
    const row = el('div', 'row');
    const yes = el('button', 'btn primary', 'Accept'); yes.type = 'button'; yes.onclick = () => accept(inv);
    const no = el('button', 'btn', 'No thanks'); no.type = 'button'; no.onclick = () => decline(inv);
    row.append(yes, no); card.append(av, h, p, row); modal.appendChild(card); modal.hidden = false; yes.focus();
  }
  function closeInvite() { const m = $('#invite'); m.hidden = true; m.textContent = ''; incoming = null; }
  async function decline(inv) { closeInvite(); try { await fs.collection('invites').doc(inv.id).update({ status: 'declined', updatedAt: ts() }); } catch (e) {} }
  async function accept(inv) {
    closeInvite();
    if (sent) await cancelInvite(false);
    try {
      const g = fs.collection('games').doc();
      const batch = fs.batch();
      batch.set(g, gameDoc(inv.from, inv.fromName, me, myName, inv.blitz || 0));
      batch.update(fs.collection('invites').doc(inv.id), { status: 'accepted', gameId: g.id, updatedAt: ts() });
      await batch.commit();
      enterGame(g.id, false);
    } catch (e) { C4.toast(explain(e)); }
  }
  function gameDoc(firstUid, firstName, secondUid, secondName, blitz) {
    return {
      players: [firstUid, secondUid], names: { [firstUid]: firstName, [secondUid]: secondName },
      first: firstUid, turn: firstUid, moves: [], status: 'playing', winner: null, leftBy: null,
      blitz: [0, 5, 10].includes(blitz) ? blitz : 0, createdAt: ts(), updatedAt: ts()
    };
  }

  // ---------- rooms ----------
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
  function renderRoom() {
    $('#room-host').hidden = !room; $('#room-create').hidden = !!room; $('#join-form').hidden = !!room;
    if (room) $('#room-code').textContent = room.code;
  }
  $('#room-create').addEventListener('click', async () => {
    if (!started || room) return;
    C4.Snd.tap();
    try {
      let code = null;
      for (let tries = 0; tries < 5 && !code; tries++) {
        const c = newCode(), ref = fs.collection('rooms').doc(c);
        try {
          await fs.runTransaction(async tx => {
            const s = await tx.get(ref);
            if (s.exists && s.data().status === 'open') throw { code: 'taken' };
            tx.set(ref, { host: me, hostName: myName, blitz: C4.prefs.oblitz || 0, status: 'open', guest: null, guestName: null, gameId: null, createdAt: ts() });
          });
          code = c;
        } catch (e) { if (e.code !== 'taken') throw e; }
      }
      if (!code) throw { code: 'busy' };
      const ref = fs.collection('rooms').doc(code);
      room = { code, ref };
      room.unsub = ref.onSnapshot(s => {
        const d = s.data(); if (!d || !room) return;
        if (d.status === 'joined' && d.gameId) { const id = d.gameId; stopRoom(); C4.toast(`${d.guestName} joined your room.`); enterGame(id, false); }
      });
      renderRoom();
    } catch (e) { C4.toast(explain(e)); }
  });
  function stopRoom() { if (room && room.unsub) room.unsub(); room = null; renderRoom(); }
  async function closeRoom() { if (!room) return; const r = room; stopRoom(); try { await r.ref.update({ status: 'closed' }); } catch (e) {} }
  $('#room-cancel').addEventListener('click', () => { C4.Snd.tap(); closeRoom(); });
  $('#join-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!started) return;
    const code = $('#join-code').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) { C4.toast('Room codes have 5 letters or numbers.'); return; }
    const ref = fs.collection('rooms').doc(code);
    try {
      const g = fs.collection('games').doc();
      await fs.runTransaction(async tx => {
        const s = await tx.get(ref);
        if (!s.exists) throw { code: 'no-room' };
        const d = s.data();
        if (d.status !== 'open') throw { code: 'room-closed' };
        if (d.host === me) throw { code: 'own-room' };
        tx.set(g, gameDoc(d.host, d.hostName, me, myName, d.blitz || 0));
        tx.update(ref, { status: 'joined', guest: me, guestName: myName, gameId: g.id });
      });
      $('#join-code').value = '';
      enterGame(g.id, false);
    } catch (err) {
      const c = err && err.code;
      C4.toast(c === 'no-room' ? 'No room with that code.' : c === 'room-closed' ? 'That room is already full or closed.' : c === 'own-room' ? 'That is your own room. Share the code with a friend.' : explain(err));
    }
  });

  // ---------- games (play + spectate) ----------
  function watch(gameId) { C4.Snd.tap(); enterGame(gameId, true); }
  function cleanupGame() {
    if (!OG) return;
    if (OG.unsub) OG.unsub(); if (OG.chatUnsub) OG.chatUnsub();
    if (OG.watchRef) { OG.watchRef.remove().catch(() => {}); OG.watchRef.onDisconnect().cancel().catch(() => {}); }
    if (OG.watchQ) OG.watchQ.off();
    clearTimeout(oppGoneTimer); oppGoneTimer = null;
    OG = null;
  }
  function enterGame(id, spectator) {
    if (incoming) closeInvite();
    cleanupGame();
    const ref = fs.collection('games').doc(id);
    const game = OG = { id, ref, spectator, ready: false, live: !spectator, chain: Promise.resolve() };
    pushPresence();
    game.unsub = ref.onSnapshot(s => {
      const d = s.data(); if (!d || OG !== game) return;
      game.chain = game.chain.then(() => handleGame(game, d)).catch(() => {});
    }, e => C4.toast(explain(e)));
    // chat
    let first = true;
    game.chatUnsub = ref.collection('chat').orderBy('at').limitToLast(40).onSnapshot(qs => {
      if (OG !== game) return;
      const add = [];
      qs.docChanges().forEach(ch => {
        if (ch.type !== 'added') return;
        const v = ch.doc.data();
        add.push({ uid: v.uid, name: String(v.name || 'Player').slice(0, 20), k: v.k, i: v.i, mine: v.uid === me, live: !first, piece: game.players ? (v.uid === game.players[0] ? 1 : v.uid === game.players[1] ? 2 : 0) : 0 });
      });
      first = false;
      if (add.length && game.ready) C4.onChat(add); else if (add.length) game.pendingChat = (game.pendingChat || []).concat(add.map(a => Object.assign(a, { live: false })));
    }, () => {});
    // watchers
    game.watchQ = rdb.ref('watching/' + id);
    game.watchQ.on('value', s => { if (OG === game) C4.onWatchers(s.numChildren()); });
    if (spectator) {
      game.watchRef = rdb.ref('watching/' + id + '/' + me);
      game.watchRef.onDisconnect().remove().catch(() => {});
      game.watchRef.set(myName).catch(() => {});
    }
  }
  async function handleGame(game, d) {
    if (!game.ready) {
      game.ready = true;
      game.players = d.players;
      const names = d.players.map(u => String((d.names && d.names[u]) || 'Player').slice(0, 20));
      if (!game.spectator) {
        game.myPiece = d.players[0] === me ? 1 : 2;
        game.opp = d.players[game.myPiece === 1 ? 1 : 0];
        game.oppName = names[game.myPiece === 1 ? 1 : 0];
      }
      C4.enterOnline({ gameId: game.id, spectator: game.spectator, myPiece: game.myPiece || 0, names, blitz: d.blitz || 0, oppUid: game.opp });
      if (game.pendingChat) { C4.onChat(game.pendingChat); game.pendingChat = null; }
      if (game.spectator && d.status !== 'playing') C4.toast('This match already finished.');
    }
    await C4.syncOnline({ moves: d.moves || [], status: d.status, leftBy: d.leftBy, players: d.players, me });
    if (d.status !== 'playing' && game.live) { game.live = false; pushPresence(); }
  }
  async function sendMove(c, idx, status) {
    const game = OG; if (!game || game.spectator) return false;
    try {
      await fs.runTransaction(async tx => {
        const s = await tx.get(game.ref); const d = s.data();
        if (!d || d.status !== 'playing' || d.turn !== me || d.moves.length !== idx) throw { code: 'stale' };
        tx.update(game.ref, { moves: d.moves.concat([c]), turn: game.opp, status, winner: status === 'won' ? me : null, updatedAt: ts() });
      });
      if (status !== 'playing') { game.live = false; pushPresence(); }
      return true;
    } catch (e) { return false; }
  }
  async function resync() {
    const game = OG; if (!game) return;
    try { const s = await game.ref.get(); const d = s.data(); if (d && OG === game) await C4.syncOnline({ moves: d.moves || [], status: d.status, leftBy: d.leftBy, players: d.players, me }); } catch (e) {}
  }
  async function sendChat(k, i) {
    const game = OG; if (!game) return;
    if (game.spectator && k !== 'e') return;
    try { await game.ref.collection('chat').add({ uid: me, name: myName, k, i, at: ts() }); }
    catch (e) { C4.toast('Could not send that.'); }
  }
  async function leave() {
    const game = OG;
    if (game && !game.spectator && game.live) {
      try { await game.ref.update({ status: 'left', leftBy: me, updatedAt: ts() }); } catch (e) {}
    }
    cleanupGame(); pushPresence();
    C4.detach();
    C4.showView('online');
  }
  function rematch() {
    const game = OG;
    if (!game || !game.opp) return;
    if (!people[game.opp]) { C4.toast(`${game.oppName} is not online anymore.`); return; }
    sendInvite(game.opp);
  }
  function checkOpp() {
    const game = OG;
    if (!game || game.spectator || !game.live || !game.ready) { clearTimeout(oppGoneTimer); oppGoneTimer = null; return; }
    if (people[game.opp]) { clearTimeout(oppGoneTimer); oppGoneTimer = null; return; }
    if (oppGoneTimer) return;
    oppGoneTimer = setTimeout(() => {
      oppGoneTimer = null;
      if (OG !== game || !game.live || people[game.opp]) return;
      game.live = false; pushPresence();
      C4.toast(`${game.oppName} lost connection.`);
      C4.oppGone();
    }, 15000);
  }

  window.Online = { open, sendMove, sendChat, leave, rematch, resync, hosted };
})();
