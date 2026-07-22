// registrar-evento-acceso
//
// Unico punto del sistema donde se decide y se escribe un ingreso o una salida. Implementa el
// "Resumen operativo" de docs/04_REGLAS_NEGOCIO.md y la cadena de validaciones de CAC
// (RF-CA-005 a RF-CA-021), con la denegacion inmediata que exige RF-CA-019.
//
// Autenticada con service_role para las escrituras; valida codigo_mac/direccion_ip contra
// `dispositivo` para el camino AUTOMATICA, o el JWT del guardia para el camino MANUAL
// (docs/01_AUTENTICACION_Y_ROLES.md §4).
//
// ORDEN DE LA CADENA (RF-CA-019, "sin continuar con las validaciones restantes"):
//
//   0. identidad          -> sin persona identificada no hay categoria que consultar
//   1. estado de la persona    RF-CA-008
//   2. existe regla            RF-CA-005
//   3. garita autorizada       RF-CA-007
//   4. horario permitido       RF-CA-006
//   5. memorando existe        RF-CA-009
//   6. memorando vigente       RF-CA-010
//   7. biometria               RF-CA-014
//   8. placa                   RF-CA-015
//   9. doble autenticacion     RF-CA-016 / RNF-CA-005
//
// Cada motivo empieza por un CODIGO canonico antes de ':'. Ese prefijo es lo que el trigger
// generar_alerta_desde_evento_denegado convierte en tipo de alerta, y lo que la pantalla
// traduce a un mensaje para el guardia (RNF-CA-004). El texto que va detras es para las
// personas; el codigo, para el sistema.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { CORS_HEADERS, errorResponse, jsonResponse } from '../_shared/respuestas.ts';

interface OcupanteInput {
  id_persona?: string;
  cedula?: string;
  es_conductor?: boolean;
  /** Resultado ya obtenido de validar-biometria; solo aplica a INTERNA (§D20). */
  confidence?: number;
  /** El guardia confirmo visualmente una coincidencia de la banda de revision (RF-CA-014). */
  confirmado_por_guardia?: boolean;
  /** El rostro no coincidio con nadie enrolado: se registra como desconocido (RF-CA-021). */
  desconocido?: boolean;
}

interface RegistrarEventoBody {
  origen_registro: 'AUTOMATICA' | 'MANUAL';
  tipo_movimiento: 'INGRESO' | 'SALIDA';
  id_punto_control: string;
  codigo_mac?: string;
  direccion_ip?: string;
  id_vehiculo?: string;
  /** Placa tal como la leyo la camara, aunque no resolviera a ningun vehiculo (RF-CA-015). */
  placa_detectada?: string;
  confianza_placa?: number;
  ocupantes: OcupanteInput[];
  /** Valvula 2 (§D23): el guardia siempre puede forzar una salida manual. */
  salida_manual_forzada?: boolean;
  motivo_salida_manual?: string;
}

interface ResultadoValidacion {
  autorizado: boolean;
  motivo: string | null;
  id_regla_acceso: string | null;
  id_autorizacion_visita: string | null;
  generarAlertaInformativa?: string | null;
  /** Ingreso al que corresponde esta salida (RF-CA-013). */
  idEventoIngreso?: string | null;
}

interface Umbrales {
  biometria: number;
  biometriaRevision: number;
}

