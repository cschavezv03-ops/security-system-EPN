/**
 * Lectura de placas vehiculares ecuatorianas (RF-CA-015).
 *
 * Dos motores, en este orden:
 *
 *   1. NUBE — la Edge Function `reconocer-placa` llama a un lector de matrículas real. Es
 *      bastante mejor que cualquier OCR genérico porque localiza la placa dentro de la foto
 *      antes de leerla. Requiere que el token esté configurado en el servidor.
 *   2. LOCAL — Tesseract.js en el propio navegador. No necesita red ni claves, y es el modo
 *      con el que el sistema sigue funcionando cuando el proveedor no está disponible.
 *
 * El OCR genérico del modo local no lee una placa de una foto tal cual: hay que ayudarle.
 * Este módulo hace el preprocesado que separa una lectura inútil de una lectura correcta:
 * recorta la zona donde el guardia encuadró la placa, la amplía, la pasa a gris, le estira el
 * contraste y la binariza. Sin eso, Tesseract sobre una foto de un coche entero devuelve
 * fragmentos del parachoques.
 */

/** Las 24 letras de provincia asignadas por la ANT (D y F no se usan como inicial). */
const LETRAS_PROVINCIA = 'ABUCXHOEWGILRMVNQSPKTZYJ'

/** Forma canónica: mayúsculas, sin guion ni espacios. Espejo de `public.normalizar_placa`. */
export function normalizarPlacaLeida(valor: string): string {
  return (valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Corrige las confusiones de OCR según la posición. Espejo exacto de
 * `public.corregir_placa_ocr` — si cambias una, cambia la otra.
 *
 * La placa ecuatoriana tiene forma fija: tres letras y luego tres o cuatro dígitos. Un dígito
 * leído en las tres primeras posiciones es necesariamente un error, y una letra en la parte
 * numérica también. Corregirlo por posición no puede convertir una placa en otra placa válida
 * distinta, porque solo toca caracteres que estaban en la clase equivocada.
 */
export function corregirPlacaOcr(valor: string): string {
  const placa = normalizarPlacaLeida(valor)
  if (placa.length !== 6 && placa.length !== 7) return placa

  const aLetra: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B' }
  const aDigito: Record<string, string> = {
    O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8',
  }

  return placa
    .split('')
    .map((ch, i) => (i <= 2 ? aLetra[ch] ?? ch : aDigito[ch] ?? ch))
    .join('')
}

/** ¿Tiene forma de placa ecuatoriana ordinaria o de motocicleta? */
export function pareceePlacaEcuatoriana(valor: string): boolean {
  const c = normalizarPlacaLeida(valor)
  return (
    new RegExp(`^[${LETRAS_PROVINCIA}][A-Z]{2}[0-9]{3,4}$`).test(c) ||
    new RegExp(`^[${LETRAS_PROVINCIA}][A-Z][0-9]{3}[A-Z]$`).test(c)
  )
}

/**
 * Extrae la placa de un texto suelto devuelto por el OCR.
 *
 * Tesseract no devuelve "PDF1234": devuelve algo como "ECUADOR\nPDF-1234\nPICHINCHA", porque
 * la placa lleva impreso el país y la provincia. Buscar el patrón dentro del texto, en vez de
 * tomar el texto entero, es lo que hace que la lectura sirva para algo.
 */
export function extraerPlacaDeTexto(texto: string, multilinea = false): string | null {
  const limpio = (texto || '').toUpperCase().replace(/[^A-Z0-9\s-]/g, ' ')

  // Se prueban los trozos largos primero: "PDF1234" antes que "PDF123", para no quedarse con
  // un prefijo de la placa de cuatro dígitos.
  const candidatos = limpio
    .split(/\s+/)
    .map(normalizarPlacaLeida)
    .filter((t) => t.length >= 6 && t.length <= 8)
    .sort((a, b) => b.length - a.length)

  for (const candidato of candidatos) {
    if (pareceePlacaEcuatoriana(candidato)) return candidato
    const corregido = corregirPlacaOcr(candidato)
    if (pareceePlacaEcuatoriana(corregido)) return corregido
  }

  // La placa de MOTO lleva el código repartido en dos renglones, así que el OCR devuelve
  // "XLL" y "446" — dos trozos de tres caracteres que el filtro de arriba descarta por cortos.
  // Unir cada línea con la siguiente es lo que vuelve a formar el código completo.
  if (multilinea) {
    const renglones = (texto || '')
      .toUpperCase()
      .split('\n')
      .map((l) => l.replace(/[^A-Z0-9]/g, ''))
      // "ECUADOR" y el nombre de la provincia están impresos en la placa y no son parte del
      // código: si se colaran en la unión, formarían placas fantasma.
      .filter((l) => l.length >= 2 && l.length <= 5 && l !== 'ECUADOR')

    for (let i = 0; i < renglones.length - 1; i++) {
      const unido = renglones[i] + renglones[i + 1]
      if (pareceePlacaEcuatoriana(unido)) return unido
      const corregido = corregirPlacaOcr(unido)
      if (pareceePlacaEcuatoriana(corregido)) return corregido
    }
  }

  // Último intento: el texto entero pegado, por si el OCR metió espacios dentro de la placa.
  const todo = normalizarPlacaLeida(limpio)
  const encontrado = todo.match(new RegExp(`[${LETRAS_PROVINCIA}][A-Z]{2}[0-9]{3,4}`))
  return encontrado ? encontrado[0] : null
}

// ---------------------------------------------------------------------------
// Preprocesado de la imagen
// ---------------------------------------------------------------------------

/** Una imagen en crudo, sin DOM de por medio: es lo que permite medir el preprocesado fuera
 *  del navegador (ver `scripts/calibracion_placas`). */
export interface ImagenCruda {
  datos: Uint8ClampedArray
  ancho: number
  alto: number
}

/**
 * Cómo se prepara la imagen antes de pasarla al OCR.
 *
 * No hay una sola respuesta buena, y por eso hay tres: la que funciona con una placa metálica
 * bien iluminada NO es la que funciona con la foto de una placa en la pantalla de un móvil.
 *
 *  - `BINARIZADA`  — grises, contraste estirado y umbral de Otsu. Lo mejor con una placa real:
 *                    deja los caracteres en negro puro sobre blanco puro.
 *  - `SUAVIZADA`   — un desenfoque de 3x3 ANTES de binarizar. Es la defensa contra el moiré,
 *                    el patrón de rayas que aparece al fotografiar una pantalla: son detalles
 *                    de alta frecuencia, y el desenfoque se los come antes de que el umbral
 *                    los convierta en cantos negros falsos por toda la imagen.
 *  - `GRIS`        — solo grises con el contraste estirado, sin binarizar. Cuando el brillo de
 *                    la pantalla aplana el contraste, un umbral global parte la placa en dos
 *                    mitades —una toda negra y otra toda blanca— y se pierden caracteres
 *                    enteros. En gris, Tesseract se defiende mejor.
 *  - `REALZADA`    — suavizado para matar el moiré y, encima, realce de bordes (máscara de
 *                    desenfoque) antes de binarizar. Una foto de pantalla llega desenfocada
 *                    Y con moiré a la vez: suavizar sola deja los caracteres blandos, y
 *                    realzar sola amplifica las rayas. Hacer las dos cosas en ese orden quita
 *                    la rejilla primero y devuelve el canto de los caracteres después.
 */
export type VarianteOcr = 'BINARIZADA' | 'SUAVIZADA' | 'GRIS' | 'REALZADA'

/** Grises por luminancia. */
function aGrises(img: ImagenCruda): Uint8Array {
  const { datos } = img
  const grises = new Uint8Array(datos.length / 4)
  for (let i = 0, j = 0; i < datos.length; i += 4, j++) {
    grises[j] = Math.round(0.299 * datos[i] + 0.587 * datos[i + 1] + 0.114 * datos[i + 2])
  }
  return grises
}

/** Desenfoque de caja 3x3. Barato y suficiente para deshacer el moiré. */
function suavizar(grises: Uint8Array, ancho: number, alto: number): Uint8Array {
  const salida = new Uint8Array(grises.length)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      let suma = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy
          const xx = x + dx
          if (yy < 0 || yy >= alto || xx < 0 || xx >= ancho) continue
          suma += grises[yy * ancho + xx]
          n++
        }
      }
      salida[y * ancho + x] = Math.round(suma / n)
    }
  }
  return salida
}

