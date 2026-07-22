/**
 * Comprueba las dos mitades del cambio de motos, con el código real compilado:
 *
 *   1. que las placas de MOTO ahora se leen, y
 *   2. que las de AUTO siguen leyéndose exactamente igual que antes.
 *
 * La segunda importa tanto como la primera: el encargo era arreglar las motos SIN tocar los
 * autos, y esa clase de promesa solo vale si se mide.
 *
 * Uso:  node verificar_tipos.mjs <banco-autos> <banco-motos> [maximo-por-condicion]
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { createWorker } from 'tesseract.js';
import {
  GEOMETRIA_PLACA, VARIANTES_OCR, aplicarVariante, corregirPlacaOcr, extraerPlacaDeTexto,
} from './placas.build.mjs';

const [bancoAutos, bancoMotos, topeStr] = process.argv.slice(2);
const tope = Number(topeStr ?? 0);
if (!bancoAutos || !bancoMotos) {
  console.error('Uso: node verificar_tipos.mjs <banco-autos> <banco-motos> [maximo]');
  process.exit(1);
}

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

const worker = await createWorker('eng');
await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' });

async function medirBanco(carpeta, tipo) {
  const indice = JSON.parse(await readFile(join(carpeta, 'indice.json'), 'utf8'));
  const { psm, multilinea } = GEOMETRIA_PLACA[tipo];
  await worker.setParameters({ tessedit_pageseg_mode: psm });

  const porCondicion = new Map();
  for (const item of indice) {
    const lista = porCondicion.get(item.condicion) ?? [];
    if (!tope || lista.length < tope) lista.push(item);
    porCondicion.set(item.condicion, lista);
  }

  const filas = [];
  for (const [condicion, items] of porCondicion) {
    let bien = 0;
    let mal = 0;
    for (const item of items) {
      const png = PNG.sync.read(await readFile(join(carpeta, item.archivo)));
      const ampliada = escalarA(png, 1000);

      const lecturas = [];
      for (const variante of VARIANTES_OCR) {
        const copia = new PNG({ width: ampliada.width, height: ampliada.height });
        ampliada.data.copy(copia.data);
        aplicarVariante({ datos: copia.data, ancho: copia.width, alto: copia.height }, variante);
        const { data } = await worker.recognize(aDataUrl(copia));
        const p = extraerPlacaDeTexto(data.text ?? '', multilinea);
        if (p) lecturas.push(p);
      }

      let elegida = null;
      if (lecturas.length) {
        const votos = new Map();
        for (const l of lecturas) {
          const k = corregirPlacaOcr(l);
          votos.set(k, (votos.get(k) ?? 0) + 1);
        }
        elegida = [...votos.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }

      if (elegida === item.placa) bien++;
      else if (elegida) mal++;
    }
    filas.push({ condicion, n: items.length, bien, mal });
  }
  return filas;
}

const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(0)} %`);

const mostrar = (titulo, filas) => {
  console.log(`\n=== ${titulo} ===`);
  console.log('  condición                         n   leída bien   leída mal');
  let tb = 0;
  let tn = 0;
  for (const f of filas) {
    console.log(
      `  ${f.condicion.padEnd(30)} ${String(f.n).padStart(3)}   ` +
      `${pct(f.bien, f.n).padStart(10)}   ${pct(f.mal, f.n).padStart(9)}`,
    );
    tb += f.bien;
    tn += f.n;
  }
  console.log(`  ${'TOTAL'.padEnd(30)} ${String(tn).padStart(3)}   ${pct(tb, tn).padStart(10)}`);
  return { bien: tb, n: tn };
};

const motos = await medirBanco(bancoMotos, 'MOTO');
const autos = await medirBanco(bancoAutos, 'AUTO');
await worker.terminate();

mostrar('MOTOS con el modo de moto (PSM 11 + dos líneas)', motos);
const rAutos = mostrar('AUTOS con el modo de auto (PSM 7, sin cambios)', autos);

console.log(
  `\n  Referencia de autos antes del cambio: 66 % sobre las 200 imágenes del banco completo.\n` +
  `  Ahora: ${pct(rAutos.bien, rAutos.n)} sobre ${rAutos.n}. Si difiere mucho, el camino de auto se tocó sin querer.`,
);
