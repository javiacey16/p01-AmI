# Ejercicios de TensorFlow.js

Ejercicios de visión por computador en el navegador con TensorFlow.js y modelos preentrenados.

## Contenido

| Carpeta | Descripción |
| --- | --- |
| [`biolerplate-AmI`](biolerplate-AmI) | Plantilla base: carga TensorFlow.js, permite elegir el backend y muestra un informe del entorno. |
| [`p01-t01-AmI`](p01-t01-AmI) | Clasificación de imágenes con MobileNet. |
| [`p01-t02-AmI`](p01-t02-AmI) | Detección de objetos en la webcam con COCO-SSD. |

## Ejercicios

### `p01-t01-AmI`: MobileNet

1. Mostrar las predicciones en la página.
2. Cambiar la imagen a clasificar mediante una URL. El servidor de la imagen debe permitir CORS.
3. Clasificar solo al pulsar un botón.
4. Comprobar qué backend se está usando.

### `p01-t02-AmI`: COCO-SSD

1. Configurar el umbral de confianza.
2. Filtrar las detecciones por clase.
3. Mostrar un historial con las últimas detecciones.
4. Cambiar de backend (WebGPU, WebGL o CPU) y medir el rendimiento.
5. Dibujar las detecciones en un canvas superpuesto al vídeo.
6. Observar el uso de memoria con y sin `frame.dispose()`.

## Cómo ejecutarlo

No hay que instalar dependencias ni compilar nada, porque las librerías se cargan desde un CDN. Solo hace falta conexión a internet y servir los archivos desde un servidor local, por ejemplo:

```bash
python -m http.server 8000
```

Después, abre la carpeta del ejercicio en el navegador, por ejemplo `http://localhost:8000/p01-t02-AmI/`. La webcam necesita un contexto seguro, y `localhost` lo es.

## Plantilla base

La plantilla permite elegir el backend desde la URL con el parámetro `backend`, que acepta `webgl`, `webgpu`, `wasm` o `cpu`:

```text
http://localhost:8000/biolerplate-AmI/?backend=wasm
```

## Tecnologías

- [TensorFlow.js](https://www.tensorflow.org/js) 4.22.0
- [MobileNet](https://github.com/tensorflow/tfjs-models/tree/master/mobilenet) 2.1.1
- [COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd) 2.2.3
