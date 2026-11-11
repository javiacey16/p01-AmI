# Asistente del salón con COCO-SSD

Primera práctica: aplicación web que detecta en tiempo real los objetos de un salón con la webcam y muestra recordatorios. Usa el modelo preentrenado COCO-SSD de TensorFlow.js y se ejecuta por completo en el navegador.

**Demo:** <https://javiacey16.github.io/p01-AmI/p01-AmI/>

## Funcionalidades

### Detección de objetos de salón

De las 80 clases de COCO-SSD solo se muestran las propias de un salón: persona, mando, televisión, sofá, silla, portátil, móvil, libro, taza, copa, botella, mesa, planta, reloj, jarrón, teclado, ratón, gato, perro y peluche. El umbral de confianza se ajusta con un control deslizante (0.5 por defecto).

### ¿Dónde está el mando?

La aplicación recuerda la última posición en la que vio el mando. Si hay una persona en la escena y el mando lleva más de un minuto sin detectarse, muestra el aviso "El mando se vio por última vez hace X minutos" y dibuja un recuadro discontinuo en su última posición.

- **Detección buena:** el mando aparece en 3 de los últimos 10 fotogramas, con una puntuación mínima de 0.3.
- **Perdido:** 30 fotogramas seguidos sin detectarlo.

### Bebida cerca del portátil

Si una taza, copa o botella se solapa con un portátil o está muy próxima, muestra el aviso "Cuidado: tienes una bebida muy cerca del portátil." y resalta la bebida en rojo.

- **Umbral de proximidad:** el hueco entre las dos cajas es menor que el lado mayor de la caja de la bebida. Al ser relativo al tamaño de la bebida, no depende de la distancia a la cámara.

### Poca luz para leer (funcionalidad propia)

Si hay una persona con un libro y la imagen es oscura, muestra el aviso "Hay poca luz para leer. Enciende una lámpara."

- **Brillo:** media de la luminancia del fotograma (de 0 a 255), calculada sobre una copia de 32×24 píxeles y suavizada con una media móvil.
- **Umbral:** brillo por debajo de 120. Depende de la cámara y del salón, así que conviene calibrarlo.
- **Lectura:** persona y libro vistos en los últimos 5 segundos.

## Cómo ejecutarlo

No hay que instalar nada: las librerías se cargan desde un CDN. Desde la raíz del repositorio, arranca un servidor local:

```bash
python -m http.server 8000
```

Después abre `http://localhost:8000/p01-AmI/` y pulsa **Activar webcam**. La cámara necesita un contexto seguro: `localhost` o HTTPS.

## Parámetros

Los valores ajustables están al principio de cada bloque de [`index.js`](index.js):

| Objeto | Parámetro | Valor | Significado |
| --- | --- | --- | --- |
| `REMOTE` | `minScore` | 0.3 | Puntuación mínima de un candidato a mando |
| `REMOTE` | `windowSize` | 10 | Tamaño de la ventana de fotogramas (*n*) |
| `REMOTE` | `minHits` | 3 | Apariciones necesarias en la ventana (*k*) |
| `REMOTE` | `lostAfterFrames` | 30 | Fotogramas sin verlo para darlo por perdido |
| `REMOTE` | `alertAfterMs` | 60000 | Tiempo sin verlo para mostrar el aviso |
| `DRINK` | `proximityFactor` | 1.0 | Umbral = factor × lado mayor de la bebida |
| `DRINK` | `holdMs` | 1500 | Tiempo que se mantiene el aviso |
| `READING` | `darkBelow` | 120 | Brillo por debajo del cual hay poca luz |
| `READING` | `memoryMs` | 5000 | Memoria de persona y libro |

Para probar un valor sin editar el archivo, se puede cambiar desde la consola del navegador, por ejemplo `REMOTE.alertAfterMs = 5000`.

## Archivos

| Archivo | Contenido |
| --- | --- |
| [`index.html`](index.html) | Estructura de la página y carga de las librerías |
| [`style.css`](style.css) | Estilos de la interfaz |
| [`index.js`](index.js) | Detección, recordatorios y estadísticas |

## Tecnologías

- [TensorFlow.js](https://www.tensorflow.org/js) 4.22.0, con backend WebGPU, WebGL o CPU
- [COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd) 2.2.3
