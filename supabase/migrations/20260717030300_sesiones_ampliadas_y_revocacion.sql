-- Sesiones funcionales y revocacion efectiva (reqs 26, 29, 30, 31, 36).
--
-- CONTEXTO: el doc 03 §D10 habia dejado `sesion` como auditoria y `recordar_sesion`
-- deshabilitado. La nueva especificacion (reqs 29/30) exige sesiones y "recordar
-- sesion" FUNCIONALES; el usuario aprobo superar D10 (ver docs/03 §D34 nuevo).
-- Se AMPLIA la auditoria y se AÑADE revocacion real en servidor/proveedor.
--
-- La recuperacion de contraseña (req 31) usa el flujo NATIVO de Supabase Auth
-- (resetPasswordForEmail): el proveedor administra token, expiracion y un solo
-- uso (spec §5.4: "solo crear tabla propia si el proveedor no lo administra").
-- No hay SMTP en este proyecto, asi que el ENVIO queda NO_VERIFICADO, pero todo
-- el flujo de cambio y revocacion si es real.

-- ===========================================================================
-- 1. Ampliar la tabla sesion
-- ===========================================================================
alter table public.sesion add column if not exists fecha_ultima_actividad timestamptz;
alter table public.sesion add column if not exists user_agent text;
alter table public.sesion add column if not exists dispositivo_nombre varchar(120);
alter table public.sesion add column if not exists motivo_cierre varchar(60);
alter table public.sesion add column if not exists revocada_por uuid references public.usuario_sistema (id_usuario);
alter table public.sesion add column if not exists fecha_revocacion timestamptz;

-- Las filas existentes toman su fecha_inicio como ultima actividad conocida.
update public.sesion set fecha_ultima_actividad = coalesce(fecha_ultima_actividad, fecha_inicio)
 where fecha_ultima_actividad is null;

-- Nuevos estados de cierre: REVOCADA (admin/seguridad) y CERRADA_CAMBIO_PASSWORD.
alter table public.sesion drop constraint if exists sesion_estado_sesion_check;
alter table public.sesion add constraint sesion_estado_sesion_check
  check (estado_sesion in ('ACTIVA', 'EXPIRADA', 'CERRADA', 'REVOCADA', 'CERRADA_CAMBIO_PASSWORD'));

-- Coherencia: una ACTIVA no tiene cierre; cualquier estado terminal si.
alter table public.sesion drop constraint if exists sesion_cierre_coherente;
alter table public.sesion add constraint sesion_cierre_coherente
  check (
    (estado_sesion = 'ACTIVA' and fecha_cierre is null)
    or (estado_sesion in ('CERRADA', 'EXPIRADA', 'REVOCADA', 'CERRADA_CAMBIO_PASSWORD') and fecha_cierre is not null)
  );

-- Evidencia opcional del primer cambio de contraseña (req 28). Sin guardar la clave.
alter table public.usuario_sistema add column if not exists fecha_cambio_password_inicial timestamptz;

-- ===========================================================================
-- 2. Parametros de sesion
-- ===========================================================================
insert into public.parametro_sistema
  (codigo_parametro, nombre_parametro, descripcion, modulo_aplicacion, tipo_dato, valor_parametro, estado_parametro, editable)
values
  ('SESION_INACTIVIDAD_MIN', 'Timeout de inactividad (min)', 'Minutos de inactividad tras los que una sesion se marca EXPIRADA.', 'SESION', 'ENTERO', '30', 'ACTIVO', true)
on conflict (codigo_parametro) do nothing;

-- ===========================================================================
-- 3. Una asignacion activa por (usuario, rol)
-- ===========================================================================
-- El modelo permite VARIOS roles activos por usuario (verificado: 1 usuario los
-- tiene). Lo que se prohibe es duplicar el MISMO rol activo (req 36).
create unique index if not exists uq_usuario_rol_activo
  on public.usuario_rol (id_usuario, id_rol)
  where estado_asignacion = 'ACTIVO';

-- ===========================================================================
-- 4. registrar_sesion: ahora guarda actividad y user_agent
-- ===========================================================================
-- Se reemplaza la firma (text, boolean) por (text, boolean, text). No la
-- referencia ningun objeto de BD; la llama el frontend por nombre de argumento.
drop function if exists public.registrar_sesion(text, boolean);
create or replace function public.registrar_sesion(
  p_ip_origen text default null,
  p_recordar_sesion boolean default false,
  p_user_agent text default null
)
returns public.sesion
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tiempo_sesion_min integer;
  v_estado text;
  v_row public.sesion;
