// background.js — Service Worker (MV3)
//
// Responsabilidades:
//  1. Crear/cerrar el documento offscreen (donde vive el AudioContext real).
//  2. Obtener el streamId de la pestaña vía chrome.tabCapture.getMediaStreamId().
//  3. Llevar registro de qué pestañas tienen el audio activado (chrome.storage.session).
//  4. Limpiar la captura si el usuario cierra la pestaña.

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let creatingOffscreenPromise = null;

async function hasOffscreenDocument() {
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    return chrome.offscreen.hasDocument();
  }
  // Fallback para versiones de Chrome sin hasDocument()
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA'],
    justification:
      'Procesar y mejorar el audio capturado de la pestaña usando Web Audio API (AudioContext no está disponible en el service worker).'
  });

  try {
    await creatingOffscreenPromise;
  } finally {
    creatingOffscreenPromise = null;
  }
}

async function getActiveTabs() {
  const { activeTabs = [] } = await chrome.storage.session.get('activeTabs');
  return activeTabs;
}

async function setActiveTabs(tabs) {
  await chrome.storage.session.set({ activeTabs: tabs });
}

async function startCapture(tabId) {
  await ensureOffscreenDocument();

  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'start-capture',
    tabId,
    streamId
  });

  if (response && response.ok) {
    const tabs = await getActiveTabs();
    if (!tabs.includes(tabId)) tabs.push(tabId);
    await setActiveTabs(tabs);
    chrome.action.setBadgeText({ tabId, text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#22c55e' });
  }

  return response;
}

async function stopCapture(tabId) {
  let response = { ok: true };
  if (await hasOffscreenDocument()) {
    response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'stop-capture',
      tabId
    });
  }

  const tabs = (await getActiveTabs()).filter((id) => id !== tabId);
  await setActiveTabs(tabs);
  chrome.action.setBadgeText({ tabId, text: '' });

  if (tabs.length === 0 && (await hasOffscreenDocument())) {
    await chrome.offscreen.closeDocument();
  }

  return response;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'background') return; // no es para este contexto

  (async () => {
    switch (message.type) {
      case 'start': {
        sendResponse(await startCapture(message.tabId));
        break;
      }
      case 'stop': {
        sendResponse(await stopCapture(message.tabId));
        break;
      }
      case 'get-status': {
        const tabs = await getActiveTabs();
        sendResponse({ active: tabs.includes(message.tabId) });
        break;
      }
      default:
        sendResponse({ ok: false, error: 'Tipo de mensaje desconocido' });
    }
  })();

  return true; // mantiene el canal abierto para la respuesta async
});

// Si el usuario cierra la pestaña capturada, liberamos recursos.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabs = await getActiveTabs();
  if (tabs.includes(tabId)) {
    await stopCapture(tabId);
  }
});
