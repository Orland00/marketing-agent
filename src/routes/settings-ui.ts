import { Hono } from 'hono';
import type { Env } from '../types.js';

const settingsUi = new Hono<{ Bindings: Env }>();

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>Marketing Settings</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0a0a0a;
      --surface: #151515;
      --surface2: #1e1e1e;
      --border: #2a2a2a;
      --text: #fafafa;
      --text-muted: #888;
      --connected: #44ff44;
      --connected-bg: #0a1f0a;
      --disconnected: #ff4444;
      --disconnected-bg: #1f0a0a;
      --accent: #3a7bfd;
      --accent-bg: #0a1533;
      --overlay-bg: rgba(0,0,0,0.85);
      --radius: 16px;
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
      max-width: 480px;
      padding: 20px 20px 0;
    }

    header h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 16px;
    }

    select {
      width: 100%;
      background: var(--surface2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 15px;
      font-family: var(--font);
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 14px center;
      cursor: pointer;
    }

    select:focus { outline: none; border-color: var(--accent); }

    main {
      width: 100%;
      max-width: 480px;
      padding: 20px 20px 60px;
      flex: 1;
    }

    /* --- Brand info card --- */
    .brand-card {
      background: var(--surface);
      border-radius: var(--radius);
      padding: 18px;
      margin-bottom: 20px;
    }

    .brand-card h2 {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 12px;
    }

    .brand-field {
      margin-bottom: 10px;
    }

    .brand-field:last-child { margin-bottom: 0; }

    .brand-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }

    .brand-value {
      font-size: 14px;
      color: var(--text);
      line-height: 1.4;
    }

    /* --- Platform section --- */
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 12px;
    }

    .platform-card {
      background: var(--surface);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .platform-icon {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
      background: var(--surface2);
    }

    .platform-info {
      flex: 1;
      min-width: 0;
    }

    .platform-name {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 3px;
    }

    .status-badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 20px;
      letter-spacing: 0.3px;
    }

    .status-badge.connected {
      background: var(--connected-bg);
      color: var(--connected);
    }

    .status-badge.disconnected {
      background: var(--disconnected-bg);
      color: var(--disconnected);
    }

    .platform-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    .btn {
      padding: 9px 16px;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-family: var(--font);
      font-weight: 600;
      cursor: pointer;
      transition: filter 0.15s, transform 0.1s;
    }

    .btn:active { transform: scale(0.96); filter: brightness(0.85); }
    .btn:disabled { opacity: 0.4; cursor: default; }

    .btn-connect {
      background: var(--accent-bg);
      color: var(--accent);
    }

    .btn-disconnect {
      background: var(--disconnected-bg);
      color: var(--disconnected);
    }

    /* --- Empty state --- */
    #empty-state {
      text-align: center;
      color: var(--text-muted);
      font-size: 15px;
      margin-top: 60px;
      line-height: 1.6;
    }

    /* --- Overlay --- */
    #connect-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: var(--overlay-bg);
      z-index: 100;
      align-items: flex-end;
      justify-content: center;
    }

    #connect-overlay.active { display: flex; }

    #connect-sheet {
      background: #1a1a1a;
      border-radius: 24px 24px 0 0;
      padding: 28px 20px 40px;
      width: 100%;
      max-width: 480px;
    }

    #connect-sheet h2 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 20px;
    }

    .form-group {
      margin-bottom: 14px;
    }

    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .form-input {
      width: 100%;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      font-size: 14px;
      font-family: var(--font);
      padding: 12px 14px;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .sheet-actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }

    #cancel-btn {
      flex: 1;
      padding: 14px;
      background: var(--surface2);
      color: var(--text);
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-family: var(--font);
      font-weight: 600;
      cursor: pointer;
    }

    #save-btn {
      flex: 2;
      padding: 14px;
      background: var(--accent-bg);
      color: var(--accent);
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-family: var(--font);
      font-weight: 700;
      cursor: pointer;
      transition: filter 0.15s;
    }

    #save-btn:active { filter: brightness(0.8); }
    #save-btn:disabled { opacity: 0.4; cursor: default; }

    /* --- Toast --- */
    #toast {
      position: fixed;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      background: var(--surface2);
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

    #toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  </style>
</head>
<body>

<header>
  <h1>Marketing Settings</h1>
  <select id="brand-select">
    <option value="">Seleccionar marca...</option>
  </select>
</header>

<main id="main-content">
  <div id="empty-state">Selecciona una marca para ver su configuracion.</div>
</main>

<div id="connect-overlay" role="dialog" aria-modal="true">
  <div id="connect-sheet">
    <h2 id="sheet-title">Conectar</h2>
    <div id="sheet-fields"></div>
    <div class="sheet-actions">
      <button id="cancel-btn">Cancelar</button>
      <button id="save-btn">Guardar</button>
    </div>
  </div>
</div>

<div id="toast" role="status" aria-live="polite"></div>

