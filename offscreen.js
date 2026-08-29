// offscreen.js — aquí vive el AudioContext real.
//
// Cadena de nodos por pestaña:
//   MediaStreamSource -> VolumeBoost -> NoiseFilter(lowpass) -> EQ(low/mid/high) -> Compressor
//     -> MakeupGain -> StereoPanner -> [Dry/Mono mix] -> OutputGain (volumen fino) -> destination
//
// El bloque Dry/Mono mantiene dos caminos en paralelo (estéreo original y una
// mezcla mono de L+R) y cruza entre ellos con dos ganancias (dryGain/monoWetGain)
// para poder activar/desactivar "Mono" sin clics.
//
// Se admite más de una pestaña activa simultáneamente (Map por tabId),
// aunque la UI del popup solo controla la pestaña actualmente enfocada.

const sessions = new Map(); // tabId -> { stream, audioContext, source, nodes }

function buildGraph(stream) {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);

  // 0) Boost de volumen: amplifica la señal original por encima del 100% (hasta 400%).
  //    Va primero en la cadena para que el Compresor actúe como colchón y evite
  //    distorsión/clipping cuando se sube mucho.
  const volumeBoost = audioContext.createGain();
  volumeBoost.gain.value = 1; // 1 = 100% = volumen original, sin cambios

  // 1) Reducción de ruido: filtro pasa-bajos que atenúa soplidos / ruido blanco de alta frecuencia.
  const noiseFilter = audioContext.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 20000; // 20000Hz = sin reducción (todo pasa)
  noiseFilter.Q.value = 0.707;

  // 2) Ecualizador de 3 bandas
  const eqLow = audioContext.createBiquadFilter();
  eqLow.type = 'lowshelf';
  eqLow.frequency.value = 320;
  eqLow.gain.value = 0;

  const eqMid = audioContext.createBiquadFilter();
  eqMid.type = 'peaking';
  eqMid.frequency.value = 1000;
  eqMid.Q.value = 0.7;
  eqMid.gain.value = 0;

  const eqHigh = audioContext.createBiquadFilter();
  eqHigh.type = 'highshelf';
  eqHigh.frequency.value = 3200;
  eqHigh.gain.value = 0;

  // 3) Compresor — nivelador de dinámica (estilo pedal Boss CS-3):
  //    aplasta picos fuertes, levanta señales débiles vía ganancia de compensación.
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -30;
  compressor.knee.value = 30;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  const makeupGain = audioContext.createGain();
  makeupGain.gain.value = 1.4;

  // 4) Paneo estéreo
  const panner = audioContext.createStereoPanner();
  panner.pan.value = 0;

  // 5) Mono: downmix L+R a un solo canal, duplicado en ambos parlantes.
  //    Se mezcla en paralelo con la señal estéreo original (dryGain) y se
  //    cruza entre ambas con dryGain/monoWetGain para activar/desactivar sin clics.
  const splitter = audioContext.createChannelSplitter(2);
  const monoSumL = audioContext.createGain();
  monoSumL.gain.value = 0.5;
  const monoSumR = audioContext.createGain();
  monoSumR.gain.value = 0.5;
  const monoSum = audioContext.createGain();
  const monoMerger = audioContext.createChannelMerger(2);
  const monoWetGain = audioContext.createGain();
  monoWetGain.gain.value = 0; // 0 = mono desactivado (pasa la señal dry)

  const dryGain = audioContext.createGain();
  dryGain.gain.value = 1; // 1 = estéreo original (mono desactivado)

  const mixOut = audioContext.createGain(); // suma dry + mono

  // 6) Volumen fino de salida: atenúa por debajo del mínimo que permite el
  //    reproductor de turno, sin llegar nunca a silencio total (mínimo 1%).
  const outputGain = audioContext.createGain();
  outputGain.gain.value = 1;

  source.connect(volumeBoost);
  volumeBoost.connect(noiseFilter);
  noiseFilter.connect(eqLow);
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);
  eqHigh.connect(compressor);
  compressor.connect(makeupGain);
  makeupGain.connect(panner);

  panner.connect(dryGain);
  panner.connect(splitter);
  splitter.connect(monoSumL, 0);
  splitter.connect(monoSumR, 1);
  monoSumL.connect(monoSum);
  monoSumR.connect(monoSum);
  monoSum.connect(monoMerger, 0, 0);
  monoSum.connect(monoMerger, 0, 1);
  monoMerger.connect(monoWetGain);

  dryGain.connect(mixOut);
  monoWetGain.connect(mixOut);
  mixOut.connect(outputGain);
  outputGain.connect(audioContext.destination);

  return {
    audioContext,
    source,
    nodes: {
      volumeBoost, noiseFilter, eqLow, eqMid, eqHigh, compressor, makeupGain, panner,
      dryGain, monoWetGain, outputGain
    }
  };
}

