const TFJS_VERSION = "4.22.0";
const statusEl = document.querySelector("#status");

function show(message) {
  statusEl.textContent = message;
  console.log(message);
}

// Pick a backend with ?backend=webgl | webgpu | wasm | cpu (default: TF.js chooses)
async function setupTF() {
  if (typeof tf === "undefined") {
    throw new Error("TensorFlow.js not loaded (check the Network tab in DevTools)");
  }

  // The WASM backend needs to know where its .wasm binaries live
  tf.wasm?.setWasmPaths(
    `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${TFJS_VERSION}/dist/`
  );

  const requested = new URLSearchParams(location.search).get("backend");
  if (requested && !(await tf.setBackend(requested))) {
    console.warn(`Backend "${requested}" not available, using the default one`);
  }
  await tf.ready();
}

function environmentReport() {
  const yesNo = (value) => (value ? "yes" : "no");
  return [
    `TensorFlow.js ${tf.version.tfjs} · backend: ${tf.getBackend()}`,
    `Secure context (needed for camera/mic/sensors): ${yesNo(window.isSecureContext)}`,
    `WebGPU: ${yesNo("gpu" in navigator)} · WebNN: ${yesNo("ml" in navigator)}`,
    `Cross-origin isolated (multithreaded Wasm): ${yesNo(window.crossOriginIsolated)}`,
  ].join("\n");
}

async function app() {
  // Application code here: load a model, start the camera, run inference...
}

try {
  await setupTF();
  show(environmentReport());
  await app();
} catch (error) {
  console.error(error);
  show(`Error: ${error.message}`);
}
