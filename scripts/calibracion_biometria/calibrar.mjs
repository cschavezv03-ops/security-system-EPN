/**
 * Calibración del umbral biométrico del Sistema de Seguridad EPN.
 *
 * Calcula el descriptor facial de cada foto con EL MISMO modelo que usa el sistema
 * (face-api.js, 128 dimensiones), mide la distancia L2 dentro de cada par y responde a la
 * pregunta que decide el umbral:
 *
 *   ¿a qué distancia está la misma persona de sí misma, y a qué distancia están dos personas
 *   distintas?
 *
 * Con el banco de la EPN solo se podía medir lo segundo (una foto por persona), y por eso el
 * umbral anterior se fijó "a ojo" con el margen que quedaba. Aquí se miden las dos
 * distribuciones y el umbral sale de ellas.
 *
 * El sistema trabaja en CONFIANZA, no en distancia: `confianza = max(0, 1 - distancia_L2)`
 * (ver `public.identificar_por_descriptor`). Todo se reporta en las dos escalas.
 *
 * Métricas que se usan para decidir:
 *   - FAR (False Accept Rate): proporción de pares de personas DISTINTAS que el umbral
 *     aceptaría. Es el error grave: dejar entrar a quien no es.
 *   - FRR (False Reject Rate): proporción de pares de la MISMA persona que el umbral
 *     rechazaría. Es el error molesto: el guardia repite la captura o teclea la cédula.
 *
 * No toca la base de datos ni enrola a nadie. Es una herramienta de medición.
 *
 * Uso:  node calibrar.mjs <carpeta-con-pares>
 */

import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, cpus } from 'node:os';
import { fork } from 'node:child_process';