begin
  if auth.uid() is null then
    raise exception 'registrar_sesion requiere un usuario autenticado';
  end if;

  select estado_usuario into v_estado from public.usuario_sistema where id_usuario = auth.uid();
  if v_estado is distinct from 'ACTIVO' then
    raise exception 'La cuenta no esta activa (estado: %)', coalesce(v_estado, 'desconocido')
      using errcode = 'insufficient_privilege';
  end if;

  select valor_parametro::integer into v_tiempo_sesion_min
    from public.parametro_sistema where codigo_parametro = 'TIEMPO_SESION_MIN';

  insert into public.sesion
    (id_usuario, fecha_inicio, fecha_ultima_actividad, fecha_expiracion, estado_sesion, ip_origen, recordar_sesion, user_agent)
  values (
    auth.uid(), now(), now(),
    now() + (coalesce(v_tiempo_sesion_min, 60) || ' minutes')::interval,
    'ACTIVA', p_ip_origen, coalesce(p_recordar_sesion, false), p_user_agent
  )
  returning * into v_row;

  update public.usuario_sistema set fecha_ultimo_login = now() where id_usuario = auth.uid();
  return v_row;
end;
$$;

comment on function public.registrar_sesion(text, boolean, text) is
  'Registra la sesion de auditoria al iniciar sesion; guarda ultima actividad, recordar_sesion y user_agent.';

-- ===========================================================================
-- 5. tocar_sesion: renueva la ultima actividad (la llama el frontend)
-- ===========================================================================
create or replace function public.tocar_sesion()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  update public.sesion set fecha_ultima_actividad = now()
   where id_usuario = auth.uid() and estado_sesion = 'ACTIVA';
end;
$$;

comment on function public.tocar_sesion() is
  'Actualiza fecha_ultima_actividad de la sesion activa del usuario (timeout de inactividad, req 29).';

-- ===========================================================================
-- 6. cerrar_sesion: ahora deja motivo
-- ===========================================================================
create or replace function public.cerrar_sesion()
returns public.sesion
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.sesion;
begin
  if auth.uid() is null then
    raise exception 'cerrar_sesion requiere un usuario autenticado';
  end if;

  update public.sesion
     set estado_sesion = 'CERRADA', fecha_cierre = now(), motivo_cierre = 'LOGOUT'
   where id_sesion = (
     select id_sesion from public.sesion
      where id_usuario = auth.uid() and estado_sesion = 'ACTIVA'
      order by fecha_inicio desc limit 1
   )
  returning * into v_row;
  return v_row;
end;
$$;

-- ===========================================================================
-- 7. expirar_sesiones_vencidas: expiracion absoluta + inactividad
-- ===========================================================================
create or replace function public.expirar_sesiones_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inact_min integer;
  v_afectadas integer := 0;
  v_paso integer;
begin
  select coalesce(max(valor_parametro::integer), 30) into v_inact_min
    from public.parametro_sistema where codigo_parametro = 'SESION_INACTIVIDAD_MIN';

  -- (a) expiracion absoluta
  update public.sesion
     set estado_sesion = 'EXPIRADA',
         fecha_cierre = coalesce(fecha_cierre, fecha_expiracion),
         motivo_cierre = coalesce(motivo_cierre, 'EXPIRACION_ABSOLUTA')
   where estado_sesion = 'ACTIVA' and fecha_expiracion < now();
  get diagnostics v_paso = row_count;
  v_afectadas := v_afectadas + v_paso;

  -- (b) inactividad
  update public.sesion
     set estado_sesion = 'EXPIRADA',
         fecha_cierre = now(),
         motivo_cierre = coalesce(motivo_cierre, 'INACTIVIDAD')
   where estado_sesion = 'ACTIVA'
     and fecha_ultima_actividad is not null
     and fecha_ultima_actividad < now() - (v_inact_min || ' minutes')::interval;
  get diagnostics v_paso = row_count;
  v_afectadas := v_afectadas + v_paso;

  return v_afectadas;
end;
$$;