/**
 * Máscara de desenfoque: al original se le resta su versión borrosa, lo que devuelve el canto
 * a los bordes. Es lo que compensa el desenfoque de enfocar de cerca una pantalla.
 */
function realzar(grises: Uint8Array, ancho: number, alto: number, fuerza = 1.2): Uint8Array {
  const borrosa = suavizar(grises, ancho, alto)
  const salida = new Uint8Array(grises.length)
  for (let i = 0; i < grises.length; i++) {
    const v = grises[i] + fuerza * (grises[i] - borrosa[i])
    salida[i] = Math.max(0, Math.min(255, Math.round(v)))
  }
  return salida
}

/**
 * Estira el contraste recortando el 2 % de cada extremo del histograma.
 *
 * Una placa fotografiada a contraluz —o en una pantalla— ocupa una franja estrecha del
 * histograma; sin estirarla, el umbral posterior se lo lleva todo del mismo lado.
 */
function estirarContraste(grises: Uint8Array): Uint8Array {
  const histograma = new Array(256).fill(0)
  for (const g of grises) histograma[g]++

  const total = grises.length
  const recorte = total * 0.02
  let acumulado = 0
  let minimo = 0
  let maximo = 255
  for (let v = 0; v < 256; v++) {
    acumulado += histograma[v]
    if (acumulado > recorte) { minimo = v; break }
  }
  acumulado = 0
  for (let v = 255; v >= 0; v--) {
    acumulado += histograma[v]
    if (acumulado > recorte) { maximo = v; break }
  }
  const rango = Math.max(1, maximo - minimo)

  const salida = new Uint8Array(total)
  for (let j = 0; j < total; j++) {
    salida[j] = Math.max(0, Math.min(255, Math.round(((grises[j] - minimo) / rango) * 255)))
  }
  return salida
}

