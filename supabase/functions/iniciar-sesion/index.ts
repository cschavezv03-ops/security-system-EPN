// iniciar-sesion
//
// Proxy del inicio de sesion que aplica la politica de intentos fallidos
// (MAX_INTENTOS_LOGIN / TIEMPO_BLOQUEO_CUENTA_MIN de parametro_sistema).
//
// Por que existe: el navegador habla directamente con GoTrue, asi que la base de
// datos nunca se entera de un intento fallido y `usuario_sistema.intentos_fallidos`
// se quedaba siempre en 0. El Auth Hook de GoTrue seria el lugar ideal para
// contarlos, pero requiere plan de pago (HTTP 402 al intentar activarlo), asi que
// el conteo se hace aqui.
//
// Lo que hace que el bloqueo sea REAL y no cosmetico: al alcanzarse el maximo,
// registrar_intento_login() escribe `auth.users.banned_until`. Desde ese momento
// GoTrue rechaza el acceso aunque alguien llame a /auth/v1/token directamente con
// la clave publica, sin pasar por esta funcion. Y como es una marca de tiempo, el
// desbloqueo a los 15 minutos ocurre solo.
//
// verify_jwt DEBE ser false: quien inicia sesion todavia no esta autenticado.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CORS_HEADERS, errorResponse, jsonResponse } from '../_shared/respuestas.ts';

interface CuerpoLogin {
  email?: string;
  password?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return errorResponse('Metodo no permitido', 405);
  }

  let body: CuerpoLogin;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Solicitud invalida', 400);
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) {
    return errorResponse('Debe indicar el correo y la contraseña.', 400);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const admin = createClient(url, serviceKey);

  // Perfil del sistema asociado al correo. Si no existe, se deja que GoTrue
  // responda lo suyo: no se revela si la cuenta existe o no.
  const { data: usuario, error: errorUsuario } = await admin
    .from('usuario_sistema')
    .select('id_usuario, bloqueado_hasta, estado_usuario')
    .eq('correo_electronico', email)
    .maybeSingle();

  // No se debe convertir un fallo al consultar el perfil en "contraseña incorrecta": eso
  // ocultaría precisamente el estado administrativo que este proxy debe comunicar. Ante un
  // problema de base se devuelve un error operativo y no se intenta autenticar a ciegas.
  if (errorUsuario) {
    console.error('No se pudo consultar el estado de la cuenta:', errorUsuario.message);
    return jsonResponse(
      {
        error_code: 'account_state_unavailable',
        message: 'No se pudo verificar el estado de la cuenta. Inténtelo nuevamente.',
      },
      503,
    );
  }

  const estadoUsuario = usuario?.estado_usuario?.trim().toUpperCase();

  // Los estados administrativos son causas distintas de rechazo. GoTrue los representa a
  // todos como un ban y devolvería el mismo error genérico; se resuelven antes para que la
  // persona sepa si debe pedir desbloqueo o reactivación de la cuenta.
  if (estadoUsuario === 'BLOQUEADO') {
    return jsonResponse(
      {
        error_code: 'account_blocked_by_admin',
        message: 'La cuenta fue bloqueada por el administrador. Solicite su desbloqueo.',
      },
      423,
    );
  }
  if (estadoUsuario === 'DADO_DE_BAJA') {
    return jsonResponse(
      {
        error_code: 'account_deactivated',
        message: 'La cuenta fue dada de baja. Solicite su reactivación al administrador.',
      },
      403,
    );
  }
  if (estadoUsuario === 'INACTIVO') {
    return jsonResponse(
      {
        error_code: 'account_inactive',
        message: 'La cuenta está inactiva. Solicite su activación al administrador.',
      },
      403,
    );
  }

  // 1) Bloqueo vigente: ni siquiera se comprueba la contraseña.
  if (usuario?.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
    const minutos = Math.max(
      1,
      Math.ceil((new Date(usuario.bloqueado_hasta).getTime() - Date.now()) / 60000),
    );
    return jsonResponse(
      {
        error_code: 'account_locked',
        minutos_restantes: minutos,
        message:
          `Cuenta bloqueada temporalmente por superar el maximo de intentos fallidos. ` +
          `Podra intentarlo de nuevo en ${minutos} minuto(s) o solicitar el desbloqueo al administrador.`,
      },
      423,
    );
  }

  // 2) Verificacion real de credenciales contra GoTrue.
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: sesion, error } = await anon.auth.signInWithPassword({ email, password });

  // 3) Se registra el resultado y se aplica la politica.
  let estado: Record<string, unknown> | null = null;
  if (usuario?.id_usuario) {
    const { data } = await admin.rpc('registrar_intento_login', {
      p_id_usuario: usuario.id_usuario,
      p_valido: !error,
    });
    estado = (data as Record<string, unknown> | null) ?? null;
  }

  if (error) {
    // Si este intento agoto el cupo, se informa el bloqueo en vez del error generico.
    if (estado && estado.bloqueado === true) {
      return jsonResponse(
        {
          error_code: 'account_locked',
          minutos_restantes: estado.minutos_restantes ?? null,
          message:
            `Cuenta bloqueada temporalmente por superar ${estado.max_intentos ?? 5} intentos fallidos. ` +
            `Podra intentarlo de nuevo en ${estado.minutos_restantes ?? 15} minutos o solicitar el desbloqueo al administrador.`,
        },
        423,
      );
    }

    // Credenciales incorrectas: se devuelve el codigo estable para que el
    // frontend lo traduzca, junto con los intentos que quedan.
    return jsonResponse(
      {
        error_code: 'invalid_credentials',
        intentos_restantes: estado?.intentos_restantes ?? null,
        message: 'Correo o contraseña incorrectos.',
      },
      401,
    );
  }

  // 4) Credenciales correctas: se devuelve la sesion para que el cliente la instale.
  return jsonResponse({
    access_token: sesion.session?.access_token,
    refresh_token: sesion.session?.refresh_token,
  });
});
