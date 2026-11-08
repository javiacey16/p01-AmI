const outputMessageEl = document.querySelector("#outputMessage");
const imgEl = document.querySelector("#img");
const imgUrlEl = document.querySelector("#imgUrl");
const btnLoadImg = document.querySelector("#btnLoadImg");
const btnClassify = document.querySelector("#btnClassify");
const resultsEl = document.querySelector("#results");

let model;

function initTFJS() {
  if (typeof tf === "undefined") {
    throw new Error("TensorFlow.js not loaded");
  }
}

// Ejercicio 1: mostrar las predicciones en la página
function showPredictions(predictions) {
  resultsEl.innerHTML = "";
  for (const p of predictions) {
    const li = document.createElement("li");
    li.innerText = `${p.className}: ${(p.probability * 100).toFixed(1)}%`;
    resultsEl.appendChild(li);
  }
  const best = predictions[0];
  outputMessageEl.innerText =
    `Prediction: ${best.className} (${(best.probability * 100).toFixed(1)}%)`;
}

// Ejercicio 3: clasificar solo al pulsar el botón
async function classifyImage() {
  btnClassify.disabled = true;
  outputMessageEl.innerText = "Classifying...";
  try {
    const result = await model.classify(imgEl);
    console.log(result);
    showPredictions(result);
  } catch (error) {
    console.error(error);
    outputMessageEl.innerText = `Classification failed: ${error.message}`;
  } finally {
    btnClassify.disabled = false;
  }
}

// Ejercicio 2: cambiar la imagen a clasificar
// La etiqueta img tiene el atributo crossorigin: el servidor de la imagen
// tiene que permitir CORS (Unsplash y Wikimedia lo permiten).
function changeImage() {
  const url = imgUrlEl.value.trim();
  if (!url) return;
  resultsEl.innerHTML = "";
  btnClassify.disabled = true;
  outputMessageEl.innerText = "Loading image...";
  imgEl.addEventListener(
    "load",
    () => {
      btnClassify.disabled = false;
      outputMessageEl.innerText = "Image loaded. Press Classify.";
    },
    { once: true }
  );
  imgEl.addEventListener(
    "error",
    () => {
      outputMessageEl.innerText =
        "Could not load the image. Check the URL and that the server allows CORS.";
    },
    { once: true }
  );
  imgEl.src = url;
}

async function app() {
  console.log("Waiting for MobileNet to load...");
  outputMessageEl.innerText = "Waiting for MobileNet to load...";

  // Load the model.
  model = await mobilenet.load();
  console.log("MobileNet loaded successfully");

  // Ejercicio 4: comprobar el backend
  await tf.ready();
  const backend = tf.getBackend();
  console.log(`TensorFlow.js backend: ${backend}`);

  outputMessageEl.innerText =
    `MobileNet loaded successfully (backend: ${backend}). Press Classify.`;
  btnClassify.disabled = false;
  btnClassify.addEventListener("click", classifyImage);
  btnLoadImg.addEventListener("click", changeImage);
}

(async function initApp() {
  try {
    initTFJS();
    await app();
  } catch (error) {
    console.error(error);
    if (outputMessageEl) {
      outputMessageEl.innerText = error.message;
    }
  }
})();
