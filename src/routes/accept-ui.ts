import { Hono } from 'hono';
import type { Env } from '../types.js';
import { getProductTheme, getAllProductSlugs } from '../lib/product.js';

const acceptUi = new Hono<{ Bindings: Env }>();

function buildHtml(slug: string) {
  const theme = getProductTheme(slug);
  const allSlugs = getAllProductSlugs();

  const productOptions = allSlugs
    .map((s) => {
      const t = getProductTheme(s);
      return `<option value="${s}"${s === slug ? ' selected' : ''}>${t.name}</option>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>${theme.name} — Aprobar Posts</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0a0a0a;
      --surface: #151515;
      --text: #fafafa;
      --text-muted: #888;
      --accent: ${theme.accent};
      --accent-bg: ${theme.bg};
      --reject-bg: #2a1515;
      --reject-text: #ff4444;
      --approve-bg: #152a15;
      --approve-text: #44ff44;
      --overlay-bg: rgba(0,0,0,0.85);
      --radius-card: 20px;
      --radius-btn: 16px;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    header {
      width: 100%;
      max-width: 440px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      gap: 8px;
    }

    #product-select {
      background: var(--accent-bg);
      color: var(--text);
      border: 2px solid var(--accent);
      border-radius: 12px;
      padding: 8px 12px;
      font-size: 14px;
      font-family: var(--font);
      font-weight: 700;
      color-scheme: dark;
      cursor: pointer;
      min-width: 0;
    }

    #counter {
      font-size: 13px;
      color: var(--text-muted);
      background: #1e1e1e;
      padding: 4px 10px;
      border-radius: 20px;
      white-space: nowrap;
    }

    #refresh-btn {
      background: #1e1e1e;
      color: var(--text);
      border: none;
      border-radius: 12px;
      padding: 8px 14px;
      font-size: 13px;
      font-family: var(--font);
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    }
    #refresh-btn:active { background: #2a2a2a; }
    #refresh-btn:disabled { opacity: 0.4; cursor: default; }

    #tab-bar {
      width: 100%;
      max-width: 440px;
      padding: 0 20px 12px;
      display: flex;
      gap: 8px;
    }

    .tab-btn {
      flex: 1;
      padding: 10px;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-family: var(--font);
      font-weight: 600;
      cursor: pointer;
      background: #1e1e1e;
      color: var(--text-muted);
      transition: background 0.15s, color 0.15s;
    }
    .tab-btn.active {
      background: var(--accent-bg);
      color: var(--text);
      border: 1px solid var(--accent);
    }

    main {
      width: 100%;
      max-width: 440px;
      padding: 0 20px 40px;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    #tab-swipe { width: 100%; }
    #tab-calendar { width: 100%; display: none; }

    #card-container {
      width: 100%;
      position: relative;
      perspective: 1000px;
    }

    .card {
      width: 100%;
      background: var(--surface);
      border-radius: var(--radius-card);
      overflow: hidden;
      transition: transform 0.35s ease, opacity 0.35s ease;
      will-change: transform, opacity;
      transform-origin: center bottom;
    }

    .card.swipe-left {
      transform: translateX(-120%) rotate(-18deg);
      opacity: 0;
    }

    .card.swipe-right {
      transform: translateX(120%) rotate(18deg);
      opacity: 0;
    }

    .card-image {
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      display: block;
      background: #222;
    }

    .card-body { padding: 16px; }

    .card-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 8px;
      line-height: 1.3;
    }

    .card-caption {
      font-size: 14px;
      color: #ccc;
      line-height: 1.55;
      margin-bottom: 14px;
      white-space: pre-wrap;
    }

    .card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .tag {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 9px;
      border-radius: 20px;
      background: #202020;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .action-row {
      display: flex;
      gap: 12px;
      margin-top: 16px;
      width: 100%;
    }

    .action-btn {
      flex: 1;
      padding: 16px;
      border: none;
      border-radius: var(--radius-btn);
      font-size: 15px;
      font-family: var(--font);
      font-weight: 700;
      cursor: pointer;
      transition: filter 0.15s, transform 0.1s;
      letter-spacing: 0.2px;
    }
    .action-btn:active { transform: scale(0.97); filter: brightness(0.85); }
    .action-btn:disabled { opacity: 0.4; cursor: default; }

    #reject-btn { background: var(--reject-bg); color: var(--reject-text); }
    #approve-btn { background: var(--approve-bg); color: var(--approve-text); }

    #state-message {
      margin-top: 60px;
      text-align: center;
      color: var(--text-muted);
      font-size: 15px;
      line-height: 1.6;
    }

    #status-filter-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 14px;
      width: 100%;
    }

    .filter-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 20px;
      font-size: 12px;
      font-family: var(--font);
      font-weight: 600;
      cursor: pointer;
      background: #1e1e1e;
      color: var(--text-muted);
      transition: background 0.15s, color 0.15s;
    }
    .filter-btn.active { background: #2a2a2a; color: var(--text); }

    #cal-state-message {
      text-align: center;
      color: var(--text-muted);
      font-size: 15px;
      padding: 40px 0;
      width: 100%;
    }

    #cal-list {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .cal-card {
      background: var(--surface);
      border-radius: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .cal-card:active { background: #1e1e1e; }

    .cal-thumb {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      object-fit: cover;
      background: #222;
      flex-shrink: 0;
    }

    .cal-info { flex: 1; min-width: 0; }

    .cal-title {
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }

    .cal-caption-preview {
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }

    .cal-meta { font-size: 11px; color: #555; }

    .status-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }

    .badge-pending_approval { background: rgba(255,170,0,0.15); color: #ffaa00; }
    .badge-approved  { background: rgba(68,255,68,0.15);  color: #44ff44; }
    .badge-scheduled { background: rgba(68,136,255,0.15); color: #4488ff; }
    .badge-published { background: rgba(68,255,68,0.08);  color: #33aa33; }
    .badge-failed    { background: rgba(255,68,68,0.15);  color: #ff4444; }
    .badge-cancelled { background: rgba(136,136,136,0.15); color: #888; }

    #edit-overlay, #schedule-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: var(--overlay-bg);
      z-index: 100;
      align-items: flex-end;
      justify-content: center;
    }
    #edit-overlay.active, #schedule-overlay.active { display: flex; }

    #edit-sheet, #schedule-sheet {
      background: #1a1a1a;
      border-radius: 24px 24px 0 0;
      padding: 24px 20px 36px;
      width: 100%;
      max-width: 440px;
    }
    #edit-sheet { max-height: 85dvh; overflow-y: auto; }

    #edit-sheet h2, #schedule-sheet h2 {
      font-size: 17px;
      font-weight: 700;
      margin-bottom: 16px;
      text-align: center;
    }

    .edit-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
      margin-top: 14px;
      display: block;
    }
    .edit-label:first-of-type { margin-top: 0; }

    #edit-caption {
      width: 100%;
      background: #111;
      border: 1px solid #333;
      border-radius: 12px;
      color: var(--text);
      font-size: 14px;
      font-family: var(--font);
      padding: 12px 14px;
      min-height: 120px;
      resize: vertical;
      color-scheme: dark;
    }

    #edit-scheduled-at, #schedule-input {
      width: 100%;
      background: #252525;
      border: 1px solid #333;
      border-radius: 12px;
      color: var(--text);
      font-size: 15px;
      font-family: var(--font);
      padding: 14px 16px;
      color-scheme: dark;
    }
    #schedule-input { margin-bottom: 16px; }

    #edit-platform {
      width: 100%;
      background: #252525;
      border: 1px solid #333;
      border-radius: 12px;
      color: var(--text);
      font-size: 15px;
      font-family: var(--font);
      padding: 14px 16px;
      color-scheme: dark;
      appearance: none;
    }

    .edit-actions, .sheet-row { display: flex; gap: 10px; margin-top: 20px; }

    #edit-cancel, #schedule-cancel {
      flex: 1;
      padding: 14px;
      background: #2a2a2a;
      color: var(--text);
      border: none;
      border-radius: 14px;
      font-size: 15px;
      font-family: var(--font);
      font-weight: 600;
      cursor: pointer;
    }

    #edit-save, #schedule-confirm {
      flex: 2;
      padding: 14px;
      background: var(--approve-bg);
      color: var(--approve-text);
      border: none;
      border-radius: 14px;
      font-size: 15px;
      font-family: var(--font);
      font-weight: 700;
      cursor: pointer;
    }
    #edit-save:disabled { opacity: 0.5; cursor: default; }

    #toast {
      position: fixed;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      background: #1e1e1e;
      color: var(--text);
      padding: 12px 20px;
      border-radius: 14px;
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      z-index: 200;
      transition: transform 0.3s ease, opacity 0.3s ease;
      opacity: 0;
      pointer-events: none;
    }
    #toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
  </style>
</head>
<body>

<header>
  <select id="product-select">${productOptions}</select>
  <span id="counter"></span>
  <button id="refresh-btn">Escanear</button>
</header>

<div id="tab-bar">
  <button class="tab-btn active" id="tab-btn-swipe">Aprobar</button>
  <button class="tab-btn" id="tab-btn-calendar">Calendario</button>
</div>

<main>
  <div id="tab-swipe">
    <div id="card-container"></div>
    <div class="action-row" id="action-row" style="display:none">
      <button class="action-btn" id="reject-btn">Rechazar</button>
      <button class="action-btn" id="approve-btn">Aprobar</button>
    </div>
    <div id="state-message">Cargando...</div>
  </div>

  <div id="tab-calendar">
    <div id="status-filter-row"></div>
    <div id="cal-state-message">Cargando...</div>
    <div id="cal-list"></div>
  </div>
</main>

<div id="schedule-overlay" role="dialog" aria-modal="true">
  <div id="schedule-sheet">
    <h2>Programar publicacion</h2>
    <input type="datetime-local" id="schedule-input" />
    <div class="sheet-row">
      <button id="schedule-cancel">Cancelar</button>
      <button id="schedule-confirm">Confirmar</button>
    </div>
  </div>
</div>

<div id="edit-overlay" role="dialog" aria-modal="true">
  <div id="edit-sheet">
    <h2>Editar publicacion</h2>
    <span class="edit-label">Caption</span>
    <textarea id="edit-caption"></textarea>
    <span class="edit-label">Fecha y hora</span>
    <input type="datetime-local" id="edit-scheduled-at" />
    <span class="edit-label">Plataforma</span>
    <select id="edit-platform">
      <option value="instagram">Instagram</option>
      <option value="facebook">Facebook</option>
      <option value="both">Instagram + Facebook</option>
    </select>
    <div class="edit-actions">
      <button id="edit-cancel">Cancelar</button>
      <button id="edit-save">Guardar</button>
    </div>
  </div>
</div>

<div id="toast" role="status" aria-live="polite"></div>

<script>
(function () {
  'use strict';

  var currentSlug = '${slug}';

  var posts = [];
  var currentIndex = 0;
  var token = '';
  var pendingApproveId = null;
  var busy = false;
  var allPosts = [];
  var calFilter = 'all';
  var editingPostId = null;

  var cardContainer = document.getElementById('card-container');
  var actionRow = document.getElementById('action-row');
  var counter = document.getElementById('counter');
  var stateMsg = document.getElementById('state-message');
  var refreshBtn = document.getElementById('refresh-btn');
  var rejectBtn = document.getElementById('reject-btn');
  var approveBtn = document.getElementById('approve-btn');
  var overlay = document.getElementById('schedule-overlay');
  var scheduleInput = document.getElementById('schedule-input');
  var scheduleCancel = document.getElementById('schedule-cancel');
  var scheduleConfirm = document.getElementById('schedule-confirm');
  var calStateMsg = document.getElementById('cal-state-message');
  var calList = document.getElementById('cal-list');
  var statusFilterRow = document.getElementById('status-filter-row');
  var editOverlay = document.getElementById('edit-overlay');
  var editCaption = document.getElementById('edit-caption');
  var editScheduledAt = document.getElementById('edit-scheduled-at');
  var editPlatform = document.getElementById('edit-platform');
  var editCancel = document.getElementById('edit-cancel');
  var editSave = document.getElementById('edit-save');
  var tabBtnSwipe = document.getElementById('tab-btn-swipe');
  var tabBtnCalendar = document.getElementById('tab-btn-calendar');
  var tabSwipe = document.getElementById('tab-swipe');
  var tabCalendar = document.getElementById('tab-calendar');
  var productSelect = document.getElementById('product-select');
  var toast = document.getElementById('toast');

  var toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 3000);
  }

  function parseToken() {
    var hash = window.location.hash.slice(1);
    var params = new URLSearchParams(hash);
    return params.get('token') || '';
  }

  function authHeaders() {
    return { Authorization: 'Bearer ' + token };
  }

  // Product switch
  productSelect.addEventListener('change', function () {
    var newSlug = productSelect.value;
    window.location.href = '/accept/' + newSlug + window.location.hash;
  });

  // Tabs
  function switchTab(tab) {
    if (tab === 'swipe') {
      tabSwipe.style.display = '';
      tabCalendar.style.display = 'none';
      tabBtnSwipe.classList.add('active');
      tabBtnCalendar.classList.remove('active');
      counter.style.display = '';
    } else {
      tabSwipe.style.display = 'none';
      tabCalendar.style.display = '';
      tabBtnSwipe.classList.remove('active');
      tabBtnCalendar.classList.add('active');
      counter.style.display = 'none';
      loadAllPosts();
    }
  }

  tabBtnSwipe.addEventListener('click', function () { switchTab('swipe'); });
  tabBtnCalendar.addEventListener('click', function () { switchTab('calendar'); });

  // Swipe tab
  function updateCounter() {
    var remaining = posts.length - currentIndex;
    counter.textContent = remaining <= 0 ? '0 pendientes' : remaining + (remaining === 1 ? ' pendiente' : ' pendientes');
  }

  function buildCard(post) {
    var card = document.createElement('div');
    card.className = 'card';

    var img = document.createElement('img');
    img.className = 'card-image';
    img.alt = 'Post image';
    if (post.image_url) img.src = post.image_url;

    var body = document.createElement('div');
    body.className = 'card-body';

    var title = document.createElement('p');
    title.className = 'card-title';
    title.textContent = post.image_path ? post.image_path.split('/').pop().replace(/\\.[^.]+$/, '') : '(sin titulo)';

    var caption = document.createElement('p');
    caption.className = 'card-caption';
    caption.textContent = post.caption || '(caption se genera al aprobar)';

    var tags = document.createElement('div');
    tags.className = 'card-tags';

    [post.category, 'instagram', post.scheduled_at ? new Date(post.scheduled_at).toLocaleDateString('es-MX') : null].forEach(function (val) {
      if (!val) return;
      var tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = val;
      tags.appendChild(tag);
    });

    body.appendChild(title);
    body.appendChild(caption);
    body.appendChild(tags);
    card.appendChild(img);
    card.appendChild(body);
    return card;
  }

  function renderCurrent() {
    while (cardContainer.firstChild) cardContainer.removeChild(cardContainer.firstChild);

    if (currentIndex >= posts.length) {
      actionRow.style.display = 'none';
      stateMsg.style.display = '';
      stateMsg.textContent = posts.length === 0
        ? 'No hay posts pendientes. Presiona Escanear para buscar nuevas imagenes.'
        : 'Todo al dia. No quedan posts pendientes.';
      counter.textContent = '0 pendientes';
      return;
    }

    stateMsg.style.display = 'none';
    actionRow.style.display = '';
    cardContainer.appendChild(buildCard(posts[currentIndex]));
    updateCounter();
    rejectBtn.disabled = false;
    approveBtn.disabled = false;
  }

  function loadPosts() {
    stateMsg.style.display = '';
    stateMsg.textContent = 'Cargando...';
    actionRow.style.display = 'none';
    posts = [];
    currentIndex = 0;

    if (!token) {
      stateMsg.textContent = 'Token no encontrado. Abre el enlace con #token=xxx';
      return;
    }

    fetch('/api/pending/' + currentSlug, { headers: authHeaders() })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        posts = Array.isArray(data) ? data : [];
        renderCurrent();
      })
      .catch(function (err) {
        stateMsg.textContent = 'Error al cargar posts: ' + err.message;
      });
  }

  function animateCard(direction, callback) {
    var card = cardContainer.querySelector('.card');
    if (!card) { callback(); return; }
    card.classList.add(direction === 'left' ? 'swipe-left' : 'swipe-right');
    setTimeout(callback, 370);
  }

  function doReject() {
    if (busy || currentIndex >= posts.length) return;
    busy = true;
    rejectBtn.disabled = true;
    approveBtn.disabled = true;
    var post = posts[currentIndex];

    animateCard('left', function () {
      fetch('/api/pending/' + currentSlug + '/' + encodeURIComponent(post.id) + '/reject', {
        method: 'POST',
        headers: authHeaders(),
      })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); showToast('Post rechazado'); })
        .catch(function (err) { showToast('Error: ' + err.message); })
        .finally(function () { currentIndex++; busy = false; renderCurrent(); });
    });
  }

  function doApprove() {
    if (busy || currentIndex >= posts.length) return;
    pendingApproveId = posts[currentIndex].id;
    var now = new Date();
    now.setHours(10, 0, 0, 0);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    scheduleInput.value = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    overlay.classList.add('active');
    scheduleInput.focus();
  }

  function closeOverlay() { overlay.classList.remove('active'); pendingApproveId = null; }

  function confirmApprove() {
    if (!pendingApproveId) return;
    var rawVal = scheduleInput.value;
    if (!rawVal) { showToast('Selecciona una fecha y hora'); return; }
    var dt = new Date(rawVal);
    if (isNaN(dt.getTime())) { showToast('Fecha invalida'); return; }

    var scheduledAt = dt.toISOString();
    var id = pendingApproveId;
    busy = true;
    rejectBtn.disabled = true;
    approveBtn.disabled = true;
    overlay.classList.remove('active');
    pendingApproveId = null;

    animateCard('right', function () {
      fetch('/api/pending/' + currentSlug + '/' + encodeURIComponent(id) + '/approve', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ scheduled_at: scheduledAt }),
      })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); showToast('Post aprobado y programado'); })
        .catch(function (err) { showToast('Error: ' + err.message); })
        .finally(function () { currentIndex++; busy = false; renderCurrent(); });
    });
  }

  function doScan() {
    if (!token) { showToast('Token no encontrado'); return; }
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Escaneando...';

    fetch('/api/scan/' + currentSlug, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        showToast((data.new_images || 0) + ' nueva(s) imagen(es)');
        loadPosts();
      })
      .catch(function (err) { showToast('Error: ' + err.message); })
      .finally(function () { refreshBtn.disabled = false; refreshBtn.textContent = 'Escanear'; });
  }

  // Calendar tab
  var STATUS_FILTERS = ['all', 'pending_approval', 'approved', 'scheduled', 'published'];
  var STATUS_LABELS = { all: 'Todos', pending_approval: 'Pendiente', approved: 'Aprobado', scheduled: 'Programado', published: 'Publicado' };

  function buildFilterRow() {
    while (statusFilterRow.firstChild) statusFilterRow.removeChild(statusFilterRow.firstChild);
    STATUS_FILTERS.forEach(function (s) {
      var btn = document.createElement('button');
      btn.className = 'filter-btn' + (s === calFilter ? ' active' : '');
      btn.textContent = STATUS_LABELS[s] || s;
      btn.addEventListener('click', function () {
        calFilter = s;
        renderCalList();
        statusFilterRow.querySelectorAll('.filter-btn').forEach(function (b, i) {
          b.classList.toggle('active', STATUS_FILTERS[i] === calFilter);
        });
      });
      statusFilterRow.appendChild(btn);
    });
  }

  function formatDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return iso; }
  }

  function buildCalCard(post) {
    var card = document.createElement('div');
    card.className = 'cal-card';

    var thumb = document.createElement('img');
    thumb.className = 'cal-thumb';
    thumb.alt = '';
    if (post.image_url) thumb.src = post.image_url;

    var info = document.createElement('div');
    info.className = 'cal-info';

    var titleEl = document.createElement('div');
    titleEl.className = 'cal-title';
    titleEl.textContent = post.image_path ? post.image_path.split('/').pop().replace(/\\.[^.]+$/, '') : '(sin titulo)';

    var captionEl = document.createElement('div');
    captionEl.className = 'cal-caption-preview';
    captionEl.textContent = post.caption || '(sin caption)';

    var metaEl = document.createElement('div');
    metaEl.className = 'cal-meta';
    metaEl.textContent = formatDate(post.scheduled_at);

    info.appendChild(titleEl);
    info.appendChild(captionEl);
    info.appendChild(metaEl);

    var badge = document.createElement('span');
    badge.className = 'status-badge badge-' + (post.status || 'pending_approval');
    badge.textContent = STATUS_LABELS[post.status] || post.status || '';

    card.appendChild(thumb);
    card.appendChild(info);
    card.appendChild(badge);

    var editableStatuses = ['pending_approval', 'approved', 'scheduled'];
    if (editableStatuses.indexOf(post.status) !== -1) {
      card.addEventListener('click', function () { openEditOverlay(post); });
    }

    return card;
  }

  function renderCalList() {
    while (calList.firstChild) calList.removeChild(calList.firstChild);
    calStateMsg.style.display = 'none';

    var filtered = calFilter === 'all' ? allPosts : allPosts.filter(function (p) { return p.status === calFilter; });

    if (filtered.length === 0) {
      calStateMsg.style.display = '';
      calStateMsg.textContent = 'No hay posts para mostrar.';
      return;
    }

    filtered.forEach(function (post) { calList.appendChild(buildCalCard(post)); });
  }

  function loadAllPosts() {
    calStateMsg.style.display = '';
    calStateMsg.textContent = 'Cargando...';
    while (calList.firstChild) calList.removeChild(calList.firstChild);

    if (!token) { calStateMsg.textContent = 'Token no encontrado.'; return; }

    fetch('/api/pending/' + currentSlug + '/all', { headers: authHeaders() })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) { allPosts = Array.isArray(data) ? data : []; buildFilterRow(); renderCalList(); })
      .catch(function (err) { calStateMsg.textContent = 'Error: ' + err.message; });
  }

  // Edit overlay
  function toLocalDatetimeStr(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function openEditOverlay(post) {
    editingPostId = post.id;
    editCaption.value = post.caption || '';
    editScheduledAt.value = toLocalDatetimeStr(post.scheduled_at);
    editSave.disabled = false;
    editOverlay.classList.add('active');
    editCaption.focus();
  }

  function closeEditOverlay() { editOverlay.classList.remove('active'); editingPostId = null; }

  function saveEdit() {
    if (!editingPostId) return;
    editSave.disabled = true;
    var body = { caption: editCaption.value, platform: editPlatform.value };
    var rawDt = editScheduledAt.value;
    if (rawDt) { var dt = new Date(rawDt); if (!isNaN(dt.getTime())) body.scheduled_at = dt.toISOString(); }

    var id = editingPostId;

    fetch('/api/pending/' + currentSlug + '/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify(body),
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (res) {
        if (res && res.data) { for (var i = 0; i < allPosts.length; i++) { if (allPosts[i].id === id) { allPosts[i] = res.data; break; } } }
        showToast('Post actualizado');
        closeEditOverlay();
        renderCalList();
      })
      .catch(function (err) { showToast('Error: ' + err.message); editSave.disabled = false; });
  }

  // Event listeners
  rejectBtn.addEventListener('click', doReject);
  approveBtn.addEventListener('click', doApprove);
  refreshBtn.addEventListener('click', doScan);
  scheduleCancel.addEventListener('click', closeOverlay);
  scheduleConfirm.addEventListener('click', confirmApprove);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeOverlay(); });
  editCancel.addEventListener('click', closeEditOverlay);
  editSave.addEventListener('click', saveEdit);
  editOverlay.addEventListener('click', function (e) { if (e.target === editOverlay) closeEditOverlay(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeOverlay(); closeEditOverlay(); }
  });

  // Init
  token = parseToken();
  loadPosts();
  buildFilterRow();
})();
</script>
</body>
</html>`;
}

// Route: /accept/:slug — product-specific accept UI
acceptUi.get('/:slug', (c) => {
  const slug = c.req.param('slug');
  return c.html(buildHtml(slug));
});

// Route: /accept/ — default to demo
acceptUi.get('/', (c) => {
  return c.html(buildHtml('demo'));
});

export default acceptUi;