async function startCapture(tabId, streamId) {
  if (sessions.has(tabId)) {
    await stopCapture(tabId);
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  const graph = buildGraph(stream);
  sessions.set(tabId, { stream, ...graph });
}

async function stopCapture(tabId) {
  const session = sessions.get(tabId);
  if (!session) return;

  try {
    session.source.disconnect();
    session.stream.getTracks().forEach((track) => track.stop());
    await session.audioContext.close();
  } catch (e) {
    console.warn('[offscreen] Error al detener la captura:', e);
  }

  sessions.delete(tabId);
}

// Mapea 0-100 (intensidad de reducción de ruido) a una frecuencia de corte del lowpass.
// 0   -> 20000Hz (sin reducción, pasa todo el rango audible)
// 100 -> 2000Hz  (reducción fuerte, corta agudos/soplido)
function noiseAmountToFrequency(amount) {
  const MIN_FREQ = 2000;
  const MAX_FREQ = 20000;
  const clamped = Math.min(100, Math.max(0, amount));
  return MAX_FREQ - (clamped / 100) * (MAX_FREQ - MIN_FREQ);
}

function updateParams(tabId, params) {
  const session = sessions.get(tabId);
  if (!session) return;

  const {
    volumeBoost, noiseFilter, eqLow, eqMid, eqHigh, compressor, makeupGain, panner,
    dryGain, monoWetGain, outputGain
  } = session.nodes;
  const now = session.audioContext.currentTime;
  const smoothing = 0.01; // evita clics al mover los sliders

  if (params.volumeBoost !== undefined) {
    volumeBoost.gain.setTargetAtTime(params.volumeBoost, now, smoothing);
  }
  if (params.noiseReduction !== undefined) {
    noiseFilter.frequency.setTargetAtTime(noiseAmountToFrequency(params.noiseReduction), now, smoothing);
  }
  if (params.eqLow !== undefined) eqLow.gain.setTargetAtTime(params.eqLow, now, smoothing);
  if (params.eqMid !== undefined) eqMid.gain.setTargetAtTime(params.eqMid, now, smoothing);
  if (params.eqHigh !== undefined) eqHigh.gain.setTargetAtTime(params.eqHigh, now, smoothing);
  if (params.threshold !== undefined) compressor.threshold.setTargetAtTime(params.threshold, now, smoothing);
  if (params.ratio !== undefined) compressor.ratio.setTargetAtTime(params.ratio, now, smoothing);
  if (params.knee !== undefined) compressor.knee.setTargetAtTime(params.knee, now, smoothing);
  if (params.makeupGain !== undefined) makeupGain.gain.setTargetAtTime(params.makeupGain, now, smoothing);
  if (params.pan !== undefined) panner.pan.setTargetAtTime(params.pan, now, smoothing);
  if (params.mono !== undefined) {
    dryGain.gain.setTargetAtTime(params.mono ? 0 : 1, now, smoothing);
    monoWetGain.gain.setTargetAtTime(params.mono ? 1 : 0, now, smoothing);
  }
  if (params.outputGain !== undefined) {
    outputGain.gain.setTargetAtTime(params.outputGain, now, smoothing);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  (async () => {
    switch (message.type) {
      case 'start-capture':
        try {
          await startCapture(message.tabId, message.streamId);
          sendResponse({ ok: true });
        } catch (e) {
          console.error('[offscreen] start-capture falló:', e);
          sendResponse({ ok: false, error: e.message });
        }
        break;
      case 'stop-capture':
        await stopCapture(message.tabId);
        sendResponse({ ok: true });
        break;
      case 'update-params':
        updateParams(message.tabId, message.params);
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ ok: false, error: 'Tipo de mensaje desconocido' });
    }
  })();

  return true;
});