async function obtenerParametro(supabase: SupabaseClient, codigo: string): Promise<number> {
  const { data, error } = await supabase
    .from('parametro_sistema')
    .select('valor_parametro')
    .eq('codigo_parametro', codigo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Parametro ${codigo} no configurado en parametro_sistema`);
  return Number(data.valor_parametro);
}

// regla_acceso.horario_inicio/fin son `time` sin zona. Se interpretan como hora local de
// Ecuador (America/Guayaquil, UTC-5, sin horario de verano), igual que el resto del sistema.
function horaLocalEcuador(fecha: Date): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Guayaquil',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(fecha);
  const obtener = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '00';
  return `${obtener('hour')}:${obtener('minute')}:${obtener('second')}`;
}

/** ¿Cae `hora` dentro de [inicio, fin]?
 *
 *  Si fin < inicio, el intervalo cruza la medianoche (22:00–06:00) y hay que partirlo en dos
 *  tramos. La version anterior comparaba `inicio <= hora <= fin` en la propia consulta a
 *  PostgREST, asi que una regla nocturna no casaba NUNCA: a las 23:00 fallaba `hora <= 06:00`
 *  y a las 02:00 fallaba `22:00 <= hora`. Es el mismo error que ya se corrigio en los turnos
 *  del guardia (§D59); regla_acceso permite el cruce de medianoche a proposito, asi que aqui
 *  tambien hay que contemplarlo. */
function horaEnRango(hora: string, inicio: string, fin: string): boolean {
  if (inicio <= fin) return hora >= inicio && hora <= fin;
  return hora >= inicio || hora <= fin;
}

type MotivoRegla = 'SIN_REGLA_ACCESO' | 'GARITA_NO_AUTORIZADA' | 'FUERA_DE_HORARIO';

interface EvaluacionRegla {
  // deno-lint-ignore no-explicit-any
  regla: any | null;
  motivo: MotivoRegla | null;
}

/** RF-CA-005 / RF-CA-006 / RF-CA-007, en tres pasos separados y en ese orden.
 *
 *  Antes esto era una sola consulta que filtraba categoria, punto y horario a la vez: si no
 *  devolvia nada, era imposible saber cual de las tres condiciones habia fallado y todo se
 *  reportaba como FUERA_DE_HORARIO. Un guardia leia "fuera de horario" cuando el problema
 *  real era que su garita no estaba autorizada, y avisaba a la persona equivocada. RNF-CA-004
 *  pide justo lo contrario: el motivo especifico, sin ambiguedad.
 *
 *  §D24: si varias reglas siguen siendo aplicables, gana la mas especifica (la que nombra
 *  garitas concretas sobre la que vale para todas); si empatan, la mas restrictiva. */
async function evaluarReglaAcceso(
  supabase: SupabaseClient,
  idCategoria: string,
  idPuntoControl: string,
  ahora: Date,
): Promise<EvaluacionRegla> {
  const { data: reglas, error } = await supabase
    .from('regla_acceso')
    .select('*, garitas:regla_acceso_punto_control(id_punto_control)')
    .eq('id_categoria', idCategoria)
    .eq('estado_regla', 'ACTIVA');

  if (error) throw new Error(error.message);

  // 1. ¿Existe alguna regla para la categoria? (RF-CA-005)
  if (!reglas || reglas.length === 0) {
    return { regla: null, motivo: 'SIN_REGLA_ACCESO' };
  }

  // 2. ¿Alguna de ellas autoriza esta garita? (RF-CA-007)
  //    Sin garitas asociadas, la regla aplica en todas — misma semantica que la columna
  //    nullable que habia antes.
  const enEstaGarita = reglas.filter((r) => {
    const garitas = (r.garitas ?? []) as Array<{ id_punto_control: string }>;
    return garitas.length === 0 || garitas.some((g) => g.id_punto_control === idPuntoControl);
  });
  if (enEstaGarita.length === 0) {
    return { regla: null, motivo: 'GARITA_NO_AUTORIZADA' };
  }

  // 3. ¿Alguna esta vigente a esta hora? (RF-CA-006)
  const horaActual = horaLocalEcuador(ahora);
  const vigentes = enEstaGarita.filter((r) =>
    horaEnRango(horaActual, r.horario_inicio, r.horario_fin)
  );
  if (vigentes.length === 0) {
    return { regla: null, motivo: 'FUERA_DE_HORARIO' };
  }

  const especificas = vigentes.filter((r) => ((r.garitas ?? []) as unknown[]).length > 0);
  const candidatas = especificas.length > 0 ? especificas : vigentes;
  candidatas.sort((a, b) => Number(b.requiere_memorando) - Number(a.requiere_memorando));
  return { regla: candidatas[0], motivo: null };
}

async function resolverPersona(supabase: SupabaseClient, ocupante: OcupanteInput) {
  if (ocupante.id_persona) {
    const { data, error } = await supabase
      .from('persona')
      .select('*')
      .eq('id_persona', ocupante.id_persona)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }
  if (ocupante.cedula) {
    const { data, error } = await supabase
      .from('persona')
      .select('*')
      .eq('cedula', ocupante.cedula)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }
  return null;
}

/** Prioriza MEMORANDO sobre AUTORIZACION_DIARIA si ambos estan vigentes. */
async function obtenerVigenciaExterna(supabase: SupabaseClient, idPersona: string) {
  const { data, error } = await supabase
    .from('vista_vigencia_acceso')
    .select('*')
    .eq('id_persona', idPersona)
    .neq('via_vigencia', 'INTERNA_ACTIVA');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data.find((v) => v.via_vigencia === 'MEMORANDO') ?? data[0];
}

/** RF-CA-009: ¿esta persona tiene ALGUN memorando registrado, vigente o no?
 *
 *  Hace falta distinguirlo de "no esta vigente" (RF-CA-010): son dos requisitos distintos con
 *  dos mensajes distintos. A quien nunca tuvo memorando hay que tramitarle uno; a quien lo
 *  tiene vencido, renovarselo. Decirle "memorando vencido" al primero manda al guardia y a la
 *  persona a buscar un papel que no existe. */
async function tieneMemorandoRegistrado(supabase: SupabaseClient, idPersona: string) {
  const { count, error } = await supabase
    .from('persona_memorando')
    .select('id_persona_memorando', { count: 'exact', head: true })
    .eq('id_persona', idPersona);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

async function verificarVehiculoActivo(supabase: SupabaseClient, idVehiculo: string) {
  const { data, error } = await supabase
    .from('vehiculo')
    .select('estado_vehiculo, placa')
    .eq('id_vehiculo', idVehiculo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return { activo: false, motivo: 'VEHICULO_NO_AUTORIZADO: el vehiculo no existe en el sistema' };
  }
  if (data.estado_vehiculo !== 'ACTIVO') {
    return {
      activo: false,
      motivo: `VEHICULO_NO_AUTORIZADO: el vehiculo ${data.placa ?? ''} esta ${String(data.estado_vehiculo).toLowerCase()}, no autorizado para circular`,
    };
  }
  return { activo: true, motivo: null as string | null };
}

// deno-lint-ignore no-explicit-any
async function validarIngresoOcupante(
  supabase: SupabaseClient,
  persona: any,
  ocupante: OcupanteInput,
  idPuntoControl: string,
  umbrales: Umbrales,
  ahora: Date,
  contexto: { idVehiculo?: string; esVehicular: boolean },
): Promise<ResultadoValidacion> {
  const vacio = { id_regla_acceso: null, id_autorizacion_visita: null };

  // --- 1. Estado de la persona (RF-CA-008) -------------------------------------------
  // Antes esto solo se comprobaba para personas INTERNAS: una persona externa dada de baja o
  // bloqueada pasaba el control si su memorando seguia vigente. RF-CA-008 no distingue
  // ambitos — "unicamente los usuarios con estado Activo podran continuar".
  if (persona.estado !== 'ACTIVO') {
    // El estado se nombra tal cual figura en el sistema, entre parentesis, en vez de
    // incrustarlo en la frase: "la persona esta inactivo" no concuerda en genero, y los
    // catalogos estan en masculino singular por convencion (CLAUDE.md).
    const estados: Record<string, string> = {
      INACTIVO: 'no esta activa',
      BLOQUEADO: 'esta bloqueada',
      DADO_DE_BAJA: 'esta dada de baja',
    };
    return {
      autorizado: false,
      motivo: `PERSONA_NO_AUTORIZADA: la persona ${estados[persona.estado] ?? 'no esta activa'} en el sistema`,
      ...vacio,
    };
  }

  // --- 2 a 4. Regla, garita y horario (RF-CA-005 / 007 / 006) ------------------------
  const { regla, motivo: motivoRegla } = await evaluarReglaAcceso(
    supabase,
    persona.id_categoria,
    idPuntoControl,
    ahora,
  );

  if (!regla) {
    const textos: Record<MotivoRegla, string> = {
      SIN_REGLA_ACCESO:
        'no existe ninguna regla de acceso configurada para su categoria; el ingreso no puede autorizarse',
      GARITA_NO_AUTORIZADA:
        'su categoria no tiene autorizado el ingreso por esta garita',
      FUERA_DE_HORARIO:
        'la hora actual esta fuera del horario permitido para su categoria',
    };
    return {
      autorizado: false,
      motivo: `${motivoRegla}: ${textos[motivoRegla!]}`,
      ...vacio,
    };
  }

  const conRegla = { id_regla_acceso: regla.id_regla_acceso, id_autorizacion_visita: null };

  // --- 5 y 6. Memorando (RF-CA-009 / RF-CA-010) --------------------------------------
  // La comprobacion se hace siempre que la REGLA lo exija, no solo a las personas externas.
  // Antes el flag `requiere_memorando` era decorativo para el personal interno: una regla que
  // decia exigir memorando dejaba pasar a cualquier interno sin mirar si lo tenia. Es
  // literalmente lo que pide RF-CA-001: "si requiere memorando hay que validar que realmente
  // este ligado a un memorando, no tiene que ser un campo de decoracion".
  if (regla.requiere_memorando) {
    const vigencia = await obtenerVigenciaExterna(supabase, persona.id_persona);
    const conMemorandoVigente = vigencia?.via_vigencia === 'MEMORANDO';

    if (!conMemorandoVigente) {
      const tieneAlguno = await tieneMemorandoRegistrado(supabase, persona.id_persona);
      return {
        autorizado: false,
        motivo: tieneAlguno
          ? 'MEMORANDO_VENCIDO: su memorando no esta vigente en este momento'
          : 'MEMORANDO_VENCIDO: esta regla exige memorando y la persona no tiene ninguno registrado',
        id_regla_acceso: regla.id_regla_acceso,
        id_autorizacion_visita: vigencia?.id_autorizacion ?? null,
      };
    }
  }

  // Personas EXTERNAS: ademas del memorando que pueda exigir la regla, necesitan alguna via
  // de vigencia (memorando o autorizacion de visita diaria) para estar dentro del campus.
  if (persona.tipo_persona !== 'INTERNA') {
    const vigencia = await obtenerVigenciaExterna(supabase, persona.id_persona);
    if (!vigencia) {
      return {
        autorizado: false,
        motivo: 'MEMORANDO_VENCIDO: no tiene memorando vigente ni autorizacion de visita para hoy',
        id_regla_acceso: regla.id_regla_acceso,
        id_autorizacion_visita: null,
      };
    }
    conRegla.id_autorizacion_visita =
      vigencia.via_vigencia === 'AUTORIZACION_DIARIA' ? vigencia.id_autorizacion : null;
  }

  // --- 7. Biometria (RF-CA-014) ------------------------------------------------------
  // Solo el personal interno se identifica por rostro (§D20). Los externos entran por cedula
  // tecleada, asi que no hay confidence que comprobar.
  const identificadoPorRostro = typeof ocupante.confidence === 'number';
  if (persona.tipo_persona === 'INTERNA' && identificadoPorRostro) {
    const confianza = ocupante.confidence!;

    if (confianza < umbrales.biometriaRevision) {
      return {
        autorizado: false,
        motivo: `BIOMETRIA_FALLIDA: el rostro no coincide con el registro biometrico (confianza ${confianza.toFixed(3)})`,
        ...conRegla,
      };
    }

    // Banda de revision: parecido suficiente para proponer un nombre, no para autorizar solo.
    // Si el guardia no lo ha confirmado mirando a la persona, no pasa.
    if (confianza < umbrales.biometria && ocupante.confirmado_por_guardia !== true) {
      return {
        autorizado: false,
        motivo: `BIOMETRIA_FALLIDA: coincidencia dudosa (confianza ${confianza.toFixed(3)}); requiere confirmacion visual del guardia`,
        ...conRegla,
      };
    }
  }

  // --- 8 y 9. Vehiculo y doble autenticacion (RF-CA-015 / RF-CA-016 / RNF-CA-005) -----
  //
  // Estas dos comprobaciones se le hacen SOLO AL CONDUCTOR, y es importante que sea asi.
  // RF-CA-017 dice que los pasajeros cumplen "las mismas reglas de acceso establecidas para un
  // ingreso peatonal" — ni una mas. Exigirle a un pasajero estar asociado al vehiculo dejaria
  // sin poder entrar a cualquiera que llegue en el coche de un compañero, que es la mitad de
  // los ingresos vehiculares de una universidad. La placa autoriza al vehiculo y responsabiliza
  // a quien lo conduce (§D22); a los pasajeros los autoriza su propia vigencia.
  // Un externo solo circula por el campus amparado por un memorando. Una autorizacion de visita
  // diaria le permite entrar A PIE, no conduciendo ni de acompañante: el memorando es el
  // documento por el que la institucion sabe que ese vehiculo y esa gente tienen algo que hacer
  // dentro. Se comprueba a TODOS los ocupantes externos, no solo al conductor, porque la regla
  // que dio el equipo habla del personal externo y no del volante.
  //
  // Es mas estricto que RF-CA-017 (los pasajeros siguen las reglas del ingreso peatonal): ahi
  // se decidio para no dejar fuera a quien llega en el coche de un compañero, pero eso se penso
  // para personal interno. Ver §D84.
  if (contexto.esVehicular && persona.tipo_persona !== 'INTERNA') {
    const vigencia = await obtenerVigenciaExterna(supabase, persona.id_persona);
    if (vigencia?.via_vigencia !== 'MEMORANDO') {
      return {
        autorizado: false,
        motivo:
          'MEMORANDO_VENCIDO: el personal externo necesita un memorando vigente para entrar en vehiculo; sin el, puede ingresar a pie',
        ...conRegla,
      };
    }
  }

  if (contexto.esVehicular && contexto.idVehiculo && ocupante.es_conductor === true) {
    const asociada = await supabase.rpc('persona_asociada_a_vehiculo', {
      p_id_persona: persona.id_persona,
      p_id_vehiculo: contexto.idVehiculo,
    });
    if (asociada.error) throw new Error(asociada.error.message);

    if (asociada.data !== true) {
      return {
        autorizado: false,
        motivo: 'PLACA_NO_RECONOCIDA: quien conduce no esta autorizado a usar este vehiculo',
        ...conRegla,
      };
    }

    // RNF-CA-005: al conductor se le exigen LAS DOS validaciones. Un pasajero puede entrar
    // identificado por cedula, pero quien va al volante tiene que haber pasado por el rostro:
    // si no, basta con conducir el coche de otro para entrar con su placa.
    if (persona.tipo_persona === 'INTERNA' && !identificadoPorRostro) {
      return {
        autorizado: false,
        motivo: 'DOBLE_AUTENTICACION_FALLIDA: el conductor debe identificarse tambien por reconocimiento facial',
        ...conRegla,
      };
    }

    // El segundo factor del conductor EXTERNO no puede ser el rostro (§D20: no tiene registro
    // biometrico), asi que lo es el memorando: tiene que amparar precisamente este vehiculo.
    // Sin esto, un externo con memorando podria entrar conduciendo cualquier coche del que
    // figure como propietario, que es justo lo que el memorando no dice.
    if (persona.tipo_persona !== 'INTERNA') {
      const amparado = await supabase.rpc('vehiculo_amparado_por_memorando', {
        p_id_persona: persona.id_persona,
        p_id_vehiculo: contexto.idVehiculo,
      });
      if (amparado.error) throw new Error(amparado.error.message);

      if (amparado.data !== true) {
        return {
          autorizado: false,
          motivo:
            'DOBLE_AUTENTICACION_FALLIDA: su memorando vigente no ampara este vehiculo; la placa debe estar registrada en el memorando',
          ...conRegla,
        };
      }
    }
  }

  return { autorizado: true, motivo: null, ...conRegla };
}

// deno-lint-ignore no-explicit-any
async function validarSalidaOcupante(
  supabase: SupabaseClient,
  persona: any,
  idPuntoControl: string,
  salidaManualForzada: boolean,
  motivoSalidaManual: string | undefined,
): Promise<ResultadoValidacion> {
  // La vigencia nunca se revalida en la SALIDA (resumen operativo, doc04): a quien ya esta
  // dentro se le deja salir.

  // RF-CA-013: la salida se asocia al ingreso correspondiente. Se busca el ultimo INGRESO
  // AUTORIZADO de la persona que no tenga ya una salida colgada, sin acotarlo al dia natural:
  // quien entra a las 23:00 y sale a las 02:00 tiene su ingreso en la fecha anterior, y
  // acotar a "hoy" dejaba esa salida huerfana.
  const { data: ingresos, error } = await supabase
    .from('evento_acceso')
    .select('id_evento, id_punto_control, id_autorizacion_visita, fecha_hora')
    .eq('id_persona', persona.id_persona)
    .eq('tipo_movimiento', 'INGRESO')
    .eq('resultado', 'AUTORIZADO')
    .order('fecha_hora', { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);

  interface IngresoAbierto {
    id_evento: string;
    id_punto_control: string;
    id_autorizacion_visita: string | null;
    fecha_hora: string;
  }
  let ultimoIngreso: IngresoAbierto | null = null;
  for (const ingreso of ingresos ?? []) {
    const { count, error: errorSalida } = await supabase
      .from('evento_acceso')
      .select('id_evento', { count: 'exact', head: true })
      .eq('id_evento_ingreso', ingreso.id_evento);
    if (errorSalida) throw new Error(errorSalida.message);
    if ((count ?? 0) === 0) {
      ultimoIngreso = ingreso as IngresoAbierto;
      break;
    }
  }

  const base = {
    id_regla_acceso: null,
    id_autorizacion_visita: ultimoIngreso?.id_autorizacion_visita ?? null,
    idEventoIngreso: ultimoIngreso?.id_evento ?? null,
  };

  if (salidaManualForzada) {
    // Valvula 2 (§D23): siempre disponible, con justificacion.
    return {
      autorizado: true,
      motivo: motivoSalidaManual ?? 'Salida manual forzada por el guardia',
      ...base,
      generarAlertaInformativa: 'PUNTO_SALIDA_INCORRECTO',
    };
  }

  // Si no hay ningun ingreso registrado, la salida se AUTORIZA igualmente. No es un descuido:
  // denegar una salida no impide nada, retiene a una persona dentro del campus. Puede haber
  // entrado antes de que el sistema existiera, por una garita con el equipo caido, o su
  // ingreso pudo quedar denegado y colarse igual — y en los tres casos lo que hay que hacer es
  // dejarla salir y que quede el registro, no discutir con ella en la puerta. El evento se
  // guarda con id_evento_ingreso nulo, que es la señal de que esa salida no casa con ningun
  // ingreso y merece una mirada en el historial.

  // La regla del "mismo punto" solo aplica a visitantes con autorizacion de visita diaria
  // (§D23), no a externos con memorando ni a internos.
  const esVisitaDiaria = Boolean(ultimoIngreso?.id_autorizacion_visita);
  if (!ultimoIngreso || !esVisitaDiaria || ultimoIngreso.id_punto_control === idPuntoControl) {
    return { autorizado: true, motivo: null, ...base };
  }

  const { data: puntoIngreso, error: puntoError } = await supabase
    .from('punto_control')
    .select('estado_punto')
    .eq('id_punto_control', ultimoIngreso.id_punto_control)
    .maybeSingle();
  if (puntoError) throw new Error(puntoError.message);

  if (puntoIngreso && puntoIngreso.estado_punto !== 'ACTIVO') {
    // Valvula 1 (§D23): el punto de ingreso no esta operativo -> se autoriza la salida por
    // otro punto, con alerta.
    return {
      autorizado: true,
      motivo: 'Salida autorizada por punto alterno: el punto de ingreso no esta operativo',
      ...base,
      generarAlertaInformativa: 'PUNTO_SALIDA_INCORRECTO',
    };
  }

  return {
    autorizado: false,
    motivo: 'PUNTO_SALIDA_INCORRECTO: debe salir por la misma garita por la que ingreso',
    ...base,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return errorResponse('Metodo no permitido', 405);
  }

  let body: RegistrarEventoBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('JSON invalido', 400);
  }

  const { origen_registro, tipo_movimiento, id_punto_control, ocupantes } = body;

  if (origen_registro !== 'AUTOMATICA' && origen_registro !== 'MANUAL') {
    return errorResponse('origen_registro debe ser AUTOMATICA o MANUAL', 400);
  }
  if (tipo_movimiento !== 'INGRESO' && tipo_movimiento !== 'SALIDA') {
    return errorResponse('tipo_movimiento debe ser INGRESO o SALIDA', 400);
  }
  if (!id_punto_control || !Array.isArray(ocupantes) || ocupantes.length === 0) {
    return errorResponse('id_punto_control y al menos un ocupante son obligatorios', 400);
  }

  const supabaseService = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Se comprueba la identidad del lector antes de aceptar nada, pero hasta ahora no se anotaba
  // CUAL era. Si una camara empieza a autorizar lo que no debe, el historico tiene que poder
  // decir que aparato lo hizo.
  let idDispositivo: string | null = null;

  // ---- Autenticacion del llamador (docs/01_AUTENTICACION_Y_ROLES.md §4) ----
  if (origen_registro === 'AUTOMATICA') {
    if (!body.codigo_mac || !body.direccion_ip) {
      return errorResponse('codigo_mac y direccion_ip son obligatorios para origen_registro=AUTOMATICA', 400);
    }
    const { data: dispositivo, error: dispError } = await supabaseService
      .from('dispositivo')
      .select('id_dispositivo, estado_dispositivo')
      .eq('id_punto_control', id_punto_control)
      .eq('codigo_mac', body.codigo_mac)
      .eq('direccion_ip', body.direccion_ip)
      .maybeSingle();

    if (dispError) return errorResponse(dispError.message, 500);

    idDispositivo = dispositivo?.id_dispositivo ?? null;

    if (!dispositivo || dispositivo.estado_dispositivo !== 'OPERATIVO') {
      // Sin evento real que referenciar todavia: se deja constancia en bitacora_sistema
      // (nunca en alerta_seguridad, que exige id_evento NOT NULL). Ver docs/99.
      await supabaseService.from('bitacora_sistema').insert({
        accion: 'RECHAZO_DISPOSITIVO_NO_RECONOCIDO',
        modulo: 'CAC',
        entidad_afectada: 'dispositivo',
        id_entidad_afectada: `${body.codigo_mac}@${body.direccion_ip}`,
        resultado: 'ERROR',
        descripcion: `Dispositivo no reconocido u OPERATIVO en punto_control=${id_punto_control}`,
      });
      return errorResponse('Dispositivo no reconocido', 401);
    }
  }

  let idUsuarioGuardia: string | null = null;
  if (origen_registro === 'MANUAL') {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Se requiere el JWT del guardia para origen_registro=MANUAL', 401);
    }
    const jwt = authHeader.replace('Bearer ', '');
    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: userData, error: userError } = await supabaseAnon.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return errorResponse('JWT invalido o expirado', 401);
    }
    idUsuarioGuardia = userData.user.id;

    // Barrera de turno (req 34): un guardia solo registra eventos dentro de su turno/hora. Se
    // evalua con la hora del SERVIDOR, nunca con la del navegador. Como esta funcion escribe
    // con service_role (auth.uid() nulo), el trigger de la BD no cubre este camino.
    const supabaseGuardia = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: turno, error: turnoError } = await supabaseGuardia.rpc('verificar_turno_guardia_actual');
    if (turnoError) return errorResponse(turnoError.message, 500);
    if (turno && (turno as { permitido: boolean }).permitido === false) {
      await supabaseGuardia.rpc('registrar_intento_fuera_de_turno', {
        p_detalle: `Intento de registrar ${tipo_movimiento} en punto_control=${id_punto_control} fuera de turno.`,
      });
      return errorResponse(
        (turno as { motivo: string }).motivo ?? 'Su turno no se encuentra habilitado a esta hora.',
        403,
      );
    }
  }

  const esVehicular = Boolean(body.id_vehiculo) || Boolean(body.placa_detectada);
  const tipoAcceso = esVehicular ? 'VEHICULAR' : 'PEATONAL';
  const placaDetectada = body.placa_detectada
    ? String(body.placa_detectada).toUpperCase().replace(/[^A-Z0-9]/g, '')
    : null;

  // ---- Resolver todos los ocupantes antes de escribir nada ----
  const personasResueltas: Array<{ ocupante: OcupanteInput; persona: Record<string, unknown> | null }> = [];
  for (const ocupante of ocupantes) {
    // RF-CA-021: un rostro que no coincide con nadie SI genera evento, sin persona asociada.
    // Antes esto devolvia 404 y el intento no dejaba rastro en ningun sitio — justo el caso
    // que mas interesa registrar.
    if (ocupante.desconocido === true) {
      personasResueltas.push({ ocupante, persona: null });
      continue;
    }

    const persona = await resolverPersona(supabaseService, ocupante);
    if (!persona) {
      return errorResponse(
        `Persona no encontrada para ocupante (${ocupante.id_persona ?? ocupante.cedula ?? 'sin identificador'})`,
        404,
      );
    }
    personasResueltas.push({ ocupante, persona });
  }

  const umbrales: Umbrales = {
    biometria: await obtenerParametro(supabaseService, 'UMBRAL_BIOMETRIA'),
    biometriaRevision: await obtenerParametro(supabaseService, 'UMBRAL_BIOMETRIA_REVISION'),
  };

  // ---- Vehicular: la placa autoriza al vehiculo, no a las personas (§D22) ----
  let vehiculoActivo = true;
  let motivoVehiculoInactivo: string | null = null;
  if (body.id_vehiculo) {
    const chequeo = await verificarVehiculoActivo(supabaseService, body.id_vehiculo);
    vehiculoActivo = chequeo.activo;
    motivoVehiculoInactivo = chequeo.motivo;
  } else if (placaDetectada) {
    // Se leyo una placa que no resolvio a ningun vehiculo registrado (RF-CA-015 / RF-CA-023).
    vehiculoActivo = false;
    motivoVehiculoInactivo = `PLACA_NO_RECONOCIDA: la placa ${placaDetectada} no corresponde a ningun vehiculo registrado`;
  }

  const ahora = new Date();
  const fechaHora = ahora.toISOString();
  const resultadosEventos: Array<Record<string, unknown>> = [];
  const alertasInformativas: Array<{ id_evento: string; tipo_alerta: string }> = [];

  for (const { ocupante, persona } of personasResueltas) {
    let resultado: ResultadoValidacion;

    if (!persona) {
      // RF-CA-021 — persona desconocida.
      resultado = {
        autorizado: false,
        motivo: 'PERSONA_DESCONOCIDA: el rostro capturado no coincide con ninguna persona registrada',
        id_regla_acceso: null,
        id_autorizacion_visita: null,
      };
    } else if (!vehiculoActivo) {
      // RF-CA-019: la denegacion del vehiculo corta la cadena para todos sus ocupantes.
      resultado = { autorizado: false, motivo: motivoVehiculoInactivo, id_regla_acceso: null, id_autorizacion_visita: null };
    } else if (tipo_movimiento === 'INGRESO') {
      resultado = await validarIngresoOcupante(
        supabaseService, persona, ocupante, id_punto_control, umbrales, ahora,
        { idVehiculo: body.id_vehiculo, esVehicular },
      );
    } else {
      resultado = await validarSalidaOcupante(
        supabaseService,
        persona,
        id_punto_control,
        body.salida_manual_forzada === true,
        body.motivo_salida_manual,
      );
    }

    const { data: eventoInsertado, error: insertError } = await supabaseService
      .from('evento_acceso')
      .insert({
        id_persona: persona?.id_persona ?? null,
        id_vehiculo: body.id_vehiculo ?? null,
        id_punto_control,
        tipo_movimiento,
        tipo_acceso: tipoAcceso,
        fecha_hora: fechaHora,
        resultado: resultado.autorizado ? 'AUTORIZADO' : 'DENEGADO',
        motivo_resultado: resultado.motivo,
        origen_registro,
        id_regla_acceso: resultado.id_regla_acceso,
        id_autorizacion_visita: resultado.id_autorizacion_visita,
        id_evento_ingreso: resultado.idEventoIngreso ?? null,
        es_conductor: ocupante.es_conductor === true,
        placa_detectada: placaDetectada,
        confianza_placa: typeof body.confianza_placa === 'number' ? body.confianza_placa : null,
        confianza_biometria: typeof ocupante.confidence === 'number' ? ocupante.confidence : null,
        // La atribucion vive en el evento y no solo en una fila suelta de la bitacora con los
        // ids concatenados por comas: asi "quien dejo entrar a esta persona" se responde desde
        // la pantalla y no rastreando a mano.
        id_dispositivo: idDispositivo,
        id_usuario_registro: idUsuarioGuardia,
      })
      .select('id_evento')
      .single();

    if (insertError) {
      return errorResponse(`Error registrando evento: ${insertError.message}`, 500);
    }

    if (resultado.generarAlertaInformativa) {
      alertasInformativas.push({ id_evento: eventoInsertado.id_evento, tipo_alerta: resultado.generarAlertaInformativa });
    }

    resultadosEventos.push({
      id_evento: eventoInsertado.id_evento,
      id_persona: persona?.id_persona ?? null,
      cedula: ocupante.cedula ?? null,
      es_conductor: ocupante.es_conductor === true,
      autorizado: resultado.autorizado,
      motivo: resultado.motivo,
    });
  }

  // Alertas informativas de las valvulas de escape (§D23): el evento queda AUTORIZADO pero
  // igual se genera alerta. El trigger solo dispara sobre eventos DENEGADO (§D4).
  for (const alerta of alertasInformativas) {
    await supabaseService.from('alerta_seguridad').insert({
      id_evento: alerta.id_evento,
      tipo_alerta: alerta.tipo_alerta,
      nivel_riesgo: 'MEDIO',
      estado_alerta: 'PENDIENTE',
    });
  }

  // El trigger automatico de bitacora lee auth.uid(), que aqui es NULL (service_role). Se deja
  // una fila explicita con la atribucion correcta para el camino MANUAL. Ver docs/99 (E11).
  if (origen_registro === 'MANUAL' && idUsuarioGuardia) {
    await supabaseService.from('bitacora_sistema').insert({
      id_usuario: idUsuarioGuardia,
      accion: 'REGISTRO_MANUAL_EVENTO_ACCESO',
      modulo: 'CAC',
      entidad_afectada: 'evento_acceso',
      id_entidad_afectada: resultadosEventos.map((e) => e.id_evento).join(','),
      resultado: 'EXITO',
      descripcion: `Registro manual del guardia para ${resultadosEventos.length} ocupante(s) en punto_control=${id_punto_control}`,
    });
  }

  const vehiculoAutorizado = resultadosEventos.every((e) => e.autorizado === true);

  return jsonResponse({
    id_punto_control,
    tipo_movimiento,
    tipo_acceso: tipoAcceso,
    origen_registro,
    id_vehiculo: body.id_vehiculo ?? null,
    placa_detectada: placaDetectada,
    vehiculo_autorizado: esVehicular ? vehiculoAutorizado : undefined,
    ocupantes: resultadosEventos,
  });
});
