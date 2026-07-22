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
  const { data: usuario } = await admin
    .from('usuario_sistema')
    .select('id_usuario, bloqueado_hasta, estado_usuario')
    .eq('correo_electronico', email)
    .maybeSingle();

  // 1) Estado ADMINISTRATIVO de la cuenta: lo decidio una persona, no un contador.
  //
  // Esta comprobacion faltaba, y su ausencia producia el peor mensaje posible. Al bloquear o
  // dar de baja a alguien, el trigger `sincronizar_estado_auth` escribe banned_until en
  // auth.users; GoTrue entonces rechaza el login, pero devuelve un error que aqui se traducia
  // como "credenciales invalidas". Consecuencias:
  //
  //   - al usuario se le decia que su contraseña estaba mal, cuando era correcta;
  //   - y encima se le contaban intentos fallidos que nunca cometio, asi que una cuenta ya
  //     bloqueada acumulaba 4 de 5 "fallos" y amenazaba con bloquearse otra vez.
  //
  // `estado_usuario` se leia en el SELECT de arriba desde el principio... y no se usaba en
  // ninguna parte. Ahora decide, y ANTES de tocar GoTrue, para que el intento no cuente.
  //
  // Nota de diseño: distinguir estos casos revela que la cuenta existe. Es una concesion
  // deliberada — este es un sistema interno con correos institucionales predecibles, donde
  // ocultar la existencia aporta poco, y en cambio decirle a alguien "su cuenta esta
  // bloqueada, hable con el administrador" le ahorra media hora de llamadas creyendo que
  // olvido su contraseña.
  if (usuario && usuario.estado_usuario !== 'ACTIVO') {
    const porEstado: Record<string, { codigo: string; mensaje: string }> = {
      BLOQUEADO: {
        codigo: 'account_blocked',
        mensaje:
          'Su cuenta esta bloqueada por un administrador. No es un problema de contraseña: ' +
          'comuniquese con el administrador del sistema para que la desbloquee.',
      },
      DADO_DE_BAJA: {
        codigo: 'account_disabled',
        mensaje:
          'Su cuenta fue dada de baja y ya no permite el ingreso al sistema. ' +
          'Si cree que es un error, comuniquese con el administrador del sistema.',
      },
      INACTIVO: {
        codigo: 'account_inactive',
        mensaje:
          'Su cuenta esta inactiva y no permite el ingreso. ' +
          'Comuniquese con el administrador del sistema para reactivarla.',
      },
    };

    const caso = porEstado[usuario.estado_usuario] ?? {
      codigo: 'account_disabled',
      mensaje:
        'Su cuenta no se encuentra activa y no permite el ingreso. ' +
        'Comuniquese con el administrador del sistema.',
    };

    return jsonResponse({ error_code: caso.codigo, message: caso.mensaje }, 403);
  }

  // 2) Bloqueo TEMPORAL por intentos fallidos: ni siquiera se comprueba la contraseña.
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

  // 3) Verificacion real de credenciales contra GoTrue.
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: sesion, error } = await anon.auth.signInWithPassword({ email, password });

  // 4) Se registra el resultado y se aplica la politica.
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

  // 5) Credenciales correctas: se devuelve la sesion para que el cliente la instale.
  return jsonResponse({
    access_token: sesion.session?.access_token,
    refresh_token: sesion.session?.refresh_token,
  });
});