<script>
(function () {
  'use strict';

  var token = '';
  var currentSlug = '';
  var currentPlatform = '';
  var brands = [];

  // DOM refs
  var brandSelect = document.getElementById('brand-select');
  var mainContent = document.getElementById('main-content');
  var emptyState = document.getElementById('empty-state');
  var overlay = document.getElementById('connect-overlay');
  var sheetTitle = document.getElementById('sheet-title');
  var sheetFields = document.getElementById('sheet-fields');
  var cancelBtn = document.getElementById('cancel-btn');
  var saveBtn = document.getElementById('save-btn');
  var toast = document.getElementById('toast');

  // Toast
  var toastTimer = null;
  function showToast(msg, isError) {
    toast.textContent = msg;
    toast.style.background = isError ? '#2a0a0a' : '#1e1e1e';
    toast.style.color = isError ? '#ff4444' : '#fafafa';
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
    }, 3500);
  }

  // Auth
  function parseToken() {
    var hash = window.location.hash.slice(1);
    var params = new URLSearchParams(hash);
    return params.get('token') || '';
  }

  function authHeaders(extra) {
    var h = { 'Authorization': 'Bearer ' + token };
    if (extra) Object.assign(h, extra);
    return h;
  }

  // Load brand list
  function loadBrands() {
    if (!token) {
      emptyState.textContent = 'Token no encontrado. Abre el enlace con #token=xxx';
      return;
    }

    fetch('/api/settings', { headers: authHeaders() })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (body) {
        brands = body.data || [];
        // Clear and repopulate select
        while (brandSelect.options.length > 1) {
          brandSelect.remove(1);
        }
        brands.forEach(function (b) {
          var opt = document.createElement('option');
          opt.value = b.slug;
          opt.textContent = b.name;
          brandSelect.appendChild(opt);
        });
      })
      .catch(function (err) {
        showToast('Error cargando marcas: ' + err.message, true);
      });
  }

  // Load brand detail
  function loadBrandDetail(slug) {
    fetch('/api/settings/' + encodeURIComponent(slug), { headers: authHeaders() })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (body) {
        renderBrandDetail(body.data);
      })
      .catch(function (err) {
        showToast('Error cargando detalle: ' + err.message, true);
      });
  }

  // Safe text node helper
  function text(str) {
    return document.createTextNode(str == null ? '' : String(str));
  }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  // Render brand info + platform cards
  function renderBrandDetail(brand) {
    // Clear main
    while (mainContent.firstChild) {
      mainContent.removeChild(mainContent.firstChild);
    }

    // Brand info card
    var brandCard = el('div', 'brand-card');
    var cardTitle = el('h2');
    cardTitle.appendChild(text('Informacion de Marca'));
    brandCard.appendChild(cardTitle);

    var fields = [
      { label: 'Nombre', value: brand.name },
      { label: 'Voz de marca', value: brand.brand_voice },
      { label: 'Audiencia objetivo', value: brand.target_audience },
    ];

    fields.forEach(function (f) {
      var fieldDiv = el('div', 'brand-field');
      var labelDiv = el('div', 'brand-label');
      labelDiv.appendChild(text(f.label));
      var valueDiv = el('div', 'brand-value');
      valueDiv.appendChild(text(f.value || '—'));
      fieldDiv.appendChild(labelDiv);
      fieldDiv.appendChild(valueDiv);
      brandCard.appendChild(fieldDiv);
    });

    mainContent.appendChild(brandCard);

    // Platform connections
    var sectionTitle = el('p', 'section-title');
    sectionTitle.appendChild(text('Conexiones de Plataforma'));
    mainContent.appendChild(sectionTitle);

    var platforms = [
      { key: 'instagram', label: 'Instagram', icon: '\uD83D\uDCF8', connected: brand.has_instagram },
      { key: 'facebook', label: 'Facebook', icon: '\uD83D\uDC65', connected: brand.has_facebook },
      { key: 'twitter', label: 'Twitter / X', icon: '\uD83D\uDC26', connected: brand.has_twitter },
    ];

    platforms.forEach(function (p) {
      var card = el('div', 'platform-card');

      var icon = el('div', 'platform-icon');
      icon.appendChild(text(p.icon));

      var info = el('div', 'platform-info');
      var pName = el('div', 'platform-name');
      pName.appendChild(text(p.label));

      var badge = el('span', 'status-badge ' + (p.connected ? 'connected' : 'disconnected'));
      badge.appendChild(text(p.connected ? 'Conectado' : 'Desconectado'));

      info.appendChild(pName);
      info.appendChild(badge);

      var actions = el('div', 'platform-actions');

      var connectBtn = el('button', 'btn btn-connect');
      connectBtn.appendChild(text(p.connected ? 'Actualizar' : 'Conectar'));
      (function (platformKey) {
        connectBtn.addEventListener('click', function () {
          openConnectSheet(platformKey, p.label);
        });
      })(p.key);

      actions.appendChild(connectBtn);

      if (p.connected) {
        var disconnectBtn = el('button', 'btn btn-disconnect');
        disconnectBtn.appendChild(text('Desconectar'));
        (function (platformKey, badgeRef, actionsRef, connectBtnRef) {
          disconnectBtn.addEventListener('click', function () {
            if (!confirm('Desconectar ' + p.label + '?')) return;
            doDisconnect(platformKey, badgeRef, actionsRef, connectBtnRef);
          });
        })(p.key, badge, actions, connectBtn);
        actions.appendChild(disconnectBtn);
      }

      card.appendChild(icon);
      card.appendChild(info);
      card.appendChild(actions);
      mainContent.appendChild(card);
    });
  }

  // Open connect overlay
  function openConnectSheet(platformKey, platformLabel) {
    currentPlatform = platformKey;
    sheetTitle.textContent = '';
    sheetTitle.appendChild(text('Conectar ' + platformLabel));

    // Clear fields
    while (sheetFields.firstChild) {
      sheetFields.removeChild(sheetFields.firstChild);
    }

    if (platformKey === 'instagram' || platformKey === 'facebook') {
      addFormField(sheetFields, 'page_id', 'Page ID', 'text', 'ID de pagina');
      addFormField(sheetFields, 'access_token', 'Access Token', 'password', 'Token de acceso');
    } else if (platformKey === 'twitter') {
      addFormField(sheetFields, 'api_key', 'API Key', 'password', 'API Key');
      addFormField(sheetFields, 'api_secret', 'API Secret', 'password', 'API Secret');
      addFormField(sheetFields, 'access_token', 'Access Token', 'password', 'Access Token');
      addFormField(sheetFields, 'access_secret', 'Access Token Secret', 'password', 'Access Token Secret');
    }

    overlay.classList.add('active');
    var firstInput = sheetFields.querySelector('input');
    if (firstInput) firstInput.focus();
  }

  function addFormField(container, id, label, type, placeholder) {
    var group = el('div', 'form-group');
    var lbl = el('label', 'form-label');
    lbl.setAttribute('for', 'field-' + id);
    lbl.appendChild(text(label));
    var input = el('input', 'form-input');
    input.type = type;
    input.id = 'field-' + id;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    group.appendChild(lbl);
    group.appendChild(input);
    container.appendChild(group);
  }

  function closeOverlay() {
    overlay.classList.remove('active');
    currentPlatform = '';
  }

  // Get form value by id suffix
  function getField(id) {
    var el = document.getElementById('field-' + id);
    return el ? el.value.trim() : '';
  }

  // Save credentials
  function doSave() {
    if (!currentSlug || !currentPlatform) return;

    var body = { platform: currentPlatform };

    if (currentPlatform === 'instagram' || currentPlatform === 'facebook') {
      body.page_id = getField('page_id');
      body.access_token = getField('access_token');
      if (!body.access_token) {
        showToast('Access Token es requerido', true);
        return;
      }
    } else if (currentPlatform === 'twitter') {
      body.api_key = getField('api_key');
      body.api_secret = getField('api_secret');
      body.access_token = getField('access_token');
      body.access_secret = getField('access_secret');
      if (!body.api_key || !body.api_secret || !body.access_token || !body.access_secret) {
        showToast('Todos los campos de Twitter son requeridos', true);
        return;
      }
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    fetch('/api/settings/' + encodeURIComponent(currentSlug) + '/accounts', {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'HTTP ' + r.status); });
        return r.json();
      })
      .then(function () {
        showToast('Conectado exitosamente');
        closeOverlay();
        loadBrandDetail(currentSlug);
      })
      .catch(function (err) {
        showToast('Error: ' + err.message, true);
      })
      .finally(function () {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar';
      });
  }

  // Disconnect platform
  function doDisconnect(platformKey, badge, actionsDiv, connectBtn) {
    fetch('/api/settings/' + encodeURIComponent(currentSlug) + '/accounts/' + encodeURIComponent(platformKey), {
      method: 'DELETE',
      headers: authHeaders(),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'HTTP ' + r.status); });
        return r.json();
      })
      .then(function () {
        showToast('Desconectado exitosamente');
        loadBrandDetail(currentSlug);
      })
      .catch(function (err) {
        showToast('Error: ' + err.message, true);
      });
  }

  // Brand selection change
  brandSelect.addEventListener('change', function () {
    var slug = brandSelect.value;
    if (!slug) {
      while (mainContent.firstChild) {
        mainContent.removeChild(mainContent.firstChild);
      }
      mainContent.appendChild(emptyState);
      emptyState.textContent = 'Selecciona una marca para ver su configuracion.';
      currentSlug = '';
      return;
    }
    currentSlug = slug;
    loadBrandDetail(slug);
  });

  cancelBtn.addEventListener('click', closeOverlay);
  saveBtn.addEventListener('click', doSave);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeOverlay();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeOverlay();
  });

  // Init
  token = parseToken();
  loadBrands();
})();
</script>
</body>
</html>`;

settingsUi.get('/', (c) => c.html(html));

export default settingsUi;
