// popup.js — UI del popup. Controla la activación/desactivación y envía
// los valores de los sliders directamente al documento offscreen en tiempo real.

const DEFAULTS = {
  threshold: -30,
  ratio: 8,
  knee: 30,
  makeup: 1.4,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  noise: 0,
  pan: 0
};

let currentTabId = null;
let isActive = false;

const els = {
  toggleBtn: document.getElementById('toggleBtn'),
  status: document.getElementById('status'),
  controls: document.getElementById('controls'),
  threshold: document.getElementById('threshold'),
  thresholdVal: document.getElementById('thresholdVal'),
  ratio: document.getElementById('ratio'),
  ratioVal: document.getElementById('ratioVal'),
  makeup: document.getElementById('makeup'),
  makeupVal: document.getElementById('makeupVal'),
  eqLow: document.getElementById('eqLow'),
  eqLowVal: document.getElementById('eqLowVal'),
  eqMid: document.getElementById('eqMid'),
  eqMidVal: document.getElementById('eqMidVal'),
  eqHigh: document.getElementById('eqHigh'),
  eqHighVal: document.getElementById('eqHighVal'),
  noise: document.getElementById('noise'),
  noiseVal: document.getElementById('noiseVal'),
  pan: document.getElementById('pan'),
  panVal: document.getElementById('panVal'),
  resetBtn: document.getElementById('resetBtn')
};

function fmtPan(v) {
  v = parseFloat(v);
  if (Math.abs(v) < 0.02) return 'Centro';
  return v < 0 ? `Izq ${Math.round(Math.abs(v) * 100)}%` : `Der ${Math.round(v * 100)}%`;
}

function settingsKey() {
  return `settings_${currentTabId}`;
}

async function loadSettings() {
  const key = settingsKey();
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULTS, ...(stored[key] || {}) };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [settingsKey()]: settings });
}

function applySettingsToUI(settings) {
  els.threshold.value = settings.threshold;
  els.thresholdVal.textContent = `${settings.threshold} dB`;
  els.ratio.value = settings.ratio;
  els.ratioVal.textContent = `${settings.ratio}:1`;
  els.makeup.value = settings.makeup;
  els.makeupVal.textContent = `${Number(settings.makeup).toFixed(1)}x`;
  els.eqLow.value = settings.eqLow;
  els.eqLowVal.textContent = `${settings.eqLow} dB`;
  els.eqMid.value = settings.eqMid;
  els.eqMidVal.textContent = `${settings.eqMid} dB`;
  els.eqHigh.value = settings.eqHigh;
  els.eqHighVal.textContent = `${settings.eqHigh} dB`;
  els.noise.value = settings.noise;
  els.noiseVal.textContent = `${settings.noise}%`;
  els.pan.value = settings.pan;
  els.panVal.textContent = fmtPan(settings.pan);
}

function settingsToParams(settings) {
  return {
    threshold: settings.threshold,
    ratio: settings.ratio,
    knee: settings.knee,
    makeupGain: settings.makeup,
    eqLow: settings.eqLow,
    eqMid: settings.eqMid,
    eqHigh: settings.eqHigh,
    noiseReduction: settings.noise,
    pan: settings.pan
  };
}

function sendParamsUpdate(params) {
  // Se envía directo al offscreen document (más rápido para sliders en vivo).
  // Si la extensión está inactiva o el offscreen doc no existe, el mensaje
  // simplemente no encuentra destinatario y se ignora.
  chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'update-params',
    tabId: currentTabId,
    params
  }).catch(() => {});
}

function bindSlider(el, valEl, key, paramName, formatter) {
  el.addEventListener('input', async () => {
    const raw = parseFloat(el.value);
    valEl.textContent = formatter(raw);
    const settings = await loadSettings();
    settings[key] = raw;
    await saveSettings(settings);
    sendParamsUpdate({ [paramName]: raw });
  });
}

async function setActiveUI(active) {
  isActive = active;
  els.toggleBtn.textContent = active ? 'Desactivar' : 'Activar en esta pestaña';
  els.toggleBtn.classList.toggle('active', active);
  els.status.textContent = active ? 'Activo — procesando audio' : 'Inactivo';
  els.controls.classList.toggle('hidden', !active);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  currentTabId = tab.id;

  const statusResp = await chrome.runtime.sendMessage({
    target: 'background',
    type: 'get-status',
    tabId: currentTabId
  });
  await setActiveUI(statusResp?.active || false);

  const settings = await loadSettings();
  applySettingsToUI(settings);

  if (isActive) {
    // Re-sincroniza los parámetros actuales por si el offscreen doc se recreó.
    sendParamsUpdate(settingsToParams(settings));
  }
}

els.toggleBtn.addEventListener('click', async () => {
  els.toggleBtn.disabled = true;
  try {
    if (!isActive) {
      const resp = await chrome.runtime.sendMessage({
        target: 'background',
        type: 'start',
        tabId: currentTabId
      });
      if (resp?.ok) {
        await setActiveUI(true);
        const settings = await loadSettings();
        sendParamsUpdate(settingsToParams(settings));
      } else {
        alert('No se pudo activar el audio en esta pestaña: ' + (resp?.error || 'error desconocido'));
      }
    } else {
      await chrome.runtime.sendMessage({ target: 'background', type: 'stop', tabId: currentTabId });
      await setActiveUI(false);
    }
  } finally {
    els.toggleBtn.disabled = false;
  }
});

bindSlider(els.threshold, els.thresholdVal, 'threshold', 'threshold', (v) => `${v} dB`);
bindSlider(els.ratio, els.ratioVal, 'ratio', 'ratio', (v) => `${v}:1`);
bindSlider(els.makeup, els.makeupVal, 'makeup', 'makeupGain', (v) => `${v.toFixed(1)}x`);
bindSlider(els.eqLow, els.eqLowVal, 'eqLow', 'eqLow', (v) => `${v} dB`);
bindSlider(els.eqMid, els.eqMidVal, 'eqMid', 'eqMid', (v) => `${v} dB`);
bindSlider(els.eqHigh, els.eqHighVal, 'eqHigh', 'eqHigh', (v) => `${v} dB`);
bindSlider(els.noise, els.noiseVal, 'noise', 'noiseReduction', (v) => `${v}%`);
bindSlider(els.pan, els.panVal, 'pan', 'pan', (v) => fmtPan(v));

els.resetBtn.addEventListener('click', async () => {
  await saveSettings({ ...DEFAULTS });
  applySettingsToUI(DEFAULTS);
  sendParamsUpdate(settingsToParams(DEFAULTS));
});

init();
