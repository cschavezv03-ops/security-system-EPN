// scripts/seed_remoto.mjs
//
// Siembra las cuentas de arranque (§D13: primer administrador + guardia demo)
// en el proyecto REMOTO de Supabase, usando la Auth Admin API de GoTrue en vez
// de un INSERT crudo en auth.users. Esto resuelve la duda E5: la Admin API crea
// usuarios plenamente validos para GoTrue (tokens, identidad, providers), cosa
// que un INSERT manual no garantiza en la version hosted.
//
// Los datos de seguridad (roles, permisos, categorias, parametros) NO se siembran
// aqui: viven en la migracion 20260713192400_datos_seguridad.sql y ya estan en el
// remoto via `supabase db push`.
//
// El trigger on_auth_user_created (migracion de autenticacion) crea
// automaticamente la fila en public.usuario_sistema al crearse cada auth.user,
// leyendo id_persona y nombre_usuario de user_metadata. Por eso las personas se
// crean ANTES que las cuentas.
//
// Idempotente: personas/zona/punto se hacen con upsert; los usuarios se saltan si
// el email ya existe; usuario_rol y guardia_punto_control se insertan solo si
// faltan.
//
// Uso:
//   SUPABASE_URL="https://<ref>.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="<service_role key>" \
//   node scripts/seed_remoto.mjs

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}

// Contraseña de arranque comun; requiere_cambio_password se fuerza a true.
// DEBE rotarse en el primer login antes de cualquier uso real.
const PASSWORD_ARRANQUE = 'CambiarInmediatamente#2026';

// UUIDs fijos de las personas / infraestructura demo (reproducible).
const ADMIN_PERSONA_ID = '00000000-0000-0000-0000-000000000001';
const GUARDIA_PERSONA_ID = '00000000-0000-0000-0000-000000000003';
const ZONA_ID = '00000000-0000-0000-0000-000000000005';
const PUNTO_ID = '00000000-0000-0000-0000-000000000006';

// Responsables operativos: un usuario por modulo, para poder ingresar al
// sistema y operar/probar cada modulo. Todos INTERNA, categoria ADMINISTRATIVO.
// ⚠️ Las cedulas son PLACEHOLDER (persona.cedula es NOT NULL): ADM debe
// reemplazarlas por las reales. UUIDs fijos para que el seed sea idempotente.
const RESPONSABLES = [
  { persona: '00000000-0000-0000-0000-0000000000a1', email: 'gary.defas@epn.edu.ec',     usuario: 'gary.defas',     nombres: 'Gary',      apellidos: 'Defas',      cedula: '9999999990', rol: 'DIRECTOR_ADMINISTRATIVO' },
  { persona: '00000000-0000-0000-0000-0000000000a2', email: 'lenin.amangandi@epn.edu.ec', usuario: 'lenin.amangandi', nombres: 'Lenin',   apellidos: 'Amangandi',  cedula: '9999999991', rol: 'RESPONSABLE_PERSONAL_INTERNO' },
  { persona: '00000000-0000-0000-0000-0000000000a3', email: 'joel.velastegui@epn.edu.ec', usuario: 'joel.velastegui', nombres: 'Joel',    apellidos: 'Velastegui', cedula: '9999999992', rol: 'RESPONSABLE_PERSONAL_EXTERNO' },
  { persona: '00000000-0000-0000-0000-0000000000a4', email: 'heidy.tenelema@epn.edu.ec',  usuario: 'heidy.tenelema',  nombres: 'Heidy',   apellidos: 'Tenelema',   cedula: '9999999993', rol: 'RESPONSABLE_PUNTOS_CONTROL' },
  { persona: '00000000-0000-0000-0000-0000000000a5', email: 'carlos.chavez03@epn.edu.ec', usuario: 'carlos.chavez03', nombres: 'Sebastián', apellidos: 'Chávez',   cedula: '9999999994', rol: 'RESPONSABLE_CONTROL_ACCESOS' },
];

const restHeaders = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = { ...restHeaders };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${method} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function auth(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${URL}/auth/v1/${path}`, {
    method,
    headers: restHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`AUTH ${method} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function categoriaId(codigo) {
  const rows = await rest(`categoria_persona?codigo_categoria=eq.${codigo}&select=id_categoria`);
  if (!rows.length) throw new Error(`Categoria ${codigo} no encontrada (¿se aplico la migracion de datos de seguridad?)`);
  return rows[0].id_categoria;
}

async function rolId(nombre) {
  const rows = await rest(`rol?nombre_rol=eq.${nombre}&select=id_rol`);
  if (!rows.length) throw new Error(`Rol ${nombre} no encontrado`);
  return rows[0].id_rol;
}

async function upsertPersona(persona) {
  await rest('persona?on_conflict=id_persona', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: persona,
  });
}

async function findUserByEmail(email) {
  // La Admin API pagina; buscamos en la primera pagina (suficiente para el arranque).
  const data = await auth(`admin/users?per_page=200`);
  const users = data.users ?? data;
  return users.find((u) => u.email === email) ?? null;
}

async function ensureUser(email, id_persona, nombre_usuario) {
  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`  usuario ${email} ya existe (${existing.id})`);
    return existing.id;
  }
  const created = await auth('admin/users', {
    method: 'POST',
    body: {
      email,
      password: PASSWORD_ARRANQUE,
      email_confirm: true,
      user_metadata: { id_persona, nombre_usuario },
    },
  });
  console.log(`  usuario ${email} creado (${created.id})`);
  return created.id;
}

