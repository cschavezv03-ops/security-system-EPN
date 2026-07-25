-- Seed de bootstrap (SOLO desarrollo local, via `supabase db reset`).
--
-- Los datos de seguridad (rol, permiso, rol_permiso, categoria_persona,
-- parametro_sistema) YA NO viven aqui: se movieron a la migracion
-- 20260713192400_datos_seguridad.sql para que existan en todos los entornos
-- (el remoto se siembra via db push, no via este seed).
--
-- Este archivo solo crea las cuentas de arranque (§D13 admin + guardia demo)
-- insertando directamente en auth.users, patron que funciona en el stack
-- LOCAL. En el proyecto REMOTO estas dos cuentas se crean con la Auth Admin
-- API (ver scripts/seed_remoto.mjs), que garantiza usuarios validos para
-- GoTrue -- resolviendo la duda E5. El estado final (mismos UUIDs y filas)
-- es identico por ambas vias.

-- ================= BOOTSTRAP: PRIMER ADMINISTRADOR (§D13) =================
-- El ADMINISTRADOR_SISTEMA no tiene INSERT sobre persona (§D5): sin este seed
-- nadie podria crear la primera cuenta. Se inserta persona + auth.users (el
-- trigger on_auth_user_created crea usuario_sistema automaticamente) +
-- usuario_rol. UUIDs fijos para que el seed sea idempotente en cada reset.
do $$
declare
  v_admin_persona_id uuid := '00000000-0000-0000-0000-000000000001';
  v_admin_user_id uuid := '00000000-0000-0000-0000-000000000002';
  v_id_categoria_admin uuid;
  v_id_rol_admin uuid;
