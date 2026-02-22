# stem-ai
Music Stem splitter
index.html<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>STEMIX — AI Vocal Remover</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --neon: #00ff41;
      --neon-dim: #00cc33;
      --neon-glow: 0 0 8px #00ff41, 0 0 20px #00ff4188, 0 0 40px #00ff4144;
      --neon-glow-strong: 0 0 10px #00ff41, 0 0 30px #00ff41aa, 0 0 60px #00ff4166, 0 0 100px #00ff4133;
      --bg: #000; --bg3: #0a120a;
      --text: #b0ffb0; --text-dim: #4a7a4a;
    }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:var(--bg); color:var(--text); font-family:'Share Tech Mono',monospace; min-height:100vh; overflow-x:hidden; }
    body::before { content:''; position:fixed; inset:0; background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,65,0.015) 2px,rgba(0,255,65,0.015) 4px); pointer-events:none; z-index:9999; }
    body::after { content:''; position:fixed; inset:0; background-image:linear-gradient(rgba(0,255,65,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,65,0.04) 1px,transparent 1px); background-size:40px 40px; pointer-events:none; z-index:0; }

    /* ── OVERLAY (login + ad + host password) ── */
    .overlay { position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:1000; display:flex; align-items:center; justify-content:center; }
    .overlay.hidden { display:none; }
    .modal { background:var(--bg3); border:1px solid var(--neon-dim); box-shadow:var(--neon-glow-strong); border-radius:6px; padding:36px 32px; width:100%; max-width:420px; text-align:center; position:relative; }
    .modal-title { font-family:'Orbitron',monospace; font-size:1.1rem; color:var(--neon); text-shadow:var(--neon-glow); letter-spacing:0.2em; margin-bottom:8px; }
    .modal-sub { font-size:0.65rem; color:var(--text-dim); letter-spacing:0.1em; margin-bottom:24px; line-height:1.6; }
    .neon-input { width:100%; background:rgba(0,255,65,0.04); border:1px solid rgba(0,255,65,0.25); color:var(--neon); font-family:'Share Tech Mono',monospace; font-size:0.85rem; padding:12px 16px; border-radius:3px; outline:none; letter-spacing:0.1em; margin-bottom:14px; text-align:center; }
    .neon-input::placeholder { color:var(--text-dim); }
    .neon-input:focus { border-color:var(--neon); box-shadow:var(--neon-glow); }
    .modal-btn { width:100%; background:transparent; border:2px solid var(--neon); box-shadow:var(--neon-glow-strong); color:var(--neon); font-family:'Orbitron',monospace; font-size:0.7rem; font-weight:700; letter-spacing:0.2em; padding:14px; cursor:pointer; border-radius:3px; text-transform:uppercase; transition:all 0.2s; }
    .modal-btn:hover { background:rgba(0,255,65,0.08); }
    .modal-err { font-size:0.6rem; color:rgba(255,100,100,0.85); margin-top:10px; min-height:18px; }

    /* ── AD OVERLAY ── */
    .ad-overlay { position:fixed; inset:0; background:#000; z-index:2000; display:flex; flex-direction:column; align-items:center; justify-content:center; }
    .ad-overlay.hidden { display:none; }
    .ad-media-wrap { position:relative; width:100%; max-width:860px; }
    .ad-media-wrap video, .ad-media-wrap audio { width:100%; border:1px solid rgba(0,255,65,0.2); border-radius:4px; }
    .ad-label { font-family:'Orbitron',monospace; font-size:0.55rem; color:rgba(255,255,255,0.35); letter-spacing:0.2em; margin-bottom:12px; }
    .ad-timer { font-family:'Orbitron',monospace; font-size:0.8rem; color:var(--neon); text-shadow:var(--neon-glow); margin-top:14px; letter-spacing:0.15em; }
    .ad-skip-bar { position:fixed; bottom:20px; right:24px; z-index:2100; }
    .ad-skip-btn { background:rgba(0,0,0,0.7); border:1px solid rgba(0,255,65,0.3); color:var(--text-dim); font-family:'Share Tech Mono',monospace; font-size:0.52rem; letter-spacing:0.1em; padding:7px 14px; border-radius:2px; cursor:pointer; transition:all 0.2s; }
    .ad-skip-btn:hover { border-color:var(--neon); color:var(--neon); }

    /* ── HOST SKIP PASSWORD MODAL ── */
    .skip-modal { position:fixed; bottom:64px; right:24px; z-index:2200; background:var(--bg3); border:1px solid var(--neon-dim); box-shadow:var(--neon-glow); border-radius:4px; padding:16px; width:240px; display:none; }
    .skip-modal.visible { display:block; }
    .skip-modal input { width:100%; background:rgba(0,255,65,0.04); border:1px solid rgba(0,255,65,0.25); color:var(--neon); font-family:'Share Tech Mono',monospace; font-size:0.75rem; padding:8px 10px; border-radius:2px; outline:none; letter-spacing:0.1em; margin-bottom:8px; text-align:center; }
    .skip-modal input:focus { border-color:var(--neon); box-shadow:0 0 8px var(--neon); }
    .skip-modal button { width:100%; background:transparent; border:1px solid var(--neon-dim); color:var(--neon); font-family:'Orbitron',monospace; font-size:0.52rem; letter-spacing:0.15em; padding:8px; cursor:pointer; border-radius:2px; text-transform:uppercase; }
    .skip-modal button:hover { background:rgba(0,255,65,0.08); }
    .skip-err { font-size:0.56rem; color:rgba(255,100,100,0.8); margin-top:6px; min-height:14px; }

    /* ── MAIN LAYOUT ── */
    .container { position:relative; z-index:1; max-width:940px; margin:0 auto; padding:34px 20px 100px; }
    header { text-align:center; margin-bottom:32px; position:relative; }
    .logo { font-family:'Orbitron',monospace; font-size:clamp(2.2rem,7vw,4.5rem); font-weight:900; color:var(--neon); text-shadow:var(--neon-glow-strong); letter-spacing:0.2em; animation:flicker 8s infinite; }
    .logo span { color:#fff; text-shadow:0 0 10px #fff,0 0 30px #00ff4188; }
    .tagline { font-size:0.7rem; color:var(--text-dim); letter-spacing:0.4em; margin-top:6px; text-transform:uppercase; }
    @keyframes flicker { 0%,95%,100%{opacity:1}96%{opacity:.85}97%{opacity:1}98%{opacity:.7}99%{opacity:1} }

    /* ── TOP BAR ── */
    .top-bar { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; gap:12px; flex-wrap:wrap; }
    .user-pill { display:flex; align-items:center; gap:8px; background:rgba(0,255,65,0.05); border:1px solid rgba(0,255,65,0.2); border-radius:20px; padding:6px 14px; font-size:0.6rem; color:var(--text-dim); }
    .user-pill .uname { color:var(--neon); text-shadow:0 0 6px var(--neon); font-family:'Orbitron',monospace; font-size:0.58rem; }
    .logout-btn { background:transparent; border:1px solid rgba(0,255,65,0.15); color:var(--text-dim); font-family:'Share Tech Mono',monospace; font-size:0.54rem; padding:4px 10px; cursor:pointer; border-radius:2px; transition:all 0.2s; }
    .logout-btn:hover { border-color:var(--neon-dim); color:var(--neon); }
    .ai-badge { display:inline-flex; align-items:center; gap:7px; background:rgba(0,255,65,0.05); border:1px solid rgba(0,255,65,0.18); border-radius:20px; padding:5px 14px; font-size:0.55rem; color:var(--text-dim); }
    .ai-dot { width:7px; height:7px; border-radius:50%; background:var(--neon); box-shadow:var(--neon-glow); animation:pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(0.8)} }

    /* ── HOST PANEL ── */
    .host-panel { background:linear-gradient(135deg,rgba(255,107,0,0.06),rgba(0,0,0,0)); border:1px solid rgba(255,107,0,0.3); border-radius:4px; padding:18px 20px; margin-bottom:22px; display:none; }
    .host-panel.visible { display:block; }
    .host-title { font-family:'Orbitron',monospace; font-size:0.65rem; letter-spacing:0.2em; color:#ff6b00; text-shadow:0 0 10px #ff6b00; margin-bottom:14px; }
    .host-row { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .host-label { font-size:0.62rem; color:rgba(255,180,100,0.7); }

    /* Toggle switch */
    .toggle-wrap { display:flex; align-items:center; gap:10px; }
    .toggle { position:relative; width:44px; height:24px; cursor:pointer; }
    .toggle input { opacity:0; width:0; height:0; }
    .toggle-slider { position:absolute; inset:0; background:rgba(255,107,0,0.15); border:1px solid rgba(255,107,0,0.3); border-radius:24px; transition:0.3s; }
    .toggle-slider:before { content:''; position:absolute; width:18px; height:18px; left:2px; top:2px; background:rgba(255,107,0,0.5); border-radius:50%; transition:0.3s; }
    .toggle input:checked + .toggle-slider { background:rgba(255,107,0,0.25); border-color:#ff6b00; }
    .toggle input:checked + .toggle-slider:before { transform:translateX(20px); background:#ff6b00; box-shadow:0 0 8px #ff6b00; }
    .toggle-label { font-family:'Orbitron',monospace; font-size:0.56rem; letter-spacing:0.1em; color:rgba(255,180,100,0.7); }

    .ad-upload-area { margin-top:14px; border:1px dashed rgba(255,107,0,0.3); border-radius:3px; padding:14px; text-align:center; cursor:pointer; transition:all 0.2s; }
    .ad-upload-area:hover { background:rgba(255,107,0,0.04); border-color:rgba(255,107,0,0.6); }
    .ad-upload-area p { font-size:0.6rem; color:rgba(255,180,100,0.6); }
    .ad-current { font-size:0.58rem; color:rgba(255,180,100,0.5); margin-top:8px; }
    #adFileInput { display:none; }

    .host-exit-btn { background:transparent; border:1px solid rgba(255,107,0,0.3); color:rgba(255,107,0,0.6); font-family:'Share Tech Mono',monospace; font-size:0.54rem; padding:5px 12px; cursor:pointer; border-radius:2px; transition:all 0.2s; margin-left:auto; display:block; margin-top:12px; }
    .host-exit-btn:hover { border-color:#ff6b00; color:#ff6b00; }

    /* ── TABS ── */
    .tabs { display:flex; gap:0; margin-bottom:26px; border-bottom:1px solid rgba(0,255,65,0.15); }
    .tab-btn { background:transparent; border:none; color:var(--text-dim); font-family:'Orbitron',monospace; font-size:0.58rem; letter-spacing:0.2em; padding:11px 22px; cursor:pointer; text-transform:uppercase; border-bottom:2px solid transparent; transition:all 0.2s; }
    .tab-btn:hover { color:var(--text); }
    .tab-btn.active { color:var(--neon); text-shadow:var(--neon-glow); border-bottom-color:var(--neon); }
    .tab-panel { display:none; }
    .tab-panel.active { display:block; }

    /* ── UPLOAD ── */
    .upload-zone { border:1px solid var(--neon-dim); box-shadow:var(--neon-glow),inset 0 0 30px rgba(0,255,65,0.03); border-radius:4px; padding:50px 40px; text-align:center; cursor:pointer; transition:all 0.3s; margin-bottom:22px; }
    .upload-zone:hover,.upload-zone.drag-over { background:rgba(0,255,65,0.03); box-shadow:var(--neon-glow-strong),inset 0 0 60px rgba(0,255,65,0.05); }
    .upload-icon { font-size:2.6rem; margin-bottom:12px; display:block; filter:drop-shadow(0 0 8px var(--neon)); }
    .upload-zone h2 { font-family:'Orbitron',monospace; font-size:0.92rem; color:var(--neon); text-shadow:var(--neon-glow); margin-bottom:8px; letter-spacing:0.15em; }
    .upload-zone p { font-size:0.68rem; color:var(--text-dim); letter-spacing:0.08em; }
    #fileInput { display:none; }

    /* ── FILE INFO ── */
    .file-info { display:none; background:var(--bg3); border:1px solid rgba(0,255,65,0.2); border-radius:3px; padding:12px 17px; margin-bottom:16px; font-size:0.68rem; color:var(--text-dim); align-items:center; gap:12px; }
    .file-info.visible { display:flex; }
    .file-badge { background:var(--neon); color:#000; font-family:'Orbitron',monospace; font-size:0.46rem; font-weight:700; padding:3px 7px; border-radius:2px; }
    .file-name { flex:1; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    /* ── MODE ── */
    .section-label { font-family:'Orbitron',monospace; font-size:0.56rem; letter-spacing:0.28em; color:var(--text-dim); text-transform:uppercase; margin-bottom:10px; }
    .mode-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(145px,1fr)); gap:9px; margin-bottom:20px; }
    .mode-btn { background:transparent; border:1px solid var(--neon-dim); box-shadow:var(--neon-glow); color:var(--text); font-family:'Orbitron',monospace; font-size:0.55rem; letter-spacing:0.1em; padding:12px 7px; cursor:pointer; border-radius:3px; transition:all 0.2s; text-transform:uppercase; display:flex; flex-direction:column; align-items:center; gap:5px; }
    .mode-btn .mode-icon { font-size:1.2rem; }
    .mode-btn:hover,.mode-btn.active { background:rgba(0,255,65,0.08); border-color:var(--neon); color:var(--neon); box-shadow:var(--neon-glow-strong); text-shadow:0 0 8px var(--neon); }

    /* ── PROCESS BTN ── */
    .process-btn { width:100%; background:transparent; border:2px solid var(--neon); box-shadow:var(--neon-glow-strong); color:var(--neon); font-family:'Orbitron',monospace; font-size:0.82rem; font-weight:700; letter-spacing:0.3em; padding:18px; cursor:pointer; border-radius:3px; text-transform:uppercase; transition:all 0.2s; text-shadow:var(--neon-glow); margin-bottom:24px; position:relative; overflow:hidden; }
    .process-btn::after { content:''; position:absolute; top:0; left:-100%; width:100%; height:100%; background:linear-gradient(90deg,transparent,rgba(0,255,65,0.12),transparent); transition:left 0.5s; }
    .process-btn:hover::after { left:100%; }
    .process-btn:hover { background:rgba(0,255,65,0.08); }
    .process-btn:disabled { opacity:0.3; cursor:not-allowed; box-shadow:none; }

    /* ── PROGRESS ── */
    .progress-section { display:none; margin-bottom:24px; }
    .progress-section.visible { display:block; }
    .progress-label { font-size:0.58rem; letter-spacing:0.25em; color:var(--text-dim); margin-bottom:8px; display:flex; justify-content:space-between; }
    .progress-bar-wrap { background:rgba(0,255,65,0.05); border:1px solid rgba(0,255,65,0.2); border-radius:2px; height:9px; overflow:hidden; }
    .progress-bar { height:100%; background:linear-gradient(90deg,var(--neon-dim),var(--neon)); box-shadow:0 0 10px var(--neon); width:0%; transition:width 0.6s ease; border-radius:2px; }
    .status-text { font-size:0.64rem; color:var(--neon); text-shadow:0 0 8px var(--neon); margin-top:9px; letter-spacing:0.1em; }
    .status-text.blink { animation:blink 1s infinite; }
    @keyframes blink { 0%,100%{opacity:1}50%{opacity:.35} }

    .error-box { display:none; border:1px solid rgba(255,60,60,0.4); background:rgba(255,60,60,0.05); border-radius:3px; padding:13px 17px; font-size:0.62rem; color:rgba(255,130,130,0.9); line-height:1.7; margin-bottom:14px; }
    .error-box.visible { display:block; }
    .save-indicator { display:none; background:rgba(0,255,65,0.07); border:1px solid rgba(0,255,65,0.2); border-radius:3px; padding:9px 15px; font-size:0.6rem; color:var(--neon); letter-spacing:0.08em; margin-bottom:13px; text-align:center; }
    .save-indicator.visible { display:block; }

    /* ── RESULTS ── */
    .results { display:none; }
    .results.visible { display:block; }
    .results-header { font-family:'Orbitron',monospace; font-size:0.58rem; letter-spacing:0.25em; color:var(--text-dim); text-transform:uppercase; margin-bottom:15px; padding-bottom:8px; border-bottom:1px solid rgba(0,255,65,0.14); }

    /* ── MIXER ── */
    .mixer-panel { background:var(--bg3); border:1px solid rgba(0,255,65,0.2); border-radius:4px; padding:20px; margin-bottom:13px; }
    .mixer-title { font-family:'Orbitron',monospace; font-size:0.62rem; letter-spacing:0.18em; color:var(--neon); text-shadow:0 0 6px var(--neon); margin-bottom:15px; }
    .track-row { display:grid; grid-template-columns:106px 1fr 83px; align-items:center; gap:12px; margin-bottom:14px; }
    .track-label { font-family:'Orbitron',monospace; font-size:0.51rem; letter-spacing:0.08em; color:var(--neon); display:flex; flex-direction:column; gap:3px; }
    .track-sub { color:var(--text-dim); font-size:0.47rem; font-family:'Share Tech Mono',monospace; }
    .waveform-wrap { position:relative; height:60px; background:rgba(0,255,65,0.03); border:1px solid rgba(0,255,65,0.1); border-radius:2px; overflow:hidden; cursor:pointer; }
    canvas.waveform { width:100%; height:100%; display:block; }
    .playhead { position:absolute; top:0; bottom:0; width:2px; background:rgba(255,255,255,0.9); box-shadow:0 0 6px #fff; left:0; pointer-events:none; }
    .vol-col { display:flex; flex-direction:column; align-items:center; gap:4px; }
    .vol-label { font-size:0.5rem; color:var(--text-dim); }
    .vol-val { font-family:'Orbitron',monospace; font-size:0.55rem; color:var(--neon); text-shadow:0 0 6px var(--neon); }
    input.vol-slider { -webkit-appearance:none; writing-mode:vertical-lr; direction:rtl; width:6px; height:66px; padding:0; background:rgba(0,255,65,0.15); border-radius:3px; outline:none; margin:0 auto; display:block; cursor:pointer; }
    input.vol-slider::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:var(--neon); box-shadow:var(--neon-glow); cursor:pointer; }
    input.vol-slider::-moz-range-thumb { width:14px; height:14px; border-radius:50%; background:var(--neon); box-shadow:var(--neon-glow); cursor:pointer; border:none; }
    .mixer-controls { display:flex; align-items:center; gap:13px; margin-top:15px; padding-top:14px; border-top:1px solid rgba(0,255,65,0.1); }
    .big-play-btn { width:54px; height:54px; border-radius:50%; border:2px solid var(--neon); box-shadow:var(--neon-glow-strong); background:transparent; color:var(--neon); font-size:1.3rem; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; flex-shrink:0; }
    .big-play-btn:hover { background:rgba(0,255,65,0.1); }
    .big-play-btn.playing { border-color:#fff; box-shadow:0 0 10px #fff,0 0 30px rgba(255,255,255,0.25); color:#fff; }
    .scrubber-wrap { flex:1; display:flex; flex-direction:column; gap:5px; }
    .scrubber { -webkit-appearance:none; width:100%; height:4px; background:rgba(0,255,65,0.15); border-radius:2px; outline:none; cursor:pointer; }
    .scrubber::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:var(--neon); box-shadow:var(--neon-glow); cursor:pointer; }
    .scrubber::-moz-range-thumb { width:14px; height:14px; border-radius:50%; background:var(--neon); box-shadow:var(--neon-glow); cursor:pointer; border:none; }
    .time-row { display:flex; justify-content:space-between; font-size:0.52rem; color:var(--text-dim); }
    .mixer-time { font-family:'Orbitron',monospace; font-size:0.78rem; color:var(--neon); text-shadow:var(--neon-glow); min-width:48px; text-align:right; }
    .export-section { margin-top:17px; padding-top:13px; border-top:1px solid rgba(0,255,65,0.1); }
    .export-title { font-family:'Orbitron',monospace; font-size:0.56rem; letter-spacing:0.18em; color:var(--text-dim); margin-bottom:10px; }
    .export-btns { display:flex; gap:9px; flex-wrap:wrap; }
    .export-btn { flex:1; min-width:125px; background:transparent; border:1px solid var(--neon-dim); box-shadow:var(--neon-glow); color:var(--neon); font-family:'Orbitron',monospace; font-size:0.5rem; letter-spacing:0.1em; padding:11px 8px; cursor:pointer; border-radius:3px; text-transform:uppercase; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:5px; transition:all 0.2s; }
    .export-btn:hover { background:rgba(0,255,65,0.08); box-shadow:var(--neon-glow-strong); }
    .export-btn.mixed { border-color:var(--neon); border-width:2px; box-shadow:var(--neon-glow-strong); }
    .stem-card { background:var(--bg3); border:1px solid rgba(0,255,65,0.14); border-radius:3px; padding:13px 16px; margin-bottom:9px; }
    .stem-top { display:flex; align-items:center; gap:11px; }
    .stem-icon { font-size:1.3rem; filter:drop-shadow(0 0 4px var(--neon)); }
    .stem-info { flex:1; }
    .stem-name { font-family:'Orbitron',monospace; font-size:0.6rem; color:var(--neon); text-shadow:0 0 6px var(--neon); letter-spacing:0.1em; margin-bottom:2px; }
    .stem-desc { font-size:0.57rem; color:var(--text-dim); }
    audio { width:100%; height:30px; margin-top:8px; filter:invert(1) hue-rotate(90deg) brightness(0.8); }
    .dl
