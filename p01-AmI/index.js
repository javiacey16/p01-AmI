const videoEl = document.querySelector("#webcam");
const canvasEl = document.querySelector("#overlay");
const ctx = canvasEl.getContext("2d");
const statusEl = document.querySelector("#status");
const statBackendEl = document.querySelector("#statBackend");
const statFpsEl = document.querySelector("#statFps");
const statDetectEl = document.querySelector("#statDetect");
const statBrightnessEl = document.querySelector("#statBrightness");
const btnStart = document.querySelector("#btnStart");
const backendEl = document.querySelector("#backend");
const thresholdEl = document.querySelector("#threshold");
const thresholdValueEl = document.querySelector("#thresholdValue");
const objectsEl = document.querySelector("#objects");
const alertsEl = document.querySelector("#alerts");
const remoteStateEl = document.querySelector("#remoteState");

const LIVING_ROOM_CLASSES = {
  person: "persona",
  remote: "mando",
  tv: "televisión",
  couch: "sofá",
  chair: "silla",
  laptop: "portátil",
  "cell phone": "móvil",
  book: "libro",
  cup: "taza",
  "wine glass": "copa",
  bottle: "botella",
  "dining table": "mesa",
  "potted plant": "planta",
  clock: "reloj",
  vase: "jarrón",
  keyboard: "teclado",
  mouse: "ratón",
  cat: "gato",
  dog: "perro",
  "teddy bear": "peluche",
};

// El modelo filtra internamente por esta puntuación mínima. La ponemos baja
// y aplicamos nuestro propio umbral (el slider) para poder experimentar.
const MODEL_MIN_SCORE = 0.2;
const MAX_BOXES = 20;

let model;
let running = false;
let switchingBackend = false;
let fps = 0;
let lastFrameTime = 0;

/**
 * Shows a message in the status line at the top of the page.
 * @param {string} message - Text to display.
 * @returns {void}
 */
function setStatus(message) {
  statusEl.textContent = message;
}

/**
 * Reads the confidence threshold currently selected in the slider.
 * @returns {number} Threshold between 0.2 and 0.9.
 */
function getThreshold() {
  return parseFloat(thresholdEl.value);
}

/**
 * Returns a fixed color for a class, so each kind of object is easy to
 * tell apart in the video. The same class always gets the same color.
 * @param {string} className - COCO-SSD class name (e.g. "remote").
 * @returns {string} CSS color in hsl() format.
 */