-- ===========================================================================
-- 8. revocar_sesiones_usuario: revocacion EFECTIVA en el proveedor
-- ===========================================================================
-- Corta las sesiones vivas en GoTrue (borra refresh tokens y sesiones de auth) y
-- marca la auditoria de public.sesion. La llaman las Edge Functions (service_role)
-- tras un cambio o recuperacion de contraseña (reqs 26, 31) y el admin al cerrar
-- sesiones de otra cuenta. Mismo patron que 20260717020418_bloqueo_efectivo.sql.
create or replace function public.revocar_sesiones_usuario(
  p_id_usuario uuid,
  p_motivo text default 'REVOCADA',
  p_revocada_por uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado_final text;
  v_afectadas integer;
begin
  if p_id_usuario is null then
    raise exception 'p_id_usuario es obligatorio';
  end if;

  v_estado_final := case when p_motivo = 'CAMBIO_PASSWORD' then 'CERRADA_CAMBIO_PASSWORD' else 'REVOCADA' end;

  -- Corte real en el proveedor: sin esto un JWT vigente seguiria sirviendo.
  delete from auth.refresh_tokens where user_id = p_id_usuario::text;
  delete from auth.sessions where user_id = p_id_usuario;

  update public.sesion
     set estado_sesion = v_estado_final,
         fecha_cierre = now(),
         fecha_revocacion = now(),
         motivo_cierre = p_motivo,
         revocada_por = p_revocada_por
   where id_usuario = p_id_usuario and estado_sesion = 'ACTIVA';
  get diagnostics v_afectadas = row_count;

  return v_afectadas;
end;
$$;

comment on function public.revocar_sesiones_usuario(uuid, text, uuid) is
  'Revoca todas las sesiones vivas de un usuario en GoTrue y marca public.sesion. La usan las Edge Functions tras cambio/recuperacion de contraseña (reqs 26, 31).';

-- ===========================================================================
-- 9. marcar_password_cambiada: baja el indicador tras un cambio confirmado
-- ===========================================================================
-- Fuente de verdad de req 27/28. La llama el frontend SOLO despues de que el
-- proveedor confirmo el cambio (updateUser exitoso). Afecta solo la fila propia.
create or replace function public.marcar_password_cambiada()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado.';
  end if;
  update public.usuario_sistema
     set requiere_cambio_password = false,
         fecha_cambio_password_inicial = coalesce(fecha_cambio_password_inicial, now()),
         fecha_modificacion = now()
   where id_usuario = auth.uid();
end;
$$;

comment on function public.marcar_password_cambiada() is
  'Baja requiere_cambio_password del usuario autenticado tras confirmar el cambio con el proveedor (reqs 27/28).';

-- ===========================================================================
-- 9b. revocar_mis_sesiones: el usuario cierra TODAS sus sesiones
-- ===========================================================================
-- Envoltorio self-service de revocar_sesiones_usuario para auth.uid(). Lo llama
-- el frontend tras un cambio o recuperacion de contraseña (reqs 26, 31): no hace
-- falta una Edge Function con service_role porque una funcion SECURITY DEFINER
-- (propiedad del rol de migracion) si puede borrar de auth.refresh_tokens y
-- auth.sessions, igual que sincronizar_estado_auth. Solo toca sesiones propias.
create or replace function public.revocar_mis_sesiones(p_motivo text default 'CAMBIO_PASSWORD')
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado.' using errcode = 'insufficient_privilege';
  end if;
  return public.revocar_sesiones_usuario(auth.uid(), coalesce(p_motivo, 'CAMBIO_PASSWORD'), auth.uid());
end;
$$;

comment on function public.revocar_mis_sesiones(text) is
  'El usuario autenticado revoca TODAS sus sesiones (GoTrue + auditoria). Se usa tras cambio/recuperacion de contraseña (reqs 26, 31).';

-- ===========================================================================
-- 10. Permisos
-- ===========================================================================
revoke execute on function public.registrar_sesion(text, boolean, text) from public, anon;
grant execute on function public.registrar_sesion(text, boolean, text) to authenticated;

revoke execute on function public.tocar_sesion(), public.marcar_password_cambiada(), public.revocar_mis_sesiones(text) from public, anon;
grant execute on function public.tocar_sesion(), public.marcar_password_cambiada(), public.revocar_mis_sesiones(text) to authenticated;

revoke execute on function public.cerrar_sesion() from public, anon;
grant execute on function public.cerrar_sesion() to authenticated;

-- expirar_sesiones_vencidas solo pg_cron; revocar_sesiones_usuario solo el backend.
revoke execute on function public.expirar_sesiones_vencidas() from public, anon, authenticated;
revoke execute on function public.revocar_sesiones_usuario(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.revocar_sesiones_usuario(uuid, text, uuid) to service_role;
