// reconocer-placa
//
// Segunda via de autenticacion del ingreso vehicular (RF-CA-015). Hace dos cosas que el
// navegador no puede hacer solo:
//
//   1. LEE la placa de una imagen, si se le manda una. Usa Plate Recognizer, que es un
//      lector de matriculas de verdad y no un OCR generico: entiende que una placa es una
//      placa, la recorta del resto de la foto y devuelve candidatos ordenados. El token vive
//      aqui, en el servidor, y no en el bundle del navegador — una clave de API en el
//      frontend es una clave publica.
//   2. RESUELVE la lectura contra los vehiculos registrados (`identificar_placa`), aplicando
//      la correccion de erratas de OCR y la tolerancia difusa, y devuelve tambien quien esta
//      asociado a ese vehiculo para que la garita pueda comprobar la doble autenticacion
//      (RF-CA-016 / RNF-CA-005).
//
// Se puede llamar de dos formas, y la segunda es la que hace que el sistema funcione aunque
// no haya token ni internet:
//   { imagen_base64 }  -> lee la placa aqui y la resuelve
//   { placa_leida }    -> la lectura ya la hizo el navegador (Tesseract) o la tecleo el
//                         guardia; esta funcion solo resuelve
//
// Esta funcion NO registra eventos de acceso. Solo identifica. Quien decide y escribe es
// registrar-evento-acceso, para que haya un unico sitio donde se autoriza un ingreso.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { CORS_HEADERS, errorResponse, jsonResponse } from '../_shared/respuestas.ts';

interface ReconocerPlacaBody {
  imagen_base64?: string;
  placa_leida?: string;
  confianza?: number;
  /** Solo para trazar el error en la garita correcta si el reconocimiento falla. */
  id_punto_control?: string;
}

interface LecturaPlaca {
  placa: string;
  confianza: number;
  motor: 'NUBE' | 'LOCAL' | 'MANUAL';
}

const ENDPOINT_NUBE = 'https://api.platerecognizer.com/v1/plate-reader/';
const TIEMPO_MAXIMO_MS = 12_000;

async function registrarError(
  supabase: SupabaseClient,
  datos: {
    codigo: string;
    descripcion: string;
    idPuntoControl?: string;
    idUsuario?: string | null;
  },
) {
  // RF-CA-022: el error se deja registrado "sin interrumpir el almacenamiento de los demas
  // eventos". Si hasta esto falla, no se propaga: perder el diagnostico no puede tumbar la
  // validacion de acceso que lo provoco.
  try {
    await supabase.from('error_reconocimiento').insert({
      tipo_reconocimiento: 'PLACA',
      codigo_error: datos.codigo,
      descripcion: datos.descripcion,
      id_punto_control: datos.idPuntoControl ?? null,
      id_usuario: datos.idUsuario ?? null,
    });
  } catch (_) {
    // Deliberadamente silencioso.
  }
}

