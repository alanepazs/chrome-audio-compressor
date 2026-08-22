# 🎚️ Chrome Audio Compressor

Extensión de Chrome (Manifest V3) que captura el audio de la pestaña activa y lo procesa **en tiempo real** con la Web Audio API: boost de volumen, reducción de ruido, ecualizador de 3 bandas, compresor nivelador de dinámica y paneo estéreo.

No requiere backend ni servicios externos: todo el procesamiento ocurre localmente, dentro del navegador.

![Demo de la interfaz](assets/demo.gif)

## ✨ Funcionalidades

- **Activación manual**: nunca se activa sola. Un botón en el popup ("Activar en esta pestaña") inicia la captura.
- **Boost de volumen**: amplifica el audio original hasta un 400%, útil para videos o pestañas con volumen muy bajo.
- **Reducción de ruido**: filtro pasa-bajos ajustable para atenuar soplidos y ruido blanco de fondo.
- **Ecualizador de 3 bandas** (Bajos / Medios / Agudos) con `BiquadFilterNode` (lowshelf, peaking, highshelf).
- **Compresor nivelador de dinámica** (estilo pedal de guitarra tipo Boss CS-3): aplasta los picos fuertes y levanta las señales débiles para emparejar el volumen general. Umbral, ratio y ganancia de compensación ajustables.
- **Paneo estéreo** izquierda/derecha.
- Interfaz minimalista con sliders, sin gráficos ni visualizadores complejos.
- Configuración persistente por pestaña (se guarda en `chrome.storage.local`).

## 🧠 Arquitectura

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

### Cadena de nodos de audio

```
Source → Gain (Boost de volumen, hasta 400%)
       → BiquadFilter (lowpass, reducción de ruido)
       → EQ 3 bandas (lowshelf / peaking / highshelf)
       → DynamicsCompressor + Ganancia de compensación
       → StereoPanner
       → destination
```

El boost de volumen va **antes** del compresor a propósito: si el usuario lo sube mucho, el compresor actúa como colchón y evita distorsión/clipping en vez de simplemente saturar la señal.

## 📂 Estructura del proyecto

| Archivo           | Rol                                                              |
|--------------------|-------------------------------------------------------------------|
| `manifest.json`    | Configuración de la extensión (Manifest V3) y permisos.          |
| `background.js`    | Service worker: gestiona el ciclo de vida de la captura.         |
| `offscreen.html/js`| Documento offscreen donde vive el `AudioContext` y la cadena DSP.|
| `popup.html/css/js`| Interfaz de usuario y controles (sliders).                       |

## 🚀 Instalación (modo desarrollador)

1. Cloná o descargá este repositorio.
2. Abrí `chrome://extensions` en Chrome.
3. Activá **Modo de desarrollador** (interruptor arriba a la derecha).
4. Hacé clic en **Cargar descomprimida** y seleccioná la carpeta del proyecto.
5. Abrí cualquier pestaña con audio (YouTube, un podcast, etc.), hacé clic en el ícono de la extensión y presioná **"Activar en esta pestaña"**.

## 🔧 Permisos usados

- `tabCapture`: capturar el audio de la pestaña activa.
- `offscreen`: crear el documento donde corre el `AudioContext`.
- `storage`: guardar el estado de activación y las preferencias del usuario.

## 🛣️ Roadmap

- [ ] Publicar en la Chrome Web Store.
- [ ] Presets rápidos (voz, música, podcast).
- [ ] Ícono e identidad visual propios.

## 📄 Licencia

[MIT](LICENSE) — hecho por [Alan](https://github.com/alanepazs) como parte de su portafolio mientras estudia la Tecnicatura en Ciencia de Datos.
