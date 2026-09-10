<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Chrome Audio Compressor icon" />
</p>

<h1 align="center">🎚️ Chrome Audio Compressor</h1>

<p align="center">
  <b>🌐 Elegí idioma / Choose your language:</b><br>
  <a href="#-español"><b>🇪🇸 Español</b></a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="#-english"><b>🇬🇧 English</b></a>
</p>

<p align="center">
  <img src="assets/demo.gif" width="360" alt="Demo / interface preview" />
</p>

---

<a id="-español"></a>

## 🇪🇸 Español

> 🇬🇧 Prefer English? [Jump to the English version](#-english).

Extensión de Chrome (Manifest V3) que captura el audio de la pestaña activa y lo procesa **en tiempo real** con la Web Audio API: boost de volumen, reducción de ruido, ecualizador de 3 bandas, compresor nivelador de dinámica, paneo estéreo, **mezcla a mono** y **control de volumen fino** para bajar por debajo de lo que permite el reproductor.

No requiere backend ni servicios externos: todo el procesamiento ocurre localmente, dentro del navegador.

### ✨ Funcionalidades

- **Activación manual**: nunca se activa sola. Un botón en el popup ("Activar en esta pestaña") inicia la captura.
- **Boost de volumen**: amplifica el audio original hasta un 400%, útil para videos o pestañas con volumen muy bajo.
- **Volumen fino**: atenúa la señal por debajo del mínimo del reproductor de turno (hasta 1%), **sin llegar nunca al silencio absoluto**.
- **Mono**: mezcla los canales L+R en una señal mono (útil con auriculares cuando una grabación tiene el audio cargado a un solo lado). Se activa/desactiva sin clics.
- **Reducción de ruido**: filtro pasa-bajos ajustable para atenuar soplidos y ruido blanco de fondo.
- **Ecualizador de 3 bandas** (Bajos / Medios / Agudos) con `BiquadFilterNode` (lowshelf, peaking, highshelf).
- **Compresor nivelador de dinámica** (estilo pedal de guitarra tipo Boss CS-3): aplasta los picos fuertes y levanta las señales débiles para emparejar el volumen general. Umbral, ratio y ganancia de compensación ajustables.
- **Paneo estéreo** izquierda/derecha.
- Interfaz minimalista con sliders, sin gráficos ni visualizadores complejos.
- Configuración persistente por pestaña (se guarda en `chrome.storage.local`).

### 🧠 Arquitectura

Manifest V3 no permite usar `AudioContext` (Web Audio API) dentro del *service worker*, así que el procesamiento real vive en un **documento offscreen**:

```
popup.js  ──▶  background.js (service worker)  ──▶  offscreen.js (AudioContext real)
  UI            orquesta la captura                   captura + cadena de nodos de audio
```

1. El popup pide activar la captura para la pestaña actual.
2. `background.js` crea un documento *offscreen* y obtiene un `streamId` con `chrome.tabCapture.getMediaStreamId()`.
3. `offscreen.js` usa ese `streamId` con `getUserMedia()` para obtener el `MediaStream` de audio de la pestaña y arma la cadena de nodos de Web Audio.
4. Chrome silencia automáticamente el audio original de la pestaña capturada, así que lo único que se escucha es la señal ya procesada, sin eco ni duplicados.
5. Los sliders del popup envían los cambios directo al documento offscreen vía mensajes (`chrome.runtime.sendMessage`) para mínima latencia.

#### Cadena de nodos de audio

```
Source → Gain (Boost de volumen, hasta 400%)
       → BiquadFilter (lowpass, reducción de ruido)
       → EQ 3 bandas (lowshelf / peaking / highshelf)
       → DynamicsCompressor + Ganancia de compensación
       → StereoPanner
       → [mezcla Dry/Mono]  (cruce sin clics entre estéreo original y mono L+R)
       → OutputGain (volumen fino, nunca cero)
       → destination
```

El boost de volumen va **antes** del compresor a propósito: si el usuario lo sube mucho, el compresor actúa como colchón y evita distorsión/clipping en vez de simplemente saturar la señal.

### 📂 Estructura del proyecto

| Archivo             | Rol                                                                |
|----------------------|---------------------------------------------------------------------|
| `manifest.json`      | Configuración de la extensión (Manifest V3) y permisos.            |
| `background.js`      | Service worker: gestiona el ciclo de vida de la captura.           |
| `offscreen.html/js`  | Documento offscreen donde vive el `AudioContext` y la cadena DSP.  |
| `popup.html/css/js`  | Interfaz de usuario y controles (sliders).                         |
| `icons/`             | Ícono de la extensión (PNG en 16/32/48/128px + fuente vectorial `.svg`). |
| `scripts/generate_icon.py` | Script que genera el ícono a partir del SVG (ver abajo).      |

### 🎨 Ícono

El ícono es una pieza vectorial generada por código (no una foto ni un dibujo a mano): dos puños empujando un espectro de audio que se angosta justo donde se encuentran, con una paleta que no repite colores entre las manos (naranja/azul) y el espectro (magenta/verde lima).

[`scripts/generate_icon.py`](scripts/generate_icon.py) regenera la fuente vectorial ([`icons/icon.svg`](icons/icon.svg)) — útil para ajustar colores, tamaños o la curva del espectro sin editar SVG a mano:

```bash
python scripts/generate_icon.py
```

Los PNG (`icon16/32/48/128.png`) se rasterizan a partir de ese SVG (por ejemplo abriéndolo en el navegador y exportando, o con Chrome headless `--screenshot`).

### 🚀 Instalación (modo desarrollador)

1. Cloná o descargá este repositorio.
2. Abrí `chrome://extensions` en Chrome.
3. Activá **Modo de desarrollador** (interruptor arriba a la derecha).
4. Hacé clic en **Cargar descomprimida** y seleccioná la carpeta del proyecto.
5. Abrí cualquier pestaña con audio (YouTube, un podcast, etc.), hacé clic en el ícono de la extensión y presioná **"Activar en esta pestaña"**.

### 🔧 Permisos usados

- `tabCapture`: capturar el audio de la pestaña activa.
- `offscreen`: crear el documento donde corre el `AudioContext`.
- `storage`: guardar el estado de activación y las preferencias del usuario.

### 🛣️ Roadmap

- [ ] Publicar en la Chrome Web Store.
- [ ] Presets rápidos (voz, música, podcast).

### 📄 Licencia

[MIT](LICENSE) — hecho por [Alan](https://github.com/alanepazs) como parte de su portafolio mientras estudia la Tecnicatura en Ciencia de Datos.

---

<a id="-english"></a>

## 🇬🇧 English

> 🇪🇸 ¿Preferís español? [Ir a la versión en español](#-español).

Chrome extension (Manifest V3) that captures the active tab's audio and processes it **in real time** with the Web Audio API: volume boost, noise reduction, 3-band equalizer, dynamics-leveling compressor, stereo panning, **mono downmix** and a **fine volume control** to go lower than the player itself allows.

No backend, no external services: all processing happens locally, inside the browser.

### ✨ Features

- **Manual activation**: it never turns itself on. A button in the popup ("Activate on this tab") starts the capture.
- **Volume boost**: amplifies the original audio up to 400%, handy for videos or tabs with very low volume.
- **Fine volume**: attenuates the signal below the current player's own minimum (down to 1%), **without ever reaching absolute silence**.
- **Mono**: mixes the L+R channels into a single mono signal (useful on headphones when a recording is dumped entirely on one side). Toggles without clicks.
- **Noise reduction**: adjustable low-pass filter to tame hiss and background white noise.
- **3-band equalizer** (Bass / Mids / Treble) with `BiquadFilterNode` (lowshelf, peaking, highshelf).
- **Dynamics-leveling compressor** (guitar-pedal style, à la Boss CS-3): squashes loud peaks and lifts weak signals to even out the overall volume. Adjustable threshold, ratio and makeup gain.
- **Stereo panning** left/right.
- Minimalist slider interface, no complex graphs or visualizers.
- Per-tab persistent settings (stored in `chrome.storage.local`).

### 🧠 Architecture

Manifest V3 doesn't allow using `AudioContext` (Web Audio API) inside the *service worker*, so the actual processing lives in an **offscreen document**:

```
popup.js  ──▶  background.js (service worker)  ──▶  offscreen.js (real AudioContext)
  UI            orchestrates the capture               capture + audio node chain
```

1. The popup requests activating capture for the current tab.
2. `background.js` creates an *offscreen* document and gets a `streamId` via `chrome.tabCapture.getMediaStreamId()`.
3. `offscreen.js` uses that `streamId` with `getUserMedia()` to obtain the tab's audio `MediaStream` and builds the Web Audio node chain.
4. Chrome automatically mutes the captured tab's original audio, so the only thing you hear is the processed signal — no echo, no duplicates.
5. The popup sliders send changes straight to the offscreen document via messages (`chrome.runtime.sendMessage`) for minimal latency.

#### Audio node chain

```
Source → Gain (volume boost, up to 400%)
       → BiquadFilter (lowpass, noise reduction)
       → 3-band EQ (lowshelf / peaking / highshelf)
       → DynamicsCompressor + makeup gain
       → StereoPanner
       → [Dry/Mono mix]  (click-free crossfade between original stereo and L+R mono)
       → OutputGain (fine volume, never zero)
       → destination
```

The volume boost sits **before** the compressor on purpose: if the user pushes it hard, the compressor acts as a cushion and prevents distortion/clipping instead of just saturating the signal.

### 📂 Project structure

| File                | Role                                                               |
|----------------------|---------------------------------------------------------------------|
| `manifest.json`      | Extension configuration (Manifest V3) and permissions.             |
| `background.js`      | Service worker: manages the capture lifecycle.                     |
| `offscreen.html/js`  | Offscreen document where the `AudioContext` and DSP chain live.    |
| `popup.html/css/js`  | User interface and controls (sliders).                             |
| `icons/`             | Extension icon (PNG at 16/32/48/128px + vector source `.svg`).     |
| `scripts/generate_icon.py` | Script that generates the icon from the SVG (see below).     |

### 🎨 Icon

The icon is a code-generated vector piece (not a photo or a hand drawing): two fists pushing an audio spectrum that narrows right where they meet, with a palette that never repeats colors between the hands (orange/blue) and the spectrum (magenta/lime green).

[`scripts/generate_icon.py`](scripts/generate_icon.py) regenerates the vector source ([`icons/icon.svg`](icons/icon.svg)) — handy for tweaking colors, sizes or the spectrum curve without hand-editing SVG:

```bash
python scripts/generate_icon.py
```

The PNGs (`icon16/32/48/128.png`) are rasterized from that SVG (e.g. by opening it in the browser and exporting, or with headless Chrome `--screenshot`).

### 🚀 Installation (developer mode)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder.
5. Open any tab with audio (YouTube, a podcast, etc.), click the extension icon and hit **"Activate on this tab"**.

### 🔧 Permissions used

- `tabCapture`: capture the active tab's audio.
- `offscreen`: create the document where the `AudioContext` runs.
- `storage`: store the activation state and the user's preferences.

### 🛣️ Roadmap

- [ ] Publish on the Chrome Web Store.
- [ ] Quick presets (voice, music, podcast).

### 📄 License

[MIT](LICENSE) — built by [Alan](https://github.com/alanepazs) as part of his portfolio while studying the Data Science technical degree.
