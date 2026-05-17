import { fallbackNetworkData, loadNetworkData, layoutNetwork, renderNetworkSvg, summarizeNetwork } from './network.js';

const STORAGE_KEY = 'homelable-network-source';
const DEFAULT_SOURCE = './public/data/network-demo.json';

const state = {
  activeView: 'canvas',
  sidebarOpen: true,
  loading: true,
  error: '',
  data: fallbackNetworkData,
  sourceUrl: localStorage.getItem(STORAGE_KEY) || DEFAULT_SOURCE,
  fitTick: 0,
  canvas: {
    worldWidth: 2000,
    worldHeight: 1400,
    scale: 1.15,
    x: 0,
    y: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    initialized: false,
  },
};

const interaction = {
  dragging: false,
  pointerId: null,
  startClientX: 0,
  startClientY: 0,
  startX: 0,
  startY: 0,
};

const root = document.getElementById('app');

const viewConfig = {
  home: {
    title: 'Home',
    eyebrow: 'Dashboard',
    description: 'Een moderne startpagina voor jouw netwerktool met snelle statusinformatie en directe toegang tot de canvas.',
  },
  canvas: {
    title: 'Canvas',
    eyebrow: 'Network map',
    description: 'Laad JSON vanuit de core en teken automatisch een overzichtelijke netwerkstructuur.',
  },
  settings: {
    title: 'Settings',
    eyebrow: 'Configuratie',
    description: 'Wijs de frontend straks naar jouw core-endpoint of test nu met lokale demo-data.',
  },
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

async function init() {
  render();
  await refreshData();
  window.addEventListener('resize', () => render());
}

async function refreshData() {
  setState({ loading: true, error: '' });
  try {
    const data = await loadNetworkData(state.sourceUrl);
    setState({ data, loading: false });
    state.canvas.initialized = false;
  } catch (error) {
    setState({
      data: fallbackNetworkData,
      loading: false,
      error: error instanceof Error ? error.message : 'Kon netwerkdata niet laden.',
    });
  }
}

function updateSourceUrl(nextUrl) {
  state.sourceUrl = nextUrl.trim() || DEFAULT_SOURCE;
  localStorage.setItem(STORAGE_KEY, state.sourceUrl);
  refreshData();
}

function render() {
  const summary = summarizeNetwork(state.data);
  const content = buildContent(summary);
  root.innerHTML = `
    <div class="shell ${state.sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}">
      <aside class="sidebar">
        <div class="brand-row">
          <div class="brand-mark">⟡</div>
          <div>
            <div class="brand-name">Your Network</div>
            <div class="brand-subtitle">Network canvas</div>
          </div>
        </div>

        <nav class="nav-list" aria-label="Hoofdnavigatie">
          ${navItem('home', 'Home', 'Overzicht en status')}
          ${navItem('canvas', 'Canvas', 'JSON netwerkdiagram')}
          ${navItem('settings', 'Settings', 'Koppeling met core')}
        </nav>

        <section class="sidebar-card">
          <div class="sidebar-card-label">Netwerkstatus</div>
          <div class="sidebar-stat-grid">
            <div><span>Totaal</span><strong>${summary.totalNodes}</strong></div>
            <div><span>Online</span><strong class="online">${summary.onlineNodes}</strong></div>
            <div><span>Offline</span><strong class="offline">${summary.offlineNodes}</strong></div>
            <div><span>Links</span><strong>${summary.linkCount}</strong></div>
          </div>
        </section>
      </aside>

      <div class="overlay ${state.sidebarOpen ? 'visible' : ''}" data-close-sidebar="true"></div>

      <div class="main-area">
        <header class="topbar">
          <div class="topbar-left">
            <button class="icon-button" data-toggle-sidebar="true" aria-label="Open menu">
              <span></span><span></span><span></span>
            </button>
            <div>
              <div class="eyebrow">${viewConfig[state.activeView].eyebrow}</div>
              <h1>${viewConfig[state.activeView].title}</h1>
            </div>
          </div>
        </header>

        <main class="content-grid">
          ${content}
        </main>
      </div>
    </div>
  `;

  bindEvents(summary);
  renderDiagram(summary);
}

function navItem(view, label, subtitle) {
  const active = state.activeView === view ? 'active' : '';
  return `
    <button class="nav-item ${active}" data-view="${view}">
      <span class="nav-item-label">${label}</span>
      <span class="nav-item-subtitle">${subtitle}</span>
    </button>
  `;
}

function buildContent(summary) {
  const config = viewConfig[state.activeView];

  if (state.activeView === 'home') {
    return `
      <section class="hero card">
        <div>
          <div class="eyebrow">${config.eyebrow}</div>
          <h2>${config.title}</h2>
          <p>${config.description}</p>
          <div class="hero-actions">
            <button class="primary-button" data-view="canvas">Open canvas</button>
            <button class="secondary-button" data-view="settings">Configure source</button>
          </div>
        </div>
        <div class="hero-panel">
          <div class="hero-panel-header">
            <span>Live snapshot</span>
            <span class="pulse">•</span>
          </div>
          <div class="hero-panel-grid">
            <div><strong>${summary.totalNodes}</strong><span>Nodes</span></div>
            <div><strong>${summary.groupCount}</strong><span>Groups</span></div>
            <div><strong>${summary.onlineNodes}</strong><span>Online</span></div>
            <div><strong>${summary.maxDepth + 1}</strong><span>Layers</span></div>
          </div>
        </div>
      </section>

      <section class="card info-card">
        <h3>Wat deze frontend al doet</h3>
        <div class="info-grid">
          <article>
            <strong>JSON-ready</strong>
            <p>De canvas leest straks direct vanuit de core. Voor nu probeert hij eerst de ingestelde bron en valt daarna terug op demo-data.</p>
          </article>
          <article>
            <strong>Modern layout</strong>
            <p>Een rustige dark shell, glass cards en een duidelijke hiërarchie zorgen dat de interface direct bruikbaar voelt.</p>
          </article>
          <article>
            <strong>Ruimte voor groei</strong>
            <p>De data-laag ondersteunt nodes, links en groepen zodat je core later alleen nog JSON hoeft terug te geven.</p>
          </article>
        </div>
      </section>
    `;
  }

  if (state.activeView === 'settings') {
    return `
      <section class="card settings-card">
        <div class="section-header">
          <div>
            <div class="eyebrow">${config.eyebrow}</div>
            <h2>${config.title}</h2>
          </div>
          <p>${config.description}</p>
        </div>

        <div class="settings-grid">
          <label class="field">
            <span>Network JSON source</span>
            <input id="source-url" type="text" value="${escapeHtml(state.sourceUrl)}" placeholder="/api/network" />
          </label>

          <div class="settings-actions">
            <button class="primary-button" data-refresh="true">Reload JSON</button>
            <button class="secondary-button" data-reset-source="true">Use demo data</button>
          </div>
        </div>

        <div class="settings-note">
          <strong>Voor core-koppeling</strong>
          <p>Laat je core later een JSON-document leveren met nodes, links en optionele groepen. Deze frontend blijft daar direct mee werken zonder opnieuw te ontwerpen.</p>
        </div>

        <div class="source-preview">
          <div><span>Current source</span><strong>${escapeHtml(state.sourceUrl)}</strong></div>
          <div><span>Loaded nodes</span><strong>${summary.totalNodes}</strong></div>
          <div><span>Groups</span><strong>${summary.groupCount}</strong></div>
        </div>
      </section>
    `;
  }

  return `
    <section class="canvas-section card">
      <div class="section-header">
        <div>
          <div class="eyebrow">${config.eyebrow}</div>
          <h2>${config.title}</h2>
        </div>
        <p>${config.description}</p>
      </div>

      <div class="canvas-toolbar">
        <div class="toolbar-chip">Source: ${escapeHtml(state.sourceUrl)}</div>
        <div class="toolbar-actions">
          <div class="zoom-chip">Zoom <span data-zoom-level>100%</span></div>
          <button class="secondary-button" data-refresh="true">Refresh</button>
          <button class="secondary-button" data-fit="true">Re-fit</button>
        </div>
      </div>

      <div class="canvas-frame">
        <div class="canvas-loading ${state.loading ? 'visible' : ''}">Loading network JSON...</div>
        <div class="canvas-viewport" data-canvas-viewport="true">
          <div id="network-canvas" class="network-canvas" aria-label="Network canvas"></div>
        </div>
        <div class="canvas-hint">Sleep en beweeg om te pannen. Gebruik je muiswiel of trackpad om te zoomen.</div>
      </div>

      ${state.error ? `<div class="error-banner">${escapeHtml(state.error)}</div>` : ''}
    </section>
  `;
}

function bindEvents(summary) {
  root.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeView = button.dataset.view;
      render();
    });
  });

  const toggleButton = root.querySelector('[data-toggle-sidebar]');
  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
      state.sidebarOpen = !state.sidebarOpen;
      render();
    });
  }

  const overlay = root.querySelector('[data-close-sidebar]');
  if (overlay) {
    overlay.addEventListener('click', () => {
      state.sidebarOpen = false;
      render();
    });
  }

  const refreshButton = root.querySelector('[data-refresh]');
  if (refreshButton) {
    refreshButton.addEventListener('click', refreshData);
  }

  const resetButton = root.querySelector('[data-reset-source]');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      const input = root.querySelector('#source-url');
      if (input) {
        input.value = DEFAULT_SOURCE;
      }
      updateSourceUrl(DEFAULT_SOURCE);
    });
  }

  const sourceInput = root.querySelector('#source-url');
  if (sourceInput) {
    sourceInput.addEventListener('change', (event) => {
      updateSourceUrl(event.target.value);
    });
  }

  const fitButton = root.querySelector('[data-fit]');
  if (fitButton) {
    fitButton.addEventListener('click', () => {
      state.fitTick += 1;
      render();
    });
  }

}