/**
 * Umbral de Otsu: separa fondo de caracteres maximizando la varianza entre las dos clases.
 * Se calcula de la imagen, no se elige a mano — un valor fijo solo funciona con una
 * iluminación concreta.
 */
function umbralOtsu(grises: Uint8Array): number {
  const histograma = new Array(256).fill(0)
  for (const g of grises) histograma[g]++
  const total = grises.length

  let sumaTotal = 0
  for (let v = 0; v < 256; v++) sumaTotal += v * histograma[v]

  let sumaFondo = 0
  let pesoFondo = 0
  let mejorVarianza = -1
  let umbral = 128
  for (let v = 0; v < 256; v++) {
    pesoFondo += histograma[v]
    if (pesoFondo === 0) continue
    const pesoFrente = total - pesoFondo
    if (pesoFrente === 0) break
    sumaFondo += v * histograma[v]
    const mediaFondo = sumaFondo / pesoFondo
    const mediaFrente = (sumaTotal - sumaFondo) / pesoFrente
    const varianza = pesoFondo * pesoFrente * (mediaFondo - mediaFrente) ** 2
    if (varianza > mejorVarianza) { mejorVarianza = varianza; umbral = v }
  }
  return umbral
}

/**
 * Aplica una variante de preprocesado sobre la imagen, en el sitio.
 *
 * Función pura respecto al DOM: recibe y devuelve píxeles, sin canvas de por medio. Es lo que
 * permite que `scripts/calibracion_placas` mida EXACTAMENTE este algoritmo y no una copia
 * parecida que se desviaría con el tiempo.
 */
export function aplicarVariante(img: ImagenCruda, variante: VarianteOcr): void {
  let grises = aGrises(img)
  if (variante === 'SUAVIZADA') {
    grises = suavizar(grises, img.ancho, img.alto)
  } else if (variante === 'REALZADA') {
    // El orden importa: primero se quita la rejilla, después se recupera el borde. Al revés,
    // el realce convertiría el moiré en cantos negros por toda la imagen.
    grises = suavizar(grises, img.ancho, img.alto)
    grises = realzar(grises, img.ancho, img.alto)
  }
  grises = estirarContraste(grises)

  const binarizar = variante !== 'GRIS'
  const umbral = binarizar ? umbralOtsu(grises) : 0

  const { datos } = img
  for (let i = 0, j = 0; i < datos.length; i += 4, j++) {
    const valor = binarizar ? (grises[j] > umbral ? 255 : 0) : grises[j]
    datos[i] = valor
    datos[i + 1] = valor
    datos[i + 2] = valor
    datos[i + 3] = 255
  }
}

/**
 * Qué tipo de placa se va a leer. No es un detalle cosmético: una placa de moto es OTRA FORMA,
 * y tanto el recorte como el modo de segmentación del OCR tienen que cambiar con ella.
 *
 *            proporción        el código va en...
 *   AUTO     ~3:1 apaisada     UNA línea
 *   MOTO     ~1.33:1 casi      DOS líneas
 *            cuadrada
 *
 * Medido sobre 80 placas de moto sintéticas: con la configuración de auto (una sola línea), el
 * acierto en motos es del **0 %** — Tesseract obedece cuando se le dice que no hay más de una
 * línea. Con la configuración de moto sube al 83 %.
 */
export type TipoLecturaPlaca = 'AUTO' | 'MOTO'