const carpeta = process.argv[2];
if (!carpeta) {
  console.error('Uso: node calibrar.mjs <carpeta-con-pares>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Medición, repartida entre los núcleos disponibles
// ---------------------------------------------------------------------------
// Calcular un descriptor facial son unos cientos de milisegundos de CPU, y hay 2400 fotos que
// medir. En secuencial eso es cerca de una hora; repartido entre los núcleos, unos minutos.
// Cada par es independiente de los demás, así que no hace falta coordinar nada: cada proceso
// se queda con una franja del índice y escribe su resultado.
//
// Se dejan dos núcleos libres para que la máquina siga usable mientras corre.
const nucleos = Math.max(1, Math.min(10, cpus().length - 2));

const indice = JSON.parse(await readFile(join(carpeta, 'indice.json'), 'utf8'));
console.log(`Midiendo ${indice.length} pares con ${nucleos} procesos en paralelo...`);

const temporal = await mkdtemp(join(tmpdir(), 'calib-'));
const guion = new URL('./calcular_descriptores.mjs', import.meta.url).pathname;

const trabajos = Array.from({ length: nucleos }, (_, i) => {
  const salida = join(temporal, `parte-${i}.json`);
  return new Promise((resolver, rechazar) => {
    const hijo = fork(guion, [carpeta, String(i), String(nucleos), salida], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    hijo.on('exit', (codigo) => (codigo === 0 ? resolver(salida) : rechazar(new Error(`proceso ${i} salió con ${codigo}`))));
    hijo.on('error', rechazar);
  });
});

const archivos = await Promise.all(trabajos);
console.log('');

const mismas = [];
const distintas = [];
let sinRostro = 0;

for (const archivo of archivos) {
  for (const r of JSON.parse(await readFile(archivo, 'utf8'))) {
    if (r.distancia === null) sinRostro++;
    else (r.mismaPersona ? mismas : distintas).push(r.distancia);
  }
}
await rm(temporal, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Estadística
// ---------------------------------------------------------------------------
const percentil = (xs, p) => {
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
};
const media = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

const resumen = (nombre, xs) => {
  console.log(
    `  ${nombre.padEnd(22)} n=${String(xs.length).padStart(4)}  ` +
    `min ${percentil(xs, 0).toFixed(3)}  p5 ${percentil(xs, 5).toFixed(3)}  ` +
    `mediana ${percentil(xs, 50).toFixed(3)}  p95 ${percentil(xs, 95).toFixed(3)}  ` +
    `max ${percentil(xs, 100).toFixed(3)}  media ${media(xs).toFixed(3)}`,
  );
};

console.log('\n=== DISTANCIA L2 ENTRE LOS DOS ROSTROS DEL PAR ===');
resumen('MISMA persona', mismas);
resumen('personas DISTINTAS', distintas);
if (sinRostro) console.log(`  (${sinRostro} pares descartados: no se detectó rostro en alguna de las dos fotos)`);

// Barrido de umbrales: para cada distancia de corte, cuántos errores de cada tipo se cometen.
console.log('\n=== QUÉ PASA CON CADA UMBRAL ===');
console.log('  confianza  distancia   FAR (deja entrar a quien no es)   FRR (rechaza a quien sí es)');

const candidatos = [];
for (let corte = 0.30; corte <= 0.90; corte += 0.01) {
  const far = distintas.filter((d) => d <= corte).length / distintas.length;
  const frr = mismas.filter((d) => d > corte).length / mismas.length;
  candidatos.push({ corte, far, frr, confianza: 1 - corte });
}

for (const c of candidatos) {
  const marca = Math.abs(c.confianza - 0.45) < 0.005 ? '  <- umbral actual' : '';
  if (Math.abs(c.corte * 100 - Math.round(c.corte * 100)) < 1e-6 && Math.round(c.corte * 100) % 5 === 0) {
    console.log(
      `  ${c.confianza.toFixed(2).padStart(8)}   ${c.corte.toFixed(2).padStart(8)}   ` +
      `${(c.far * 100).toFixed(2).padStart(8)} %                    ` +
      `${(c.frr * 100).toFixed(2).padStart(8)} %${marca}`,
    );
  }
}

// El punto donde los dos errores se igualan (EER) es la referencia estándar para comparar
// sistemas, pero NO es el umbral que conviene a un control de acceso físico: ahí un impostor
// entra con la misma probabilidad con la que se rechaza a alguien legítimo, y las dos cosas no
// cuestan lo mismo.
const eer = candidatos.reduce((mejor, c) =>
  Math.abs(c.far - c.frr) < Math.abs(mejor.far - mejor.frr) ? c : mejor,
);

// Lo que se busca aquí: el umbral más permisivo que mantiene el FAR por debajo del objetivo.
// Cuanto más permisivo, menos veces tiene que repetir la captura una persona legítima.
const objetivos = [0.001, 0.005, 0.01];
console.log('\n=== UMBRALES RECOMENDADOS ===');
console.log(`  Punto de igual error (EER):  confianza ${eer.confianza.toFixed(3)} / distancia ${eer.corte.toFixed(3)} — FAR = FRR = ${(eer.far * 100).toFixed(2)} %`);
for (const objetivo of objetivos) {
  const validos = candidatos.filter((c) => c.far <= objetivo);
  const elegido = validos.length ? validos[validos.length - 1] : null;
  if (elegido) {
    console.log(
      `  FAR <= ${(objetivo * 100).toFixed(1)} %:  confianza ${elegido.confianza.toFixed(3)} / distancia ${elegido.corte.toFixed(3)} ` +
      `— rechazaría al ${(elegido.frr * 100).toFixed(1)} % de los intentos legítimos`,
    );
  } else {
    console.log(`  FAR <= ${(objetivo * 100).toFixed(1)} %:  no se alcanza en el rango medido`);
  }
}

// Solapamiento: si la peor foto de la misma persona está más lejos que el par de personas
// distintas más parecido, no existe ningún umbral que separe perfectamente. Es lo normal, y
// dice cuánta zona gris hay que dejar para que la decida un humano.
const peorMisma = percentil(mismas, 100);
const mejorDistinta = percentil(distintas, 0);
console.log('\n=== ZONA GRIS ===');
console.log(`  Par de la misma persona más lejano:      distancia ${peorMisma.toFixed(3)} (confianza ${(1 - peorMisma).toFixed(3)})`);
console.log(`  Par de personas distintas más parecido:  distancia ${mejorDistinta.toFixed(3)} (confianza ${(1 - mejorDistinta).toFixed(3)})`);
console.log(
  mejorDistinta < peorMisma
    ? `  Las dos distribuciones SE SOLAPAN entre ${mejorDistinta.toFixed(3)} y ${peorMisma.toFixed(3)}: ningún umbral las separa del todo,\n  y por eso el sistema tiene una banda de revisión en la que decide el guardia.`
    : '  No hay solapamiento en esta muestra.',
);