function renderDiagram(summary) {
  const target = document.getElementById('network-canvas');
  if (!target) {
    return;
  }

  const viewport = target.parentElement;
  const viewportWidth = Math.max(640, viewport?.clientWidth ?? 960);
  const viewportHeight = Math.max(520, viewport?.clientHeight ?? 640);
  const worldWidth = Math.max(2000, Math.round(viewportWidth * 2.2));
  const worldHeight = Math.max(1400, Math.round(viewportHeight * 2.2));

  state.canvas = {
    ...state.canvas,
    worldWidth,
    worldHeight,
    viewportWidth,
    viewportHeight,
  };

  const layout = layoutNetwork(state.data, worldWidth, worldHeight, state.fitTick);
  if (!state.canvas.initialized) {
    const centeredScale = 1.12;
    const visibleWidth = worldWidth / centeredScale;
    const visibleHeight = worldHeight / centeredScale;
    state.canvas.scale = centeredScale;
    state.canvas.x = (worldWidth - visibleWidth) / 2;
    state.canvas.y = (worldHeight - visibleHeight) / 2;
    state.canvas.initialized = true;
  }

    target.innerHTML = renderNetworkSvg(layout, state.canvas);
  applyCanvasViewBox();
  bindCanvasEvents();
}

function bindCanvasEvents() {
  const viewport = root.querySelector('[data-canvas-viewport]');
  const svg = root.querySelector('#network-canvas svg');

  if (!viewport || !svg) {
    return;
  }

  viewport.addEventListener('pointerdown', handleCanvasPointerDown);
  viewport.addEventListener('pointermove', handleCanvasPointerMove);
  viewport.addEventListener('pointerup', handleCanvasPointerUp);
  viewport.addEventListener('pointercancel', handleCanvasPointerUp);
  viewport.addEventListener('pointerleave', handleCanvasPointerUp);
  viewport.addEventListener('wheel', handleCanvasWheel, { passive: false });
}