/** Lee la placa con el proveedor en la nube. Devuelve null si no hay token configurado. */
async function leerPlacaEnLaNube(
  imagenBase64: string,
  token: string,
): Promise<LecturaPlaca | null> {
  const cuerpo = new FormData();
  // La imagen llega como data URL o como base64 pelado; el proveedor acepta base64 directo.
  cuerpo.append('upload', imagenBase64.replace(/^data:image\/\w+;base64,/, ''));
  // Acotar a Ecuador mejora bastante la lectura: el proveedor conoce la forma de la placa
  // ecuatoriana y descarta interpretaciones que no encajan.
  cuerpo.append('regions', 'ec');

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);

  try {
    const respuesta = await fetch(ENDPOINT_NUBE, {
      method: 'POST',
      headers: { Authorization: `Token ${token}` },
      body: cuerpo,
      signal: control.signal,
    });

    if (!respuesta.ok) {
      throw new Error(`El lector de placas respondio ${respuesta.status}`);
    }

    const datos = await respuesta.json();
    const resultado = datos?.results?.[0];
    if (!resultado?.plate) return null;

    return {
      placa: String(resultado.plate).toUpperCase(),
      // `score` es la confianza de la lectura del texto; `dscore`, la de haber encontrado una
      // placa en la imagen. Se toma la peor de las dos: de nada sirve leer con seguridad unos
      // caracteres que quiza no eran una placa.
      confianza: Math.min(Number(resultado.score ?? 0), Number(resultado.dscore ?? 1)),
      motor: 'NUBE',
    };
  } finally {
    clearTimeout(temporizador);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return errorResponse('Metodo no permitido', 405);
  }

  let body: ReconocerPlacaBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('JSON invalido', 400);
  }

  // Solo un usuario autenticado identifica placas: la respuesta dice quien conduce cada
  // vehiculo registrado, que es dato personal.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Se requiere iniciar sesion para usar el lector de placas', 401);
  }

  const supabaseService = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const supabaseAnon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const { data: userData, error: userError } = await supabaseAnon.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (userError || !userData?.user) {
    return errorResponse('Sesion invalida o expirada', 401);
  }
  const idUsuario = userData.user.id;

  // ---- 1. Obtener la lectura ----
  let lectura: LecturaPlaca | null = null;

  if (body.placa_leida) {
    lectura = {
      placa: String(body.placa_leida).toUpperCase(),
      // Una lectura que llega ya hecha trae su propia confianza; si la tecleo el guardia, es
      // 1: una persona mirando la placa es la fuente mas fiable que hay.
      confianza: typeof body.confianza === 'number' ? body.confianza : 1,
      motor: typeof body.confianza === 'number' ? 'LOCAL' : 'MANUAL',
    };
  } else if (body.imagen_base64) {
    const token = Deno.env.get('PLATE_RECOGNIZER_TOKEN');

    if (!token) {
      // Sin token no es un error: es el modo local. El navegador tiene que leer la placa con
      // Tesseract y volver a llamar con `placa_leida`.
      return jsonResponse({
        motor: 'NO_DISPONIBLE',
        detalle: 'El lector en la nube no esta configurado. Use el lector local del navegador.',
        lectura: null,
        vehiculo: null,
      });
    }

    try {
      lectura = await leerPlacaEnLaNube(body.imagen_base64, token);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      const esTiempoAgotado = mensaje.includes('abort');
      await registrarError(supabaseService, {
        codigo: esTiempoAgotado ? 'TIEMPO_AGOTADO' : 'SERVICIO_NO_DISPONIBLE',
        descripcion: `Lector de placas en la nube: ${mensaje}`,
        idPuntoControl: body.id_punto_control,
        idUsuario,
      });
      return jsonResponse({
        motor: 'ERROR',
        detalle: 'El lector de placas en la nube no respondio. Puede leer la placa con el lector local o escribirla a mano.',
        lectura: null,
        vehiculo: null,
      });
    }

    if (!lectura) {
      await registrarError(supabaseService, {
        codigo: 'PLACA_NO_LEGIBLE',
        descripcion: 'El lector en la nube no encontro ninguna placa en la imagen capturada.',
        idPuntoControl: body.id_punto_control,
        idUsuario,
      });
      return jsonResponse({
        motor: 'NUBE',
        detalle: 'No se distingue ninguna placa en la imagen. Acerque el vehiculo o mejore la iluminacion.',
        lectura: null,
        vehiculo: null,
      });
    }
  } else {
    return errorResponse('Envie imagen_base64 o placa_leida', 400);
  }

  // ---- 2. Resolver la lectura contra los vehiculos registrados ----
  const { data: candidatos, error: errorIdent } = await supabaseService.rpc('identificar_placa', {
    p_placa_leida: lectura.placa,
  });
  if (errorIdent) return errorResponse(errorIdent.message, 500);

  const candidato = Array.isArray(candidatos) ? candidatos[0] : candidatos;

  if (!candidato) {
    // La placa se leyo bien pero no existe en el sistema. No es un error tecnico: es
    // informacion de seguridad (RF-CA-023), y la registra el evento de acceso, no esta funcion.
    return jsonResponse({
      motor: lectura.motor,
      lectura,
      vehiculo: null,
      ambigua: false,
      detalle: `La placa ${lectura.placa} no corresponde a ningun vehiculo registrado.`,
    });
  }

  if (candidato.ambigua) {
    return jsonResponse({
      motor: lectura.motor,
      lectura,
      vehiculo: null,
      ambigua: true,
      detalle: 'La lectura se parece a mas de una placa registrada. Escriba la placa a mano para no confundir un vehiculo con otro.',
    });
  }

  // ---- 3. Quien puede ir en ese vehiculo (RF-CA-016 / RF-CA-018) ----
  const { data: asociadas, error: errorAsoc } = await supabaseService
    .from('persona_vehiculo')
    .select('tipo_relacion, estado_relacion, fecha_fin, persona:persona(id_persona, nombres, apellidos, cedula, tipo_persona, estado)')
    .eq('id_vehiculo', candidato.id_vehiculo)
    .eq('estado_relacion', 'ACTIVA');
  if (errorAsoc) return errorResponse(errorAsoc.message, 500);

  const ahora = Date.now();
  const personas = (asociadas ?? [])
    .filter((a) => !a.fecha_fin || new Date(a.fecha_fin).getTime() > ahora)
    // deno-lint-ignore no-explicit-any
    .map((a) => ({ ...(a.persona as any), tipo_relacion: a.tipo_relacion }));

  return jsonResponse({
    motor: lectura.motor,
    lectura,
    vehiculo: {
      id_vehiculo: candidato.id_vehiculo,
      placa: candidato.placa,
      estado_vehiculo: candidato.estado_vehiculo,
      // Lo que el guardia necesita saber para decidir si se fia de la lectura.
      distancia: candidato.distancia,
      corregida: candidato.corregida,
    },
    personas_asociadas: personas,
    propietario: personas.find((p) => p.tipo_relacion === 'PROPIETARIO') ?? null,
    ambigua: false,
    // Una lectura que hubo que corregir, o que viene con poca confianza, se le enseña al
    // guardia antes de usarla. La decision de cuanto es "poca" vive en parametro_sistema.
    requiere_confirmacion: candidato.corregida === true || candidato.distancia > 0,
  });
});