/** Geometría del marco guía y modo de segmentación, por tipo de placa.
 *
 *  `anchoRel`/`altoRel` son la fracción del fotograma que ocupa el marco. Los de AUTO son los
 *  que ya había y no se tocan. Los de MOTO se eligen para que la placa LLENE el recorte: con
 *  el marco apaisado, una placa de moto encuadrada ocupaba solo el 28 % del ancho y el resto
 *  era fondo, tirando tres cuartas partes de la resolución disponible.
 *
 *  `psm` es el modo de segmentación de página de Tesseract:
 *    7  — "la imagen es una sola línea de texto"
 *    11 — "texto disperso, sin un orden concreto"
 *  PSM 12 daba el mismo acierto que el 11 pero exige `osd.traineddata`, que no viene con el
 *  paquete y falla al cargarse; se descarta por eso, no por precisión. */
export const GEOMETRIA_PLACA: Record<TipoLecturaPlaca, {
  anchoRel: number; altoRel: number; psm: string; multilinea: boolean
}> = {
  AUTO: { anchoRel: 0.70, altoRel: 0.26, psm: '7', multilinea: false },
  MOTO: { anchoRel: 0.45, altoRel: 0.60, psm: '11', multilinea: true },
}

/** Las variantes, en el orden en que conviene probarlas: primero las que mejor se portan con
 *  fotos de pantalla, que es el caso difícil. */
export const VARIANTES_OCR: VarianteOcr[] = ['SUAVIZADA', 'REALZADA', 'BINARIZADA', 'GRIS']

/**
 * Recorta la franja central del fotograma —la que el panel dibuja como guía— y devuelve una
 * imagen preparada por cada variante de preprocesado.
 *
 * El recorte es lo que más aporta: el guardia encuadra la placa dentro del marco, así que el
 * resto de la imagen (capó, calle, otros coches) es ruido que solo puede empeorar la lectura.
 *
 * Se devuelven VARIAS imágenes en vez de una porque no existe un preprocesado que gane siempre:
 * el que mejor lee una placa metálica es el que peor lee una pantalla. Probar las tres y
 * quedarse con la lectura que tenga forma de placa cuesta unos segundos de CPU y es la
 * diferencia entre leer la placa y no leerla.
 */
export function prepararImagenParaOcr(
  origen: HTMLVideoElement | HTMLImageElement,
  canvas: HTMLCanvasElement,
  tipo: TipoLecturaPlaca = 'AUTO',
): string[] {
  const anchoOrigen = origen instanceof HTMLVideoElement ? origen.videoWidth : origen.naturalWidth
  const altoOrigen = origen instanceof HTMLVideoElement ? origen.videoHeight : origen.naturalHeight
  if (!anchoOrigen || !altoOrigen) throw new Error('La cámara todavía no ha entregado imagen.')

  // Misma proporción que el marco guía del panel, que cambia de forma según el tipo de placa.
  const { anchoRel, altoRel } = GEOMETRIA_PLACA[tipo]
  const anchoRecorte = Math.round(anchoOrigen * anchoRel)
  const altoRecorte = Math.round(altoOrigen * altoRel)
  const x = Math.round((anchoOrigen - anchoRecorte) / 2)
  const y = Math.round((altoOrigen - altoRecorte) / 2)

  // Tesseract acierta mucho más si los caracteres miden 30 px o más de alto. Se amplía hasta
  // un ancho de trabajo fijo en vez de usar la resolución nativa, que varía con cada cámara.
  const anchoTrabajo = 1000
  const escala = anchoTrabajo / anchoRecorte
  canvas.width = anchoTrabajo
  canvas.height = Math.round(altoRecorte * escala)

  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const salida: string[] = []
  for (const variante of VARIANTES_OCR) {
    // Se vuelve a dibujar el original en cada vuelta: las variantes parten del mismo fotograma,
    // no se encadenan una sobre otra.
    ctx.drawImage(origen, x, y, anchoRecorte, altoRecorte, 0, 0, canvas.width, canvas.height)
    const imagen = ctx.getImageData(0, 0, canvas.width, canvas.height)
    aplicarVariante({ datos: imagen.data, ancho: canvas.width, alto: canvas.height }, variante)
    ctx.putImageData(imagen, 0, 0)
    salida.push(canvas.toDataURL('image/png'))
  }
  return salida
}

// ---------------------------------------------------------------------------
// Motor local (Tesseract.js)
// ---------------------------------------------------------------------------

// Igual que face-api: dependencia pesada que solo necesita la garita, así que se carga bajo
// demanda y queda en su propio chunk en vez de en el bundle que descarga cualquier usuario.
type TesseractModule = typeof import('tesseract.js')
let tesseract: TesseractModule | null = null
// deno-lint-ignore no-explicit-any
let trabajador: any = null

