import { useEffect, useRef, useState } from 'react'
import { Bike, Camera as CamIcon, Car, Check, Image as ImageIcon, ScanLine, VideoOff, X } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import {
  GEOMETRIA_PLACA, corregirPlacaOcr, leerPlacaLocal, liberarLectorLocal, normalizarPlacaLeida,
  prepararImagenParaOcr, type LecturaPlaca, type TipoLecturaPlaca,
} from '../lib/placas'
import { formatearPlaca, validarPlacaTipo } from '../lib/validacion'
import { mensajeDeErrorDeCamara } from '../lib/errores-camara'
import { Badge, Button, ErrorBanner, Input, Spinner } from './ui'

export interface PersonaVehiculo {
  id_persona: string
  nombres: string
  apellidos: string
  cedula: string
  tipo_persona: string
  estado: string
  tipo_relacion: string
}

export interface VehiculoIdentificado {
  id_vehiculo: string
  placa: string
  estado_vehiculo: string
  distancia: number
  corregida: boolean
}

export interface ResultadoPlaca {
  lectura: LecturaPlaca
  vehiculo: VehiculoIdentificado | null
  personas: PersonaVehiculo[]
  detalle: string | null
}

/**
 * Captura y lectura de la placa vehicular (RF-CA-015).
 *
 * La cámara se pide a 1280×720 y con `facingMode: environment`: el guardia lee la placa con
 * la cámara trasera del dispositivo, no con la frontal que usa el reconocimiento facial. El
 * panel de rostro captura a 320×240, que para una cara basta y para una matrícula no: a esa
 * resolución los caracteres de la placa miden menos de diez píxeles y no hay OCR que valga.
 *
 * El marco que se dibuja encima del vídeo no es decoración: marca exactamente la región que
 * se recorta para el OCR (`prepararImagenParaOcr` usa las mismas proporciones). Encuadrar la
 * placa dentro del marco es lo que más sube el acierto.
 */