function handleCanvasPointerDown(event) {
  if (state.activeView !== 'canvas') {
    return;
  }

  const viewport = root.querySelector('[data-canvas-viewport]');
  if (!viewport) {
    return;
  }

  interaction.dragging = true;
  interaction.pointerId = event.pointerId;
  interaction.startClientX = event.clientX;
  interaction.startClientY = event.clientY;
  interaction.startX = state.canvas.x;
  interaction.startY = state.canvas.y;
  viewport.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function handleCanvasPointerMove(event) {
  if (!interaction.dragging || interaction.pointerId !== event.pointerId) {
    return;
  }

  const viewport = root.querySelector('[data-canvas-viewport]');
  if (!viewport) {
    return;
  }

  const rect = viewport.getBoundingClientRect();
  const visibleWidth = state.canvas.worldWidth / state.canvas.scale;
  const visibleHeight = state.canvas.worldHeight / state.canvas.scale;
  const deltaX = ((event.clientX - interaction.startClientX) / Math.max(rect.width, 1)) * visibleWidth;
  const deltaY = ((event.clientY - interaction.startClientY) / Math.max(rect.height, 1)) * visibleHeight;

  state.canvas.x = interaction.startX - deltaX;
  state.canvas.y = interaction.startY - deltaY;
  applyCanvasViewBox();
}

function handleCanvasPointerUp(event) {
  if (interaction.pointerId !== event.pointerId) {
    return;
  }

  interaction.dragging = false;
  interaction.pointerId = null;
}

function handleCanvasWheel(event) {
  if (state.activeView !== 'canvas') {
    return;
  }

  event.preventDefault();

  const viewport = root.querySelector('[data-canvas-viewport]');
  if (!viewport) {
    return;
  }

  const rect = viewport.getBoundingClientRect();
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;
  const previousVisibleWidth = state.canvas.worldWidth / state.canvas.scale;
  const previousVisibleHeight = state.canvas.worldHeight / state.canvas.scale;
  const worldX = state.canvas.x + (pointerX / Math.max(rect.width, 1)) * previousVisibleWidth;
  const worldY = state.canvas.y + (pointerY / Math.max(rect.height, 1)) * previousVisibleHeight;
  const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
  state.canvas.scale = clamp(state.canvas.scale * zoomFactor, 0.5, 2.8);

  const nextVisibleWidth = state.canvas.worldWidth / state.canvas.scale;
  const nextVisibleHeight = state.canvas.worldHeight / state.canvas.scale;
  state.canvas.x = worldX - (pointerX / Math.max(rect.width, 1)) * nextVisibleWidth;
  state.canvas.y = worldY - (pointerY / Math.max(rect.height, 1)) * nextVisibleHeight;
  applyCanvasViewBox();
}

function applyCanvasViewBox() {
  const svg = root.querySelector('#network-canvas svg');
  const zoomLabel = root.querySelector('[data-zoom-level]');
  if (!svg) {
    return;
  }

  const visibleWidth = state.canvas.worldWidth / state.canvas.scale;
  const visibleHeight = state.canvas.worldHeight / state.canvas.scale;

  if (visibleWidth >= state.canvas.worldWidth) {
    state.canvas.x = -(visibleWidth - state.canvas.worldWidth) / 2;
  } else {
    state.canvas.x = clamp(state.canvas.x, 0, state.canvas.worldWidth - visibleWidth);
  }

  if (visibleHeight >= state.canvas.worldHeight) {
    state.canvas.y = -(visibleHeight - state.canvas.worldHeight) / 2;
  } else {
    state.canvas.y = clamp(state.canvas.y, 0, state.canvas.worldHeight - visibleHeight);
  }

  svg.setAttribute('viewBox', `${state.canvas.x} ${state.canvas.y} ${visibleWidth} ${visibleHeight}`);
  svg.classList.toggle('is-dragging', interaction.dragging);

  if (zoomLabel) {
    zoomLabel.textContent = `${Math.round(state.canvas.scale * 100)}%`;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

init();