async function obtenerTrabajador() {
  if (trabajador) return trabajador
  if (!tesseract) tesseract = await import('tesseract.js')
  trabajador = await tesseract.createWorker('eng')
  await trabajador.setParameters({
    // Una placa solo tiene letras y dígitos: cualquier otro carácter es una alucinación del
    // OCR, y prohibirlos mejora la lectura además de ahorrar limpieza posterior.
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  })
  return trabajador
}

/** Libera el worker de Tesseract. La garita lo llama al desmontar el panel. */
export async function liberarLectorLocal() {
  if (trabajador) {
    await trabajador.terminate()
    trabajador = null
  }
}

export interface LecturaPlaca {
  placa: string
  confianza: number
  motor: 'NUBE' | 'LOCAL' | 'MANUAL'
}

/**
 * Confianza de una lectura, calculada por ACUERDO ENTRE VARIANTES.
 *
 * Lo natural sería usar la confianza que reporta Tesseract, pero en tesseract.js 5 llega
 * siempre a 0 —en `data.confidence`, en los bloques y en las palabras—, así que como señal no
 * existe. Medido: con ese número, ningún umbral de confianza filtraba nada, porque todas las
 * lecturas empataban a cero.
 *
 * La señal que sí hay es mejor que la que falta: las tres variantes de preprocesado son tres
 * lectores independientes sobre la misma foto. Que las tres coincidan en "PDF1234" dice mucho
 * más de esa lectura que cualquier número que devuelva un motor sobre sí mismo — es la misma
 * idea que votar entre varios modelos.
 *
 *   acuerdo   = cuántas variantes leyeron lo mismo que la elegida
 *   cobertura = cuántas variantes consiguieron leer algo con forma de placa
 *
 * Se comparan las placas ya corregidas: "PDFI234" y "PDF1234" son la misma lectura escrita de
 * dos formas, y contarlas como desacuerdo penalizaría una coincidencia real.
 */
function confianzaPorConsenso(lecturas: string[], elegida: string): number {
  if (lecturas.length === 0) return 0
  const canonica = corregirPlacaOcr(elegida)
  const coincidencias = lecturas.filter((l) => corregirPlacaOcr(l) === canonica).length
  const acuerdo = coincidencias / lecturas.length
  const cobertura = lecturas.length / VARIANTES_OCR.length
  // La cobertura pondera a la mitad: dos variantes que coinciden valen más que una sola que
  // acierta por su cuenta, pero una lectura única tampoco es despreciable.
  return Number((acuerdo * (0.5 + 0.5 * cobertura)).toFixed(2))
}

/**
 * Lee la placa en el navegador probando cada variante de preprocesado.
 *
 * Se queda con la lectura MÁS VOTADA entre las que tienen forma de placa ecuatoriana. El filtro
 * de forma va primero y no es negociable: Tesseract devuelve con gusto "ECUADOR" o "PICHINCHA",
 * que están impresos en la propia placa, y sin ese filtro serían candidatos.
 *
 * Si ninguna variante da algo con forma de placa, devuelve null y la pantalla ofrece repetir la
 * captura o teclearla.
 */
export async function leerPlacaLocal(
  imagenes: string | string[],
  tipo: TipoLecturaPlaca = 'AUTO',
): Promise<LecturaPlaca | null> {
  const worker = await obtenerTrabajador()
  const lista = Array.isArray(imagenes) ? imagenes : [imagenes]
  const { psm, multilinea } = GEOMETRIA_PLACA[tipo]

  // El modo de segmentación se fija en cada lectura, no al crear el worker: el mismo panel
  // lee autos y motos, y cada uno necesita el suyo.
  await worker.setParameters({ tessedit_pageseg_mode: psm })

  const lecturas: string[] = []
  for (const imagen of lista) {
    const { data } = await worker.recognize(imagen)
    const placa = extraerPlacaDeTexto(data.text ?? '', multilinea)
    if (placa) lecturas.push(placa)
  }

  if (lecturas.length === 0) return null

  // La más repetida (en forma canónica); a igualdad, la primera, que viene de la variante
  // SUAVIZADA — la que mejor se comporta con fotos de pantalla, que es el caso difícil.
  const votos = new Map<string, number>()
  for (const l of lecturas) {
    const clave = corregirPlacaOcr(l)
    votos.set(clave, (votos.get(clave) ?? 0) + 1)
  }
  const ganadora = [...votos.entries()].sort((a, b) => b[1] - a[1])[0][0]

  return {
    placa: ganadora,
    confianza: confianzaPorConsenso(lecturas, ganadora),
    motor: 'LOCAL',
  }
}