export function LectorPlaca({
  idPuntoControl,
  onIdentificada,
}: {
  idPuntoControl: string
  onIdentificada: (resultado: ResultadoPlaca) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const archivoRef = useRef<HTMLInputElement>(null)
  const [activa, setActiva] = useState(false)
  const [encendiendo, setEncendiendo] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [placaManual, setPlacaManual] = useState('')
  // Auto o moto. Lo elige el guardia, que tiene el vehículo delante y lo sabe de un vistazo.
  // No se adivina: una placa de moto lleva el código en dos líneas y necesita otro recorte y
  // otro modo de OCR; con la configuración de auto se lee el 0 % de ellas (§D83).
  const [tipoPlaca, setTipoPlaca] = useState<TipoLecturaPlaca>('AUTO')

  useEffect(() => {
    return () => {
      const s = videoRef.current?.srcObject as MediaStream | null
      s?.getTracks().forEach((t) => t.stop())
      void liberarLectorLocal()
    }
  }, [])

  const registrarErrorTecnico = async (codigo: string, descripcion: string) => {
    // RF-CA-022. Si el registro del error falla, no se propaga: perder el diagnóstico no
    // puede impedirle al guardia seguir trabajando.
    try {
      await supabase.from('error_reconocimiento').insert({
        tipo_reconocimiento: 'PLACA',
        codigo_error: codigo,
        descripcion,
        id_punto_control: idPuntoControl,
      })
    } catch {
      /* deliberadamente silencioso */
    }
  }

  const encender = async () => {
    setError(null)
    setEncendiendo(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      if (videoRef.current) videoRef.current.srcObject = stream
      setActiva(true)
    } catch (e) {
      // Al guardia se le dice qué hacer; el detalle técnico va a la bitácora, que es
      // donde sirve para depurar.
      setError(mensajeDeErrorDeCamara(e as Error, 'Mientras tanto, puedes escribir la placa a mano.'))
      await registrarErrorTecnico('CAMARA_NO_DISPONIBLE', 'No se pudo abrir la cámara: ' + (e as Error).message)
    } finally {
      setEncendiendo(false)
    }
  }

  /** Resuelve una placa ya leída (o tecleada) contra la base. */
  const resolver = async (lectura: LecturaPlaca) => {
    const { data, error: errorFn } = await supabase.functions.invoke('reconocer-placa', {
      body: {
        placa_leida: lectura.placa,
        ...(lectura.motor === 'MANUAL' ? {} : { confianza: lectura.confianza }),
        id_punto_control: idPuntoControl,
      },
    })
    if (errorFn) throw new Error(mensajeError(errorFn))

    const respuesta = data as {
      lectura: LecturaPlaca
      vehiculo: VehiculoIdentificado | null
      personas_asociadas?: PersonaVehiculo[]
      ambigua?: boolean
      detalle?: string
    }

    onIdentificada({
      lectura: respuesta.lectura ?? lectura,
      vehiculo: respuesta.vehiculo,
      personas: respuesta.personas_asociadas ?? [],
      detalle: respuesta.detalle ?? null,
    })
  }

  /** Camino completo desde una fuente de imagen: nube primero, Tesseract si no hay nube. */
  const leerDesde = async (origen: HTMLVideoElement | HTMLImageElement) => {
    setError(null)
    setAviso(null)
    setLeyendo(true)
    try {
      const variantes = prepararImagenParaOcr(origen, canvasRef.current!, tipoPlaca)

      // 1. Motor en la nube. Se le manda el recorte ya preparado, no la foto entera. Y de las
      //    variantes, la primera (SUAVIZADA): el lector de la nube localiza la placa por su
      //    cuenta y no necesita que se le den cuatro versiones de lo mismo — eso solo
      //    multiplicaría por cuatro las peticiones de una cuota mensual limitada.
      const { data, error: errorFn } = await supabase.functions.invoke('reconocer-placa', {
        body: { imagen_base64: variantes[0], id_punto_control: idPuntoControl },
      })
      if (errorFn) throw new Error(mensajeError(errorFn))

      const respuesta = data as {
        motor: string
        lectura: LecturaPlaca | null
        vehiculo: VehiculoIdentificado | null
        personas_asociadas?: PersonaVehiculo[]
        detalle?: string
      }

      if (respuesta.lectura) {
        onIdentificada({
          lectura: respuesta.lectura,
          vehiculo: respuesta.vehiculo,
          personas: respuesta.personas_asociadas ?? [],
          detalle: respuesta.detalle ?? null,
        })
        return
      }

      // 2. El lector en la nube no está configurado o no respondió: se lee aquí mismo.
      if (respuesta.motor === 'NO_DISPONIBLE' || respuesta.motor === 'ERROR') {
        setAviso(
          respuesta.motor === 'NO_DISPONIBLE'
            ? 'Lector en la nube no configurado; leyendo la placa en este dispositivo.'
            : 'El lector en la nube no respondió; leyendo la placa en este dispositivo.',
        )
        // Al lector local sí se le dan todas: es gratis, corre aquí, y el acuerdo entre las
        // variantes es lo que da la confianza de la lectura.
        const lectura = await leerPlacaLocal(variantes, tipoPlaca)
        if (!lectura) {
          await registrarErrorTecnico(
            'PLACA_NO_LEGIBLE',
            'El lector local no encontró ninguna placa en la imagen capturada.',
          )
          setError('No se distingue ninguna placa. Encuadre la placa dentro del marco, acérquese o escríbala a mano.')
          return
        }
        await resolver(lectura)
        return
      }

      // 3. El lector de la nube funcionó pero no vio ninguna placa en la imagen.
      setError(respuesta.detalle ?? 'No se distingue ninguna placa en la imagen.')
    } catch (e) {
      const mensaje = mensajeError(e)
      setError(mensaje)
      await registrarErrorTecnico('ERROR_INTERNO', `Lectura de placa: ${mensaje}`)
    } finally {
      setLeyendo(false)
    }
  }

  const capturar = () => {
    if (!videoRef.current) return
    void leerDesde(videoRef.current)
  }

  /** Subir una foto en vez de usar la cámara. Sirve para probar sin vehículo delante y para
   *  los puestos donde la cámara la lleva otro equipo. */
  const desdeArchivo = (evento: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0]
    if (!archivo) return
    const imagen = new Image()
    imagen.onload = () => void leerDesde(imagen)
    imagen.onerror = () => setError('No se pudo leer el archivo de imagen.')
    imagen.src = URL.createObjectURL(archivo)
    evento.target.value = ''
  }

  const usarPlacaManual = async () => {
    const tecleada = normalizarPlacaLeida(placaManual)

    // La corrección posicional se aplica TAMBIÉN a lo que se teclea, no solo a lo que lee la
    // cámara. Un guardia confunde la I con el 1 y la O con el 0 exactamente igual que un OCR,
    // sobre todo copiando una placa a contraluz desde tres metros. Rechazar "PDFI234" con un
    // error de formato, cuando el sistema sabe de sobra que eso es PDF1234, es hostil sin
    // ganar nada: la corrección no puede convertir una placa en otra placa válida distinta,
    // porque solo toca caracteres que estaban en la clase equivocada.
    const placa = corregirPlacaOcr(tecleada)
    const errorFormato = validarPlacaTipo(tipoPlaca === 'MOTO' ? 'MOTOCICLETA' : 'AUTOMOVIL')(placa)
    if (errorFormato) { setError(errorFormato); return }

    setError(null)
    setAviso(
      placa !== tecleada
        ? `Se interpretó ${formatearPlaca(tecleada)} como ${formatearPlaca(placa)}. Compruebe que coincide con la placa del vehículo.`
        : null,
    )
    setLeyendo(true)
    try {
      await resolver({ placa, confianza: 1, motor: 'MANUAL' })
      setPlacaManual('')
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setLeyendo(false)
    }
  }

  const cambiarTipo = (nuevo: TipoLecturaPlaca) => {
    setTipoPlaca(nuevo)
    setError(null)
    setAviso(null)
  }

  return (
    <div>
      {/* Auto o moto. Cambia la forma del marco y el modo con el que se lee: no es una
          preferencia, es lo que decide si la placa se puede leer o no. */}
      <div className="mb-2 inline-flex rounded-lg border border-slate-300 bg-white p-1" role="group" aria-label="Tipo de vehículo">
        <button
          type="button"
          aria-pressed={tipoPlaca === 'AUTO'}
          onClick={() => cambiarTipo('AUTO')}
          className={
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ' +
            (tipoPlaca === 'AUTO' ? 'bg-navy text-white' : 'text-ink-soft hover:bg-slate-100')
          }
        >
          <Car className="h-4 w-4" /> Auto
        </button>
        <button
          type="button"
          aria-pressed={tipoPlaca === 'MOTO'}
          onClick={() => cambiarTipo('MOTO')}
          className={
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ' +
            (tipoPlaca === 'MOTO' ? 'bg-navy text-white' : 'text-ink-soft hover:bg-slate-100')
          }
        >
          <Bike className="h-4 w-4" /> Moto
        </button>
      </div>

      <div
        className="relative overflow-hidden rounded-lg border border-slate-300 bg-slate-900"
        style={{ aspectRatio: '4/3' }}
      >
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />

        {activa && (
          // Marco guía: delimita exactamente lo que se recorta para el OCR.
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="rounded-md border-2 border-dashed border-emerald-400/80"
              style={{
                width: `${GEOMETRIA_PLACA[tipoPlaca].anchoRel * 100}%`,
                height: `${GEOMETRIA_PLACA[tipoPlaca].altoRel * 100}%`,
              }}
            >
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">
                {tipoPlaca === 'MOTO'
                  ? 'Encuadre la placa de la moto: las dos líneas dentro del marco'
                  : 'Encuadre la placa dentro del marco'}
              </span>
            </div>
          </div>
        )}

        {!activa && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
            {encendiendo ? <Spinner className="text-white" /> : <VideoOff className="h-8 w-8" />}
            <span className="text-xs">{encendiendo ? 'Abriendo cámara...' : 'Cámara apagada'}</span>
          </div>
        )}

        {leyendo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
            <Spinner className="text-white" />
            <span className="text-xs">Leyendo la placa...</span>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="mt-2 flex gap-2">
        {activa ? (
          <Button className="flex-1" onClick={capturar} loading={leyendo}>
            <ScanLine className="h-4 w-4" /> Capturar placa
          </Button>
        ) : (
          <Button variant="secondary" className="flex-1" onClick={encender} loading={encendiendo}>
            <CamIcon className="h-4 w-4" /> Activar cámara
          </Button>
        )}
        <Button variant="secondary" onClick={() => archivoRef.current?.click()} disabled={leyendo}>
          <ImageIcon className="h-4 w-4" />
        </Button>
        <input
          ref={archivoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={desdeArchivo}
          aria-label="Subir una foto de la placa"
        />
      </div>

      {aviso && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{aviso}</p>
      )}
      <div className="mt-2"><ErrorBanner message={error} /></div>

      {/* Siempre disponible: si la placa está sucia, doblada o la luz no ayuda, el guardia la
          lee con sus ojos. Un sistema de garita que solo funciona cuando el OCR acierta deja
          al guardia sin salida justo cuando más falta le hace. */}
      <div className="mt-3 border-t border-slate-200 pt-3">
        <label htmlFor="placa-manual" className="text-xs font-medium text-ink-soft">
          O escriba la placa directamente
        </label>
        <div className="mt-1 flex gap-2">
          <Input
            id="placa-manual"
            value={placaManual}
            onChange={(e) => setPlacaManual(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && usarPlacaManual()}
            placeholder={tipoPlaca === 'MOTO' ? 'IA-123B' : 'PDF-1234'}
            maxLength={9}
          />
          <Button variant="secondary" onClick={usarPlacaManual} loading={leyendo} disabled={!placaManual.trim()}>
            <Check className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Tarjeta con el resultado de la identificación de la placa. */
export function ResultadoPlacaPanel({
  resultado,
  onDescartar,
}: {
  resultado: ResultadoPlaca
  onDescartar: () => void
}) {
  const { lectura, vehiculo, detalle } = resultado
  const dudosa = Boolean(vehiculo && (vehiculo.corregida || vehiculo.distancia > 0))

  return (
    <div className={'mt-3 rounded-lg border p-3 ' + (vehiculo ? 'border-slate-200' : 'border-red/40 bg-red-50')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-lg font-bold tracking-wider text-navy">
            {formatearPlaca(vehiculo?.placa ?? lectura.placa)}
          </p>
          <p className="text-xs text-ink-soft">
            Leída como <span className="font-mono">{formatearPlaca(lectura.placa)}</span> ·{' '}
            {lectura.motor === 'MANUAL'
              ? 'escrita por el guardia'
              : `${lectura.motor === 'NUBE' ? 'lector en la nube' : 'lector del dispositivo'} · confianza ${lectura.confianza.toFixed(2)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onDescartar}
          className="rounded p-1 text-ink-soft hover:bg-slate-100"
          aria-label="Descartar la lectura de la placa"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {vehiculo ? (
        <>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <Badge value={vehiculo.estado_vehiculo} />
            {vehiculo.estado_vehiculo !== 'ACTIVO' && (
              <span className="text-red">Este vehículo no está autorizado a circular.</span>
            )}
          </div>
          {dudosa && (
            // Una lectura que hizo falta corregir se le enseña al guardia antes de usarla:
            // el sistema propone, la persona confirma.
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              La lectura no fue exacta y se corrigió a <strong>{formatearPlaca(vehiculo.placa)}</strong>.
              Compruebe que coincide con la placa del vehículo antes de continuar.
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-red">{detalle ?? 'La placa no corresponde a ningún vehículo registrado.'}</p>
      )}
    </div>
  )
}