async function ensureUsuarioRol(id_usuario, id_rol) {
  const existing = await rest(
    `usuario_rol?id_usuario=eq.${id_usuario}&id_rol=eq.${id_rol}&estado_asignacion=eq.ACTIVO&select=id_usuario_rol`,
  );
  if (existing.length) return;
  await rest('usuario_rol', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { id_usuario, id_rol, estado_asignacion: 'ACTIVO' },
  });
}

async function main() {
  console.log('1. Personas de arranque (upsert)...');
  const idCatAdministrativo = await categoriaId('ADMINISTRATIVO');
  const idCatTrabajador = await categoriaId('TRABAJADOR');

  await upsertPersona({
    id_persona: ADMIN_PERSONA_ID, tipo_persona: 'INTERNA', id_categoria: idCatAdministrativo,
    cedula: '9999999999', nombres: 'Administrador', apellidos: 'del Sistema',
    correo: 'admin@epn.edu.ec', estado: 'ACTIVO',
  });
  await upsertPersona({
    id_persona: GUARDIA_PERSONA_ID, tipo_persona: 'INTERNA', id_categoria: idCatTrabajador,
    cedula: '9999999998', nombres: 'Guardia', apellidos: 'Demo',
    correo: 'guardia.demo@epn.edu.ec', estado: 'ACTIVO',
  });

  console.log('2. Cuentas de Auth (Admin API)...');
  const adminUserId = await ensureUser('admin@epn.edu.ec', ADMIN_PERSONA_ID, 'admin');
  const guardiaUserId = await ensureUser('guardia.demo@epn.edu.ec', GUARDIA_PERSONA_ID, 'guardia_demo');

  console.log('3. Forzar requiere_cambio_password...');
  await rest(`usuario_sistema?id_usuario=eq.${adminUserId}`, {
    method: 'PATCH', prefer: 'return=minimal', body: { requiere_cambio_password: true },
  });
  await rest(`usuario_sistema?id_usuario=eq.${guardiaUserId}`, {
    method: 'PATCH', prefer: 'return=minimal', body: { requiere_cambio_password: true },
  });

  console.log('4. Asignacion de roles...');
  await ensureUsuarioRol(adminUserId, await rolId('ADMINISTRADOR_SISTEMA'));
  await ensureUsuarioRol(guardiaUserId, await rolId('GUARDIA_SEGURIDAD'));

  console.log('4b. Responsables de modulo (persona + cuenta + rol)...');
  for (const r of RESPONSABLES) {
    await upsertPersona({
      id_persona: r.persona, tipo_persona: 'INTERNA', id_categoria: idCatAdministrativo,
      cedula: r.cedula, nombres: r.nombres, apellidos: r.apellidos, correo: r.email, estado: 'ACTIVO',
    });
    const uid = await ensureUser(r.email, r.persona, r.usuario);
    await rest(`usuario_sistema?id_usuario=eq.${uid}`, {
      method: 'PATCH', prefer: 'return=minimal', body: { requiere_cambio_password: true },
    });
    await ensureUsuarioRol(uid, await rolId(r.rol));
  }

  console.log('5. Infraestructura demo (zona + punto_control, upsert)...');
  await rest('zona?on_conflict=id_zona', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: { id_zona: ZONA_ID, nombre_zona: 'Campus EPN (demo)', tipo_zona: 'CAMPUS', estado_zona: 'ACTIVA' },
  });
  await rest('punto_control?on_conflict=id_punto_control', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: { id_punto_control: PUNTO_ID, id_zona: ZONA_ID, nombre_punto: 'Garita Principal (demo)', estado_punto: 'ACTIVO' },
  });

  console.log('6. Asignacion guardia -> punto de control (§D11)...');
  const gpc = await rest(
    `guardia_punto_control?id_usuario=eq.${guardiaUserId}&id_punto_control=eq.${PUNTO_ID}&estado_asignacion=eq.ACTIVA&select=id_asignacion`,
  );
  if (!gpc.length) {
    await rest('guardia_punto_control', {
      method: 'POST', prefer: 'return=minimal',
      body: {
        id_usuario: guardiaUserId, id_punto_control: PUNTO_ID, turno: 'MATUTINO',
        estado_asignacion: 'ACTIVA', id_usuario_registro: adminUserId,
      },
    });
  }

  console.log('\nOK. Cuentas listas (contrasena comun, requiere_cambio_password=true):');
  console.log(`  admin@epn.edu.ec / ${PASSWORD_ARRANQUE}  (ADMINISTRADOR_SISTEMA)`);
  console.log(`  guardia.demo@epn.edu.ec / ${PASSWORD_ARRANQUE}  (GUARDIA_SEGURIDAD, garita demo)`);
  for (const r of RESPONSABLES) {
    console.log(`  ${r.email} / ${PASSWORD_ARRANQUE}  (${r.rol})`);
  }
  console.log('\n⚠️  Las cedulas de los responsables son PLACEHOLDER (9999999990-4); reemplazar por las reales desde ADM.');
}

main().catch((e) => { console.error('\nFALLO:', e.message); process.exit(1); });
