/**
 * ¿Puede Tesseract.js leer una placa de motocicleta ecuatoriana?
 *
 * La placa de moto lleva el código en DOS líneas, y el lector corre con
 * `tessedit_pageseg_mode = 7`, que le dice a Tesseract "esta imagen es una sola línea de
 * texto". Esta prueba compara ese modo con los que sí contemplan varias líneas, sobre el mismo
 * banco de imágenes, para decidir con datos y no por intuición.
 *
 *   PSM  6  — un bloque uniforme de texto
 *   PSM  7  — una sola línea (el que usa el sistema hoy)
 *  PSM 11  — texto disperso, sin orden concreto
 *  PSM 12  — texto disperso con orientación
 *
 * Uso:  node probar_motos.mjs <carpeta-del-banco> [maximo-por-condicion]
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { createWorker } from 'tesseract.js';
import { VARIANTES_OCR, aplicarVariante, corregirPlacaOcr, extraerPlacaDeTexto } from './placas.build.mjs';

const carpeta = process.argv[2];
const tope = Number(process.argv[3] ?? 0);
if (!carpeta) {
  console.error('Uso: node probar_motos.mjs <carpeta-del-banco> [maximo-por-condicion]');
  process.exit(1);
}

const MODOS = ['6', '7', '11', '12'];

function escalarA(png, anchoDestino) {
  const escala = anchoDestino / png.width;
  const alto = Math.max(1, Math.round(png.height * escala));
  const salida = new PNG({ width: anchoDestino, height: alto });
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < anchoDestino; x++) {
      const sx = Math.min(png.width - 1, Math.floor(x / escala));
      const sy = Math.min(png.height - 1, Math.floor(y / escala));
      const o = (png.width * sy + sx) << 2;
      const d = (anchoDestino * y + x) << 2;
      salida.data[d] = png.data[o];
      salida.data[d + 1] = png.data[o + 1];
      salida.data[d + 2] = png.data[o + 2];
      salida.data[d + 3] = 255;
    }
  }
  return salida;
}

const aDataUrl = (png) => 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');

/** Une las líneas del OCR y busca la placa en el resultado.
 *
 *  `extraerPlacaDeTexto` parte el texto por espacios y descarta los trozos de menos de seis
 *  caracteres. Con dos líneas, Tesseract devuelve "XLL" y "446" — dos trozos de tres, los dos
 *  descartados. Pegar las líneas antes de buscar es lo que hace falta para que un código
 *  repartido en dos renglones se vuelva a leer como uno solo. */
function extraerDeDosLineas(texto) {
  const directo = extraerPlacaDeTexto(texto);
  if (directo) return directo;

  const lineas = (texto || '')
    .toUpperCase()
    .split('\n')
    .map((l) => l.replace(/[^A-Z0-9]/g, ''))
    .filter((l) => l.length >= 2 && l.length <= 5 && !/^ECUADOR$/.test(l));

  for (let i = 0; i < lineas.length - 1; i++) {
    const unido = extraerPlacaDeTexto(lineas[i] + lineas[i + 1]);
    if (unido) return unido;
  }
  return null;
}

const indice = JSON.parse(await readFile(join(carpeta, 'indice.json'), 'utf8'));
const porCondicion = new Map();
for (const item of indice) {
  const lista = porCondicion.get(item.condicion) ?? [];
  if (!tope || lista.length < tope) lista.push(item);
  porCondicion.set(item.condicion, lista);
}

const worker = await createWorker('eng');
const resultados = [];
const total = [...porCondicion.values()].reduce((s, l) => s + l.length, 0) * MODOS.length;
let hechas = 0;

for (const modo of MODOS) {
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    tessedit_pageseg_mode: modo,
  });

  for (const [condicion, items] of porCondicion) {
    for (const item of items) {
      const png = PNG.sync.read(await readFile(join(carpeta, item.archivo)));
      const ampliada = escalarA(png, 1000);

      const lecturas = [];
      const lecturasUnidas = [];
      for (const variante of VARIANTES_OCR) {
        const copia = new PNG({ width: ampliada.width, height: ampliada.height });
        ampliada.data.copy(copia.data);
        aplicarVariante({ datos: copia.data, ancho: copia.width, alto: copia.height }, variante);
        const { data } = await worker.recognize(aDataUrl(copia));
        const texto = data.text ?? '';
        const actual = extraerPlacaDeTexto(texto);
        const unida = extraerDeDosLineas(texto);
        if (actual) lecturas.push(actual);
        if (unida) lecturasUnidas.push(unida);
      }

      const votar = (ls) => {
        if (!ls.length) return null;
        const votos = new Map();
        for (const l of ls) {
          const k = corregirPlacaOcr(l);
          votos.set(k, (votos.get(k) ?? 0) + 1);
        }
        return [...votos.entries()].sort((a, b) => b[1] - a[1])[0][0];
      };

      resultados.push({
        modo,
        condicion,
        esperada: item.placa,
        actual: votar(lecturas),
        unida: votar(lecturasUnidas),
      });

      hechas++;
      if (hechas % 10 === 0) process.stdout.write(`\r  ${hechas}/${total}`);
    }
  }
}
await worker.terminate();
console.log('');

const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(0)} %`);

console.log('\n=== ACIERTO CON LA EXTRACCIÓN ACTUAL (una línea) ===');
console.log('  condición                        ' + MODOS.map((m) => `PSM ${m}`.padStart(8)).join('  '));
for (const [condicion] of porCondicion) {
  const fila = MODOS.map((m) => {
    const rs = resultados.filter((r) => r.modo === m && r.condicion === condicion);
    return pct(rs.filter((r) => r.actual === r.esperada).length, rs.length).padStart(8);
  });
  console.log(`  ${condicion.padEnd(32)} ${fila.join('  ')}`);
}

console.log('\n=== ACIERTO UNIENDO LAS DOS LÍNEAS ===');
console.log('  condición                        ' + MODOS.map((m) => `PSM ${m}`.padStart(8)).join('  '));
for (const [condicion] of porCondicion) {
  const fila = MODOS.map((m) => {
    const rs = resultados.filter((r) => r.modo === m && r.condicion === condicion);
    return pct(rs.filter((r) => r.unida === r.esperada).length, rs.length).padStart(8);
  });
  console.log(`  ${condicion.padEnd(32)} ${fila.join('  ')}`);
}

console.log('\n=== RESUMEN POR MODO (todas las condiciones) ===');
for (const m of MODOS) {
  const rs = resultados.filter((r) => r.modo === m);
  console.log(
    `  PSM ${m.padEnd(3)} extracción actual: ${pct(rs.filter((r) => r.actual === r.esperada).length, rs.length).padStart(5)}` +
    `   uniendo líneas: ${pct(rs.filter((r) => r.unida === r.esperada).length, rs.length).padStart(5)}`,
  );
}