begin
  select id_categoria into v_id_categoria_admin
    from public.categoria_persona where codigo_categoria = 'ADMINISTRATIVO';

  insert into public.persona (
    id_persona, tipo_persona, id_categoria, cedula, nombres, apellidos, correo, estado
  ) values (
    v_admin_persona_id, 'INTERNA', v_id_categoria_admin, '1750000000',
    'Administrador', 'del Sistema', 'admin@epn.edu.ec', 'ACTIVO'
  )
  on conflict (id_persona) do nothing;

  if not exists (select 1 from auth.users where id = v_admin_user_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_admin_user_id,
      'authenticated',
      'authenticated',
      'admin@epn.edu.ec',
      -- Contraseña placeholder de arranque; requiere_cambio_password se fuerza
      -- a true abajo. DEBE rotarse antes de cualquier despliegue real.
      extensions.crypt('CambiarInmediatamente#2026', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('id_persona', v_admin_persona_id, 'nombre_usuario', 'admin'),
      now(), now(),
      '', '', '', ''
    );
    -- El trigger on_auth_user_created (bloque 2) inserta automaticamente la
    -- fila correspondiente en usuario_sistema.
  end if;

  update public.usuario_sistema
     set requiere_cambio_password = true
   where id_usuario = v_admin_user_id;

  select id_rol into v_id_rol_admin from public.rol where nombre_rol = 'ADMINISTRADOR_SISTEMA';

  insert into public.usuario_rol (id_usuario, id_rol, estado_asignacion, fecha_asignacion)
  select v_admin_user_id, v_id_rol_admin, 'ACTIVO', now()
  where not exists (
    select 1 from public.usuario_rol
     where id_usuario = v_admin_user_id and id_rol = v_id_rol_admin and estado_asignacion = 'ACTIVO'
  );
end $$;

-- ================= BOOTSTRAP: GUARDIA DEMO + guardia_punto_control (§D11) ==
-- Sin al menos una fila de guardia_punto_control, la vista operativa del
-- guardia queda vacia en la demo. Se crea tambien una zona/punto_control
-- minimos para poder anclarla.
do $$
declare
  v_guardia_persona_id uuid := '00000000-0000-0000-0000-000000000003';
  v_guardia_user_id uuid := '00000000-0000-0000-0000-000000000004';
  v_zona_campus_id uuid := '00000000-0000-0000-0000-000000000005';
  v_punto_control_id uuid := '00000000-0000-0000-0000-000000000006';
  v_admin_user_id uuid := '00000000-0000-0000-0000-000000000002';
  v_id_categoria_trabajador uuid;
  v_id_rol_guardia uuid;
begin
  select id_categoria into v_id_categoria_trabajador
    from public.categoria_persona where codigo_categoria = 'TRABAJADOR';

  insert into public.persona (
    id_persona, tipo_persona, id_categoria, cedula, nombres, apellidos, correo, estado
  ) values (
    v_guardia_persona_id, 'INTERNA', v_id_categoria_trabajador, '1750000018',
    'Guardia', 'Demo', 'guardia.demo@epn.edu.ec', 'ACTIVO'
  )
  on conflict (id_persona) do nothing;

  if not exists (select 1 from auth.users where id = v_guardia_user_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_guardia_user_id,
      'authenticated',
      'authenticated',
      'guardia.demo@epn.edu.ec',
      extensions.crypt('CambiarInmediatamente#2026', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('id_persona', v_guardia_persona_id, 'nombre_usuario', 'guardia_demo'),
      now(), now(),
      '', '', '', ''
    );
  end if;

  update public.usuario_sistema
     set requiere_cambio_password = true
   where id_usuario = v_guardia_user_id;

  select id_rol into v_id_rol_guardia from public.rol where nombre_rol = 'GUARDIA_SEGURIDAD';

  insert into public.usuario_rol (id_usuario, id_rol, estado_asignacion, fecha_asignacion)
  select v_guardia_user_id, v_id_rol_guardia, 'ACTIVO', now()
  where not exists (
    select 1 from public.usuario_rol
     where id_usuario = v_guardia_user_id and id_rol = v_id_rol_guardia and estado_asignacion = 'ACTIVO'
  );

  insert into public.zona (id_zona, nombre_zona, tipo_zona, estado_zona)
  values (v_zona_campus_id, 'Campus EPN (demo)', 'CAMPUS', 'ACTIVA')
  on conflict (id_zona) do nothing;

  insert into public.punto_control (id_punto_control, id_zona, nombre_punto, estado_punto)
  values (v_punto_control_id, v_zona_campus_id, 'Garita Principal (demo)', 'ACTIVO')
  on conflict (id_punto_control) do nothing;

  insert into public.guardia_punto_control (
    id_usuario, id_punto_control, turno, estado_asignacion, id_usuario_registro
  )
  select v_guardia_user_id, v_punto_control_id, 'MATUTINO', 'ACTIVA', v_admin_user_id
  where not exists (
    select 1 from public.guardia_punto_control
     where id_usuario = v_guardia_user_id
       and id_punto_control = v_punto_control_id
       and estado_asignacion = 'ACTIVA'
  );
end $$;

-- ============================================================================
-- DEMO MAPA INTERACTIVO (CAC): campus georreferenciado con edificios numerados,
-- puntos de control y dispositivos. Los números de edificio coinciden con el plano
-- oficial de la EPN; pos_x/pos_y son fracciones 0..1 relativas a la imagen del mapa
-- (web/public/mapa-epn.svg placeholder — se reajustan al poner la imagen real).
-- Estados variados a propósito para que el mapa muestre todos los colores:
--   verde=operativo · ámbar=mantenimiento/falla de red · rojo=falla/daño físico ·
--   gris=zona inactiva/bloqueada. Idempotente (on conflict do nothing).
-- ============================================================================

-- Zonas: 1 campus raíz + edificios + parqueaderos.
-- Coordenadas alineadas con los edificios del plano vectorial (web/public/mapa-epn-campus.svg,
-- viewBox 1000x780): pos_x/pos_y son la fracción del centro de cada bloque, así los marcadores
-- caen sobre los edificios dibujados. (Datos de demostración solo para el `db reset` local.)
insert into public.zona (id_zona, id_zona_padre, nombre_zona, tipo_zona, estado_zona, numero_edificio, pos_x, pos_y) values
  ('10000000-0000-0000-0000-000000000001', null,                                    'Campus Politécnico José Rubén Orellana R.', 'CAMPUS',      'ACTIVA',    null, null,    null),
  ('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Administración Central',                     'EDIFICIO',    'ACTIVA',       3, 0.18000, 0.40000),
  ('10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Facultad de Ingeniería Civil y Ambiental',   'EDIFICIO',    'ACTIVA',       6, 0.28000, 0.52100),
  ('10000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'Facultad de Ingeniería en Sistemas',         'EDIFICIO',    'ACTIVA',      14, 0.37000, 0.60000),
  ('10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000001', 'Edificio de Química',                        'EDIFICIO',    'ACTIVA',      20, 0.42000, 0.37900),
  ('10000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000001', 'Escuela de Formación de Tecnólogos',         'EDIFICIO',    'ACTIVA',      21, 0.60000, 0.32900),
  ('10000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000001', 'Departamento de Metalurgia Extractiva',      'EDIFICIO',    'ACTIVA',      22, 0.78000, 0.30000),
  ('10000000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000001', 'Sede Ladrón de Guevara',                     'EDIFICIO',    'INACTIVA',    24, 0.55000, 0.52100),
  ('10000000-0000-0000-0000-000000000026', '10000000-0000-0000-0000-000000000001', 'Estadio Politécnico',                        'EDIFICIO',    'BLOQUEADA',   26, 0.43000, 0.64000),
  ('10000000-0000-0000-0000-000000000100', '10000000-0000-0000-0000-000000000020', 'Parqueadero Química',                        'PARQUEADERO', 'ACTIVA',    null, 0.85000, 0.40000),
  ('10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000003', 'Parqueadero Administración',                 'PARQUEADERO', 'ACTIVA',    null, 0.19000, 0.60000)
on conflict (id_zona) do nothing;

-- Puntos de control (uno por zona), con estados variados.
insert into public.punto_control (id_punto_control, id_zona, nombre_punto, estado_punto) values
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Garita Administración',              'ACTIVO'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000006', 'Acceso Edificio 6',                  'ACTIVO'),
  ('20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000014', 'Garita Sistemas',                    'ACTIVO'),
  ('20000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000020', 'Torniquete Química',                 'FALLA'),
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021', 'Acceso Tecnólogos',                  'MANTENIMIENTO'),
  ('20000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000022', 'Acceso Metalurgia',                  'ACTIVO'),
  ('20000000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000024', 'Acceso Ladrón de Guevara',           'ACTIVO'),
  ('20000000-0000-0000-0000-000000000026', '10000000-0000-0000-0000-000000000026', 'Acceso Estadio',                     'ACTIVO'),
  ('20000000-0000-0000-0000-000000000100', '10000000-0000-0000-0000-000000000100', 'Barrera Parqueadero Química',        'ACTIVO'),
  ('20000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000101', 'Barrera Parqueadero Administración', 'ACTIVO')
on conflict (id_punto_control) do nothing;

-- Dispositivos. Regla de negocio (trigger validar_asignacion_dispositivo): LPR_PLACAS solo en
-- PARQUEADERO; los edificios llevan biometría facial. Estados variados para el mapa.
insert into public.dispositivo (id_dispositivo, id_punto_control, direccion_ip, codigo_mac, tipo_tecnologia, estado_dispositivo) values
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '10.10.0.3',  'AA:BB:CC:00:00:03', 'BIOMETRIA_FACIAL', 'OPERATIVO'),
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000006', '10.10.0.6',  'AA:BB:CC:00:00:06', 'BIOMETRIA_FACIAL', 'OPERATIVO'),
  ('30000000-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000014', '10.10.0.14', 'AA:BB:CC:00:00:14', 'BIOMETRIA_FACIAL', 'OPERATIVO'),
  ('30000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000020', '10.10.0.20', 'AA:BB:CC:00:00:20', 'BIOMETRIA_FACIAL', 'DANO_FISICO'),
  ('30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021', '10.10.0.21', 'AA:BB:CC:00:00:21', 'BIOMETRIA_FACIAL', 'FALLA_DE_RED'),
  ('30000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000022', '10.10.0.22', 'AA:BB:CC:00:00:22', 'BIOMETRIA_FACIAL', 'OPERATIVO'),
  ('30000000-0000-0000-0000-000000000024', '20000000-0000-0000-0000-000000000024', '10.10.0.24', 'AA:BB:CC:00:00:24', 'BIOMETRIA_FACIAL', 'OPERATIVO'),
  ('30000000-0000-0000-0000-000000000026', '20000000-0000-0000-0000-000000000026', '10.10.0.26', 'AA:BB:CC:00:00:26', 'BIOMETRIA_FACIAL', 'OPERATIVO'),
  ('30000000-0000-0000-0000-000000000100', '20000000-0000-0000-0000-000000000100', '10.10.1.100','AA:BB:CC:00:01:00', 'LPR_PLACAS',       'OPERATIVO'),
  ('30000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000101', '10.10.1.101','AA:BB:CC:00:01:01', 'LPR_PLACAS',       'FALLA_DE_RED')
on conflict (id_dispositivo) do nothing;
