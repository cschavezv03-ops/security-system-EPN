/**
 * Calcula los descriptores faciales de una porción del banco de pares.
 *
 * Es el proceso que se lanza N veces en paralelo desde `calibrar.mjs`. Cada uno carga sus
 * propios modelos y se ocupa de una franja del índice, sin hablar con los demás: el trabajo es
 * paralelo puro, cada par es independiente de los otros.
 *
 * Por qué CPU en paralelo y no GPU: `@tensorflow/tfjs-node-gpu` se compila contra CUDA 11.8, y
 * una tarjeta Blackwell (RTX 50xx) necesita CUDA 12.8 o superior. Serían varios GB de toolkit
 * para acabar, con bastante probabilidad, en un binario que no arranca. Doce núcleos repartiendo
 * un trabajo que no tiene ninguna dependencia entre elementos dan el mismo resultado sin
 * instalar nada.
 *
 * Uso interno:  node calcular_descriptores.mjs <carpeta> <indiceParte> <totalPartes> <salida>
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import * as tf from '@tensorflow/tfjs';
import * as faceapi from '@vladmandic/face-api/dist/face-api.node-wasm.js';

const [carpeta, parteStr, totalStr, salida] = process.argv.slice(2);
const parte = Number(parteStr);
const total = Number(totalStr);

const RUTA_MODELOS = new URL('./modelos', import.meta.url).pathname;

await faceapi.tf.setBackend('cpu');
await faceapi.tf.ready();
await faceapi.nets.tinyFaceDetector.loadFromDisk(RUTA_MODELOS);
await faceapi.nets.faceLandmark68Net.loadFromDisk(RUTA_MODELOS);
await faceapi.nets.faceRecognitionNet.loadFromDisk(RUTA_MODELOS);

/** Convierte un JPEG en el tensor que espera face-api, sin dependencias nativas. */
async function tensorDesdeJpeg(ruta) {
  const crudo = await readFile(ruta);
  const { data, width, height } = jpeg.decode(crudo, { useTArray: true });
  const rgb = new Uint8Array((data.length / 4) * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return tf.tensor3d(rgb, [height, width, 3]);
}

const cache = new Map();

async function descriptorDe(nombre) {
  if (cache.has(nombre)) return cache.get(nombre);
  const tensor = await tensorDesdeJpeg(join(carpeta, nombre));
  try {
    const deteccion = await faceapi
      .detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();
    const valor = deteccion ? Array.from(deteccion.descriptor) : null;
    cache.set(nombre, valor);
    return valor;
  } finally {
    tensor.dispose();
  }
}

const distanciaL2 = (a, b) => {
  let suma = 0;
  for (let i = 0; i < a.length; i++) suma += (a[i] - b[i]) ** 2;
  return Math.sqrt(suma);
};

const indice = JSON.parse(await readFile(join(carpeta, 'indice.json'), 'utf8'));
const mios = indice.filter((_, i) => i % total === parte);

const resultados = [];
for (const [n, par] of mios.entries()) {
  const [a, b] = await Promise.all([descriptorDe(par.a), descriptorDe(par.b)]);
  resultados.push({
    mismaPersona: par.mismaPersona,
    distancia: a && b ? distanciaL2(a, b) : null,
  });
  if (parte === 0 && (n + 1) % 10 === 0) {
    process.stdout.write(`\r  proceso 0: ${n + 1}/${mios.length} (los otros ${total - 1} van a la par)`);
  }
}

await writeFile(salida, JSON.stringify(resultados));
