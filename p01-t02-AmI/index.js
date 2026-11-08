const webcamEl = document.querySelector("#webcam");
const btnEnableWebcam = document.querySelector("#btnEnableWebcam");
const outputMessageEl = document.querySelector("#outputMessage");
const canvasEl = document.querySelector("#overlay");
const ctx = canvasEl.getContext("2d");
const thresholdEl = document.querySelector("#threshold");
const thresholdValueEl = document.querySelector("#thresholdValue");
const classFilterEl = document.querySelector("#classFilter");
const backendEl = document.querySelector("#backend");
const disposeFrameEl = document.querySelector("#disposeFrame");
const statsEl = document.querySelector("#stats");
const historyEl = document.querySelector("#history");

// Las 80 clases que reconoce COCO-SSD
const COCO_CLASSES = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
  "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
  "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
  "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
  "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
  "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup",
  "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
  "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
  "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
  "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
  "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
  "hair drier", "toothbrush",
];
const HISTORY_SIZE = 5;

let webcam;
let model;
let switchingBackend = false;
let fps = 0;
let previousClasses = new Set();
const history = [];

function getUserMediaSupported() {
  return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function initTFJS() {
  if (typeof tf === "undefined") {
    throw new Error("TensorFlow.js not loaded");
  }
}

// Ejercicio 1: umbral de confianza configurable
function getThreshold() {
  return parseFloat(thresholdEl.value);
}

// Ejercicio 2: filtrar por tipo de objeto
function populateClassFilter() {
  for (const c of [...COCO_CLASSES].sort()) {
    const option = document.createElement("option");
    option.value = c;
    option.innerText = c;
    classFilterEl.appendChild(option);
  }
}

function filterPredictions(predictions) {
  const threshold = getThreshold();
  const selectedClass = classFilterEl.value;
  return predictions.filter(
    (p) => p.score > threshold && (!selectedClass || p.class === selectedClass)
  );
}

// Ejercicio 3: historial de las últimas detecciones.
// Se añade una entrada cuando una clase aparece y no estaba en el fotograma anterior.
function updateHistory(predictions) {
  const currentClasses = new Set(predictions.map((p) => p.class));
  for (const p of predictions) {
    if (!previousClasses.has(p.class)) {
      history.unshift({
        time: new Date().toLocaleTimeString(),
        className: p.class,
        score: Math.round(p.score * 100),
      });
    }
  }
  history.length = Math.min(history.length, HISTORY_SIZE);
  previousClasses = currentClasses;

  historyEl.innerHTML = "";
  for (const h of history) {
    const li = document.createElement("li");
    li.innerText = `${h.time} - ${h.className} (${h.score}%)`;
    historyEl.appendChild(li);
  }
}

// Ejercicio 5: dibujar las detecciones en un canvas
function drawPredictions(predictions) {
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.lineWidth = 2;
  ctx.font = "14px helvetica, arial, sans-serif";
  for (const p of predictions) {
    const [x, y, w, h] = p.bbox;
    const label = `${p.class} ${Math.round(p.score * 100)}%`;

    ctx.strokeStyle = "#00ff00";
    ctx.strokeRect(x, y, w, h);

    const textWidth = ctx.measureText(label).width;
    const labelY = Math.max(y - 20, 0);
    ctx.fillStyle = "rgba(255, 111, 0, 0.85)";
    ctx.fillRect(x, labelY, textWidth + 8, 20);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x + 4, labelY + 15);
  }
}

// Ejercicios 4 y 6: rendimiento y memoria
function updateStats(detectMs, frameMs) {
  const currentFps = 1000 / frameMs;
  fps = fps ? 0.9 * fps + 0.1 * currentFps : currentFps; // media móvil
  statsEl.innerText =
    `Backend: ${tf.getBackend()} | FPS: ${fps.toFixed(1)} | ` +
    `detect(): ${detectMs.toFixed(1)} ms | Tensors: ${tf.memory().numTensors}`;
}

// Ejercicio 4: cambiar de backend
async function setBackend(name) {
  switchingBackend = true;
  await tf.ready(); // inicializa el backend por defecto si aún no hay ninguno
  const previous = tf.getBackend();
  try {
    const ok = await tf.setBackend(name);
    if (!ok) throw new Error(`Backend ${name} not available`);
    await tf.ready();
    console.log(`Backend: ${tf.getBackend()}`);
  } catch (error) {
    console.warn(error);
    outputMessageEl.innerText = `${name} is not available in this browser. Using ${previous}.`;
    await tf.setBackend(previous);
    await tf.ready();
    backendEl.value = previous;
  } finally {
    fps = 0;
    switchingBackend = false;
  }
}

async function app() {
  // Check for webcam support before proceeding
  if (!getUserMediaSupported()) {
    console.warn("getUserMedia() is not supported by your browser");
    outputMessageEl.innerText = "Webcam not supported by your browser.";
    return; // Exit if webcam is not supported
  }

  populateClassFilter();
  thresholdEl.addEventListener("input", () => {
    thresholdValueEl.innerText = getThreshold().toFixed(2);
  });
  backendEl.addEventListener("change", () => setBackend(backendEl.value));
  btnEnableWebcam.addEventListener("click", enableCam);

  // Ejercicio 4: empezar con WebGPU si está disponible
  await setBackend("webgpu");
  backendEl.value = tf.getBackend();

  await loadCocoSsdModel(); // Load the model if webcam support is confirmed
}

async function enableCam(event) {
  if (!model) return;

  event.target.classList.add("removed");
  try {
    webcam = await tf.data.webcam(webcamEl);
    outputMessageEl.innerText = "Webcam enabled! Detecting objects...";
    await predictWebcam();
  } catch (error) {
    console.error("Webcam access failed:", error);
    outputMessageEl.innerText = "Webcam access denied.";
  }
}

async function loadCocoSsdModel() {
  model = await cocoSsd.load();
  btnEnableWebcam.disabled = false;
  outputMessageEl.innerText = "Model loaded! Enable the webcam to start detection.";
}

async function predictWebcam() {
  let lastFrameTime = performance.now();

  while (true) {
    if (switchingBackend) {
      await tf.nextFrame();
      continue;
    }

    const frame = await webcam.capture();

    const t0 = performance.now();
    const predictions = await model.detect(frame);
    const detectMs = performance.now() - t0;

    const visible = filterPredictions(predictions);
    drawPredictions(visible);
    updateHistory(visible);

    // Ejercicio 6: si se desmarca la casilla, los tensores se acumulan en memoria
    if (disposeFrameEl.checked) {
      frame.dispose();
    }

    const now = performance.now();
    updateStats(detectMs, now - lastFrameTime);
    lastFrameTime = now;

    await tf.nextFrame();
  }
}

(async function initApp() {
  try {
    initTFJS();
    await app();
  } catch (error) {
    console.error(error);
    outputMessageEl.innerText = error.message;
  }
})();