function colorFor(className) {
  let hash = 0;
  for (const ch of className) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${hash}, 85%, 50%)`;
}

/**
 * Keeps only the living-room objects whose score reaches the threshold.
 * @param {Array<{class: string, score: number, bbox: number[]}>} predictions
 *   Raw detections returned by model.detect().
 * @returns {Array<{class: string, score: number, bbox: number[]}>}
 *   Filtered detections.
 */
function filterLivingRoom(predictions) {
  const threshold = getThreshold();
  return predictions.filter(
    (p) => p.class in LIVING_ROOM_CLASSES && p.score >= threshold
  );
}

/**
 * Draws one rectangle with a text label on the canvas.
 * @param {number[]} bbox - Box as [x, y, width, height] in video pixels.
 * @param {string} label - Text shown above the box.
 * @param {string} color - CSS color of the box and the label background.
 * @param {boolean} [dashed=false] - Draw the border with a dashed line.
 * @returns {void}
 */
function drawBox([x, y, w, h], label, color, dashed = false) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  if (dashed) ctx.setLineDash([8, 6]);
  ctx.strokeRect(x, y, w, h);

  ctx.font = "16px helvetica, arial, sans-serif";
  const textWidth = ctx.measureText(label).width;
  const labelY = Math.max(y - 22, 0);
  ctx.fillStyle = color;
  ctx.fillRect(x, labelY, textWidth + 10, 22);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, x + 5, labelY + 16);
  ctx.restore();
}

/**
 * Draws a box for every detection, labelled with its Spanish name and score.
 * @param {Array<{class: string, score: number, bbox: number[]}>} predictions
 *   Detections already filtered by filterLivingRoom().
 * @returns {void}
 */
function drawPredictions(predictions) {
  for (const p of predictions) {
    const label = `${LIVING_ROOM_CLASSES[p.class]} ${Math.round(p.score * 100)}%`;
    drawBox(p.bbox, label, colorFor(p.class));
  }
}

/**
 * Updates the side panel with how many objects of each class are visible
 * in the current frame.
 * @param {Array<{class: string, score: number, bbox: number[]}>} predictions
 *   Detections already filtered by filterLivingRoom().
 * @returns {void}
 */
function updateObjectList(predictions) {
  const counts = {};
  for (const p of predictions) {
    counts[p.class] = (counts[p.class] || 0) + 1;
  }

  objectsEl.innerHTML = "";
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    objectsEl.innerHTML = '<li class="empty">Nada detectado</li>';
    return;
  }
  for (const [cls, n] of entries) {
    const li = document.createElement("li");
    li.style.borderLeftColor = colorFor(cls);
    li.textContent = `${LIVING_ROOM_CLASSES[cls]} (${cls})${n > 1 ? " × " + n : ""}`;
    objectsEl.appendChild(li);
  }
}

let lastAlertsKey = "";

/**
 * Shows the active alerts in the side panel. The page is only updated
 * when the alerts differ from the ones shown in the previous frame.
 * @param {string[]} alerts - Alert messages for the current frame.
 * @returns {void}
 */
function renderAlerts(alerts) {
  const key = alerts.join("|");
  if (key === lastAlertsKey) return;
  lastAlertsKey = key;

  alertsEl.innerHTML = "";
  if (alerts.length === 0) {
    alertsEl.innerHTML = '<li class="empty">Sin avisos</li>';
    return;
  }
  for (const text of alerts) {
    const li = document.createElement("li");
    li.className = "alert";
    li.textContent = text;
    alertsEl.appendChild(li);
  }
}

const REMOTE = {
  minScore: 0.3, // puntuación mínima de un candidato a mando
  windowSize: 10, // n: tamaño de la ventana de fotogramas
  minHits: 3, // k: apariciones necesarias dentro de la ventana
  lostAfterFrames: 30, // fotogramas seguidos sin verlo para darlo por perdido
  alertAfterMs: 60_000, // tiempo sin verlo para mostrar el aviso
  //alertAfterMs: 5000,
  personMemoryMs: 2_000, // la persona "sigue ahí" aunque falle algún fotograma
};

const remote = {
  window: [], // últimos fotogramas: true si había candidato a mando
  missedFrames: 0, // fotogramas seguidos sin candidato
  visible: false, // ¿lo consideramos a la vista ahora mismo?
  lastBox: null, // última posición confirmada [x, y, ancho, alto]
  lastSeen: 0, // momento de la última detección confirmada (ms)
};

let personLastSeen = 0;

/**
 * Converts a duration into a Spanish text in whole minutes (minimum 1).
 * @param {number} ms - Duration in milliseconds.
 * @returns {string} Text such as "1 minuto" or "3 minutos".
 */
function formatMinutes(ms) {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}

/**
 * Tracks the remote control frame by frame. Confirms a detection when the
 * remote appears in k of the last n frames, remembers its last position
 * and, if a person is present and the remote has been missing for more
 * than a minute, adds an alert and draws a dashed box at that position.
 * @param {Array<{class: string, score: number, bbox: number[]}>} predictions
 *   Raw detections returned by model.detect().
 * @param {Array<{class: string, score: number, bbox: number[]}>} visible
 *   Detections already filtered by filterLivingRoom().
 * @param {string[]} alerts - Alert list of the current frame; this function
 *   may add a message to it.
 * @returns {void} Results are stored in `remote` and added to `alerts`.
 */
function updateRemoteTracker(predictions, visible, alerts) {
  const now = Date.now();

  // 1. ¿Hay una persona en la escena?
  if (visible.some((p) => p.class === "person")) personLastSeen = now;
  const personPresent = now - personLastSeen < REMOTE.personMemoryMs;

  // 2. Mejor candidato a mando de este fotograma (si lo hay)
  const best = predictions
    .filter((p) => p.class === "remote" && p.score >= REMOTE.minScore)
    .sort((a, b) => b.score - a.score)[0];

  // 3. Ventana deslizante de los últimos n fotogramas
  remote.window.push(Boolean(best));
  if (remote.window.length > REMOTE.windowSize) remote.window.shift();
  const hits = remote.window.filter(Boolean).length;
  remote.missedFrames = best ? 0 : remote.missedFrames + 1;

  // 4. Detección confirmada (k de n) → guardamos posición y hora
  if (best && hits >= REMOTE.minHits) {
    remote.visible = true;
    remote.lastBox = best.bbox;
    remote.lastSeen = now;
    // Si su puntuación no supera el umbral general, lo dibujamos aquí
    if (best.score < getThreshold()) {
      drawBox(best.bbox, `mando ${Math.round(best.score * 100)}%`, colorFor("remote"));
    }
  } else if (remote.missedFrames >= REMOTE.lostAfterFrames) {
    remote.visible = false;
  }

  // 5. Estado en el panel y aviso
  const elapsed = now - remote.lastSeen;
  if (!remote.lastBox) {
    remoteStateEl.textContent = `Aún no se ha visto (${hits}/${REMOTE.minHits} apariciones)`;
  } else if (remote.visible) {
    remoteStateEl.textContent = "A la vista";
  } else {
    remoteStateEl.textContent = `Perdido desde hace ${Math.round(elapsed / 1000)} s`;
  }

  if (!remote.visible && remote.lastBox && personPresent && elapsed > REMOTE.alertAfterMs) {
    alerts.push(`El mando se vio por última vez hace ${formatMinutes(elapsed)}`);
    drawBox(remote.lastBox, "último mando visto", "#ff6f00", true);
  }
}

const DRINK_CLASSES = ["cup", "wine glass", "bottle"];
const DRINK = {
  proximityFactor: 1.0, // umbral = factor × lado mayor de la bebida
  holdMs: 1_500, // el aviso se mantiene este tiempo para que no parpadee
};
let drinkNearLastSeen = 0;

/**
 * Measures the empty space between the closest edges of two boxes.
 * @param {number[]} a - First box as [x, y, width, height].
 * @param {number[]} b - Second box as [x, y, width, height].
 * @returns {number} Gap in pixels; 0 if the boxes touch or overlap.
 */
function boxGap([ax, ay, aw, ah], [bx, by, bw, bh]) {
  const dx = Math.max(0, ax - (bx + bw), bx - (ax + aw));
  const dy = Math.max(0, ay - (by + bh), by - (ay + ah));
  return Math.hypot(dx, dy);
}

/**
 * Checks whether a cup, wine glass or bottle overlaps a laptop or is closer
 * to it than the drink's own size. If so, highlights the drink in red and
 * adds an alert, which is kept for a short time to avoid flickering.
 * @param {Array<{class: string, score: number, bbox: number[]}>} visible
 *   Detections already filtered by filterLivingRoom().
 * @param {string[]} alerts - Alert list of the current frame; this function
 *   may add a message to it.
 * @returns {void}
 */
function checkDrinkNearLaptop(visible, alerts) {
  const now = Date.now();
  const laptops = visible.filter((p) => p.class === "laptop");
  const drinks = visible.filter((p) => DRINK_CLASSES.includes(p.class));

  for (const drink of drinks) {
    const [, , w, h] = drink.bbox;
    const limit = DRINK.proximityFactor * Math.max(w, h);
    if (laptops.some((laptop) => boxGap(drink.bbox, laptop.bbox) < limit)) {
      drinkNearLastSeen = now;
      // Se resalta en rojo la bebida que provoca el aviso
      drawBox(drink.bbox, `${LIVING_ROOM_CLASSES[drink.class]} ¡cerca!`, "#d50000");
    }
  }

  if (drinkNearLastSeen && now - drinkNearLastSeen < DRINK.holdMs) {
    alerts.push("Cuidado: tienes una bebida muy cerca del portátil.");
  }
}

const READING = {
  darkBelow: 120, // brillo medio (0-255) por debajo del cual hay poca luz
  bookMinScore: 0.3, // puntuación mínima de un libro (con poca luz sale baja)
  memoryMs: 5_000, // persona y libro "siguen ahí" aunque fallen fotogramas
  smoothing: 0.9, // peso del valor anterior en la media móvil del brillo
};

// Canvas pequeño fuera de pantalla: basta para estimar el brillo medio
const lightCanvas = document.createElement("canvas");
lightCanvas.width = 32;
lightCanvas.height = 24;
const lightCtx = lightCanvas.getContext("2d", { willReadFrequently: true });

let brightness = null; // brillo suavizado; null hasta medir el primer fotograma
let bookLastSeen = 0;

/**
 * Measures the average brightness of an image by scaling it down to a
 * tiny canvas and averaging the luminance of its pixels.
 * @param {HTMLVideoElement|HTMLCanvasElement|HTMLImageElement} source
 *   Image to measure (normally the webcam video).
 * @returns {number} Average brightness from 0 (black) to 255 (white).
 */
function measureBrightness(source) {
  const { width, height } = lightCanvas;
  lightCtx.drawImage(source, 0, 0, width, height);
  const { data } = lightCtx.getImageData(0, 0, width, height);

  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    // Luminancia percibida: el ojo es más sensible al verde que al azul
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / (data.length / 4);
}

/**
 * Updates the smoothed brightness with the value of the current frame,
 * using a moving average so that a single odd frame does not matter.
 * @param {number} current - Brightness of the current frame (0-255).
 * @returns {number} Smoothed brightness (0-255), also stored in `brightness`.
 */
function updateBrightness(current) {
  brightness =
    brightness === null
      ? current
      : READING.smoothing * brightness + (1 - READING.smoothing) * current;
  return brightness;
}

/**
 * Checks whether someone is reading with poor light: a person and a book
 * were seen recently and the smoothed brightness is below the threshold.
 * If so, adds an alert suggesting to turn on a lamp.
 * @param {Array<{class: string, score: number, bbox: number[]}>} predictions
 *   Raw detections returned by model.detect().
 * @param {string[]} alerts - Alert list of the current frame; this function
 *   may add a message to it.
 * @returns {void}
 */
function checkLowLightReading(predictions, alerts) {
  const now = Date.now();

  if (predictions.some((p) => p.class === "book" && p.score >= READING.bookMinScore)) {
    bookLastSeen = now;
  }
  // personLastSeen lo actualiza updateRemoteTracker en cada fotograma
  const reading =
    now - personLastSeen < READING.memoryMs && now - bookLastSeen < READING.memoryMs;

  if (reading && brightness !== null && brightness < READING.darkBelow) {
    alerts.push("Hay poca luz para leer. Enciende una lámpara.");
  }
}

/**
 * Updates the performance line: backend in use, FPS (moving average),
 * how long the last detection took and the smoothed image brightness.
 * @param {number} detectMs - Duration of the last model.detect() call, in ms.
 * @returns {void}
 */
function updateStats(detectMs) {
  const now = performance.now();
  if (lastFrameTime) {
    const currentFps = 1000 / (now - lastFrameTime);
    fps = fps ? 0.9 * fps + 0.1 * currentFps : currentFps;
  }
  lastFrameTime = now;
  statBackendEl.textContent = tf.getBackend();
  statFpsEl.textContent = fps.toFixed(1);
  statDetectEl.textContent = `${detectMs.toFixed(0)} ms`;
  statBrightnessEl.textContent = brightness === null ? "-" : brightness.toFixed(0);
}

/**
 * Main loop. For each video frame it runs the model, filters the results,
 * draws them, checks the reminders and schedules itself for the next frame.
 * Takes no parameters; it stops when `running` is false.
 * @returns {Promise<void>}
 */
async function detectLoop() {
  if (!running) return;

  if (!switchingBackend && videoEl.readyState >= 2) {
    const t0 = performance.now();
    // Se le pasa el <video> directamente: coco-ssd crea y libera el tensor
    const predictions = await model.detect(videoEl, MAX_BOXES, MODEL_MIN_SCORE);
    const detectMs = performance.now() - t0;

    const visible = filterLivingRoom(predictions);

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    drawPredictions(visible);
    updateObjectList(visible);

    const alerts = [];
    updateRemoteTracker(predictions, visible, alerts);
    checkDrinkNearLaptop(visible, alerts);
    updateBrightness(measureBrightness(videoEl));
    checkLowLightReading(predictions, alerts);
    renderAlerts(alerts);
    updateStats(detectMs);
  }

  requestAnimationFrame(detectLoop);
}

/**
 * Asks for camera permission, connects the webcam to the <video> element,
 * resizes the canvas to match it and starts the detection loop.
 * Takes no parameters; on failure it shows the error in the status line.
 * @returns {Promise<void>}
 */
async function startWebcam() {
  btnStart.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    videoEl.srcObject = stream;
    await new Promise((resolve) => (videoEl.onloadeddata = resolve));

    // El canvas usa la resolución real del vídeo, así las cajas cuadran
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;

    btnStart.textContent = "Webcam activa";
    setStatus("Detectando objetos del salón…");
    running = true;
    detectLoop();
  } catch (error) {
    console.error(error);
    setStatus(`No se pudo acceder a la webcam: ${error.message}`);
    btnStart.disabled = false;
  }
}

/**
 * Switches the TensorFlow.js backend. If the requested one is not available
 * in this browser, it goes back to the previous backend. Detection is paused
 * while the switch is in progress.
 * @param {string} name - Backend to use: "webgpu", "webgl" or "cpu".
 * @returns {Promise<void>}
 */
async function setBackend(name) {
  switchingBackend = true;
  await tf.ready();
  const previous = tf.getBackend();
  try {
    if (!(await tf.setBackend(name))) throw new Error(`${name} no disponible`);
    await tf.ready();
  } catch (error) {
    console.warn(error);
    setStatus(`${name} no está disponible en este navegador. Se usa ${previous}.`);
    await tf.setBackend(previous);
    await tf.ready();
  } finally {
    backendEl.value = tf.getBackend();
    fps = 0;
    lastFrameTime = 0;
    switchingBackend = false;
  }
}

/**
 * Entry point. Checks that the libraries and the webcam API are available,
 * connects the controls to their functions, selects the backend and loads
 * the COCO-SSD model.
 * Takes no parameters.
 * @returns {Promise<void>}
 * @throws {Error} If TensorFlow.js, COCO-SSD or webcam support is missing.
 */
async function app() {
  if (typeof tf === "undefined" || typeof cocoSsd === "undefined") {
    throw new Error("No se han cargado TensorFlow.js o COCO-SSD");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador no permite usar la webcam");
  }

  thresholdEl.addEventListener("input", () => {
    thresholdValueEl.textContent = getThreshold().toFixed(2);
  });
  backendEl.addEventListener("change", () => setBackend(backendEl.value));
  btnStart.addEventListener("click", startWebcam);

  // Empezamos con WebGPU; si no hay, setBackend vuelve al anterior
  await setBackend("webgpu");

  model = await cocoSsd.load();
  setStatus(`Modelo cargado (backend: ${tf.getBackend()}). Activa la webcam.`);
  btnStart.disabled = false;
}

app().catch((error) => {
  console.error(error);
  setStatus(`Error: ${error.message}`);
});
