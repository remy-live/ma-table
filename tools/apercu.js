// Fichier de démo : sur un ordinateur, l'appli tourne dans un cadre qu'on
// redimensionne (écran, tablette, téléphone debout ou couché) sans la
// recharger. Une petite barre de débogage, qu'on déplace à la souris et qu'on
// replie, change le cadre, la table imitée, simule un larsen ou une liaison
// perdue. Sur un vrai téléphone, l'appli s'ouvre directement (ajoute ?debug
// à l'adresse pour avoir quand même la barre).
(function () {
  var KEY = 'mt:apercu', KEYBAR = 'mt:barre';
  var inFrame = window.self !== window.top;
  var force = /[?&#]debug/.test(location.href);
  var mode = 'ecran';
  try { mode = localStorage.getItem(KEY) || 'ecran'; } catch (e) {}
  var bar0 = { x: -1, y: 10, open: true };
  try { bar0 = Object.assign(bar0, JSON.parse(localStorage.getItem(KEYBAR) || '{}')); } catch (e) {}
  var SIZES = { tel: [390, 844], telH: [844, 390], tab: [1210, 756] };
  var MODELS = ['XR18', 'XR16', 'XR12', 'MR18', 'X32', 'Ui24R'];
  function runApp() {
    var src = document.getElementById('appjs').textContent;
    var s = document.createElement('script');
    s.textContent = src;
    document.body.appendChild(s);
  }
  document.addEventListener('DOMContentLoaded', function () {
    if (inFrame) { runApp(); return; }
    var framed = window.innerWidth >= 900;
    if (!framed && !force) { runApp(); return; }
    var target = null; // la fenêtre de l'appli (le cadre, ou celle-ci)
    var box = null, f = null, lab = null;
    if (framed) {
      var root = document.getElementById('root'); if (root) root.style.display = 'none';
      document.body.style.cssText = 'margin:0;background:#0b0c10;height:100vh;overflow:hidden;';
      box = document.createElement('div');
      f = document.createElement('iframe');
      f.src = location.href.split('#')[0].split('?')[0] + '#cadre';
      box.appendChild(f);
      document.body.appendChild(box);
      lab = document.createElement('div');
      lab.style.cssText = 'position:fixed;bottom:8px;left:0;right:0;text-align:center;color:#666;font:12px system-ui;pointer-events:none;';
      document.body.appendChild(lab);
      target = function () { return f.contentWindow; };
    } else {
      runApp();
      target = function () { return window; };
    }

    // ---- la barre ----
    var state = { larsen: false, offline: false, solo: false };
    var bar = document.createElement('div');
    bar.id = 'mt-debug';
    bar.style.cssText = 'position:fixed;z-index:2147483647;display:flex;align-items:center;gap:3px;padding:4px;border-radius:12px;background:rgba(18,20,26,.94);border:1px solid #3a3f48;font:600 12px system-ui;color:#ddd;box-shadow:0 6px 20px rgba(0,0,0,.5);user-select:none;';
    var grip = document.createElement('div');
    grip.textContent = '⠿';
    grip.title = 'Déplacer';
    grip.style.cssText = 'cursor:grab;padding:4px 6px;color:#888;font-size:14px;touch-action:none;';
    bar.appendChild(grip);
    var body = document.createElement('div');
    body.style.cssText = 'display:flex;align-items:center;gap:3px;flex-wrap:wrap;';
    bar.appendChild(body);
    var fold = document.createElement('button');
    document.body.appendChild(bar);

    function btn(label, title, onClick) {
      var b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.onclick = onClick;
      b.style.cssText = 'border:0;border-radius:8px;padding:5px 8px;cursor:pointer;font:inherit;background:transparent;color:#ddd;';
      body.appendChild(b);
      return b;
    }
    function sep() { var s = document.createElement('span'); s.style.cssText = 'width:1px;height:18px;background:#3a3f48;margin:0 3px;'; body.appendChild(s); }
    function look(b, on, warn) { b.style.background = on ? (warn ? '#EF4444' : '#F59E0B') : 'transparent'; b.style.color = on ? '#111' : '#ddd'; }

    var mbtn = {};
    if (framed) {
      [['ecran', '🖥', 'Écran entier'], ['tab', '▭', 'Tablette 1210 × 756'], ['tel', '📱', 'Téléphone 390 × 844'], ['telH', '📱↔', 'Téléphone couché 844 × 390']].forEach(function (o) {
        mbtn[o[0]] = btn(o[1], o[2], function () { apply(o[0]); });
      });
      sep();
    }
    var sel = document.createElement('select');
    sel.title = 'Table imitée par la démo';
    sel.style.cssText = 'background:#22262e;color:#ddd;border:1px solid #3a3f48;border-radius:8px;padding:4px;font:inherit;';
    MODELS.forEach(function (m) { var o = document.createElement('option'); o.value = m; o.textContent = m; sel.appendChild(o); });
    sel.onchange = function () { send({ model: sel.value }); };
    body.appendChild(sel);
    sep();
    var bL = btn('🔊 Larsen', 'Pousse le retour 1 à fond : la démo se met à siffler', function () { state.larsen = !state.larsen; send({ larsen: state.larsen }); look(bL, state.larsen, true); });
    var bO = btn('📡 Liaison', 'Coupe la liaison avec la table imitée (bandeau « Liaison perdue »)', function () { state.offline = !state.offline; send({ offline: state.offline }); look(bO, state.offline, true); });
    var bS = btn('S', 'Solo sur la voie 1', function () { state.solo = !state.solo; send({ solo: state.solo }); look(bS, state.solo); });
    sep();
    btn('⟳', 'Recharger l’appli (garde le cadre)', function () { if (f) f.src = f.src; else location.reload(); });
    var info = document.createElement('span');
    info.style.cssText = 'color:#888;font-weight:500;padding:0 4px;';
    body.appendChild(info);

    fold.style.cssText = 'border:0;border-radius:8px;padding:5px 7px;cursor:pointer;font:inherit;background:transparent;color:#888;';
    fold.title = 'Replier / déplier';
    fold.onclick = function () { bar0.open = !bar0.open; layoutBar(); keep(); };
    bar.appendChild(fold);

    function send(o) { o.mt = 'debug'; try { target().postMessage(o, '*'); } catch (e) {} }
    window.addEventListener('message', function (ev) {
      var d = ev.data;
      if (!d || d.mt !== 'debug-state') return;
      if (d.model && document.activeElement !== sel && MODELS.indexOf(d.model) >= 0) sel.value = d.model;
      info.textContent = d.demo ? 'démo · ' + d.model : d.model ? 'table · ' + d.model : 'accueil';
    });

    function keep() { try { localStorage.setItem(KEYBAR, JSON.stringify(bar0)); } catch (e) {} }
    function layoutBar() {
      body.style.display = bar0.open ? 'flex' : 'none';
      fold.textContent = bar0.open ? '–' : '🐞';
      var w = bar.offsetWidth, h = bar.offsetHeight;
      if (bar0.x < 0) bar0.x = window.innerWidth - w - 10;
      bar0.x = Math.max(4, Math.min(window.innerWidth - w - 4, bar0.x));
      bar0.y = Math.max(4, Math.min(window.innerHeight - h - 4, bar0.y));
      bar.style.left = bar0.x + 'px';
      bar.style.top = bar0.y + 'px';
    }
    // déplacer à la souris ou au doigt, par la poignée
    var drag = null;
    grip.addEventListener('pointerdown', function (e) {
      drag = { dx: e.clientX - bar0.x, dy: e.clientY - bar0.y };
      grip.setPointerCapture(e.pointerId);
      grip.style.cursor = 'grabbing';
      if (f) f.style.pointerEvents = 'none';
    });
    grip.addEventListener('pointermove', function (e) {
      if (!drag) return;
      bar0.x = e.clientX - drag.dx;
      bar0.y = e.clientY - drag.dy;
      layoutBar();
    });
    grip.addEventListener('pointerup', function () { drag = null; grip.style.cursor = 'grab'; if (f) f.style.pointerEvents = ''; keep(); });

    function apply(m) {
      mode = SIZES[m] ? m : 'ecran';
      try { localStorage.setItem(KEY, mode); } catch (e) {}
      Object.keys(mbtn).forEach(function (k) { look(mbtn[k], k === mode); });
      fit();
    }
    function fit() {
      layoutBar();
      if (!framed) return;
      if (mode === 'ecran') {
        box.style.cssText = 'position:fixed;inset:0;';
        f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#000;';
        lab.textContent = '';
        return;
      }
      var w = SIZES[mode][0], h = SIZES[mode][1];
      var pad = mode === 'tab' ? 18 : 14;
      var bw = w + pad * 2, bh = h + pad * 2;
      var k = Math.min(1, (window.innerWidth - 40) / bw, (window.innerHeight - 50) / bh);
      box.style.cssText = 'position:fixed;left:50%;top:50%;width:' + bw + 'px;height:' + bh + 'px;margin-left:' + (-bw / 2) + 'px;margin-top:' + (-bh / 2) + 'px;border-radius:' + (mode === 'tab' ? 28 : 46) + 'px;background:#1b1d22;box-shadow:0 0 0 2px #333,0 20px 60px rgba(0,0,0,.6);transform:scale(' + k + ');transform-origin:center;';
      f.style.cssText = 'position:absolute;left:' + pad + 'px;top:' + pad + 'px;width:' + w + 'px;height:' + h + 'px;border:0;border-radius:' + (mode === 'tab' ? 12 : 34) + 'px;background:#000;';
      lab.textContent = w + ' × ' + h + (mode === 'telH' ? ' · téléphone couché' : mode === 'tel' ? ' · téléphone' : ' · tablette');
    }
    window.addEventListener('resize', fit);
    apply(mode);
  });
})();
