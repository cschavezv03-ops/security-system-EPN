-- Cerrar UNA sesion concreta desde la pantalla de administracion (req 29:
-- "Permitir cerrar una sesion concreta o todas las demas, segun permisos").
--
-- El problema: `sesion` es auditoria y no guardaba ninguna referencia a la sesion
-- real del proveedor (token_hash quedo NULL por §D14). Marcar la fila como
-- CERRADA habria sido cosmetico: el usuario seguiria trabajando con su token, que
-- es justo la incoherencia que se quiere evitar. Y revocar TODAS las sesiones del
-- usuario seria demasiado: cerraria tambien sus otros dispositivos.
--
-- Solucion: el JWT de Supabase incluye el claim `session_id`, que identifica la
-- sesion en GoTrue. Se guarda al registrar la sesion y con el se puede borrar
-- exactamente esa fila de auth.sessions. Como auth.refresh_tokens.session_id
-- tiene ON DELETE CASCADE, sus refresh tokens caen con ella.
--
-- Las filas anteriores a esta migracion no tienen el identificador: en esas solo
-- se puede cerrar la auditoria, y la interfaz lo advierte.

-- ---------------------------------------------------------------------------
-- 1. Correlacion con la sesion del proveedor
-- ---------------------------------------------------------------------------
alter table public.sesion
  add column if not exists id_sesion_proveedor uuid;

comment on column public.sesion.id_sesion_proveedor is
  'Claim session_id del JWT: identifica la sesion en auth.sessions y permite cerrarla sin afectar a los otros dispositivos del usuario.';

create index if not exists idx_sesion_proveedor
  on public.sesion (id_sesion_proveedor)
  where id_sesion_proveedor is not null;

-- ---------------------------------------------------------------------------
-- 2. registrar_sesion guarda el identificador del proveedor
-- ---------------------------------------------------------------------------
create or replace function public.registrar_sesion(
  p_ip_origen text default null,
  p_recordar_sesion boolean default false,
  p_user_agent text default null,
  p_dispositivo text default null
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
    (id_usuario, fecha_inicio, fecha_ultima_actividad, fecha_expiracion, estado_sesion,
     ip_origen, recordar_sesion, user_agent, dispositivo_nombre, id_sesion_proveedor)
  values (
    auth.uid(), now(), now(),
    now() + (coalesce(v_tiempo_sesion_min, 60) || ' minutes')::interval,
    'ACTIVA', p_ip_origen, coalesce(p_recordar_sesion, false),
    p_user_agent, public.normalizar_espacios(p_dispositivo),
    -- Claim del propio JWT con el que se esta llamando.
    nullif(auth.jwt() ->> 'session_id', '')::uuid
  )
  returning * into v_row;

  update public.usuario_sistema set fecha_ultimo_login = now() where id_usuario = auth.uid();
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Cierre administrativo de una sesion concreta
-- ---------------------------------------------------------------------------
-- Permiso: se reutiliza ADM_USUARIO_UPDATE en vez de crear ADM_SESION_CERRAR,
-- por coherencia con la decision ya tomada para esta tabla (docs/99 E6, donde se
-- reutiliza ADM_USUARIO_SELECT en lugar de crear ADM_SESION_SELECT).
--
-- Devuelve jsonb para que la interfaz sepa si el corte fue efectivo o si solo se
-- pudo cerrar la auditoria (sesiones antiguas sin id_sesion_proveedor).
create or replace function public.cerrar_sesion_admin(p_id_sesion uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila public.sesion;
  v_revocada boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado.' using errcode = 'insufficient_privilege';
  end if;
  if not public.tiene_permiso('ADM_USUARIO_UPDATE') then
    raise exception 'No tiene permiso para cerrar sesiones de otros usuarios.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_fila from public.sesion where id_sesion = p_id_sesion;
  if not found then
    raise exception 'La sesion indicada no existe.' using errcode = 'no_data_found';
  end if;

  if v_fila.estado_sesion <> 'ACTIVA' then
    return jsonb_build_object('cerrada', false, 'motivo', 'La sesion ya no estaba activa.');
  end if;

  -- Corte real en el proveedor, solo de ESTA sesion. El ON DELETE CASCADE de
  -- auth.refresh_tokens.session_id elimina tambien sus refresh tokens.
  if v_fila.id_sesion_proveedor is not null then
    delete from auth.sessions where id = v_fila.id_sesion_proveedor;
    v_revocada := true;
  end if;

  update public.sesion
     set estado_sesion = 'REVOCADA',
         fecha_cierre = now(),
         fecha_revocacion = now(),
         motivo_cierre = 'CIERRE_ADMINISTRATIVO',
         revocada_por = auth.uid()
   where id_sesion = p_id_sesion;

  insert into public.bitacora_sistema
    (id_usuario, accion, modulo, entidad_afectada, id_entidad_afectada, resultado, descripcion)
  values (auth.uid(), 'CIERRE_ADMINISTRATIVO_SESION', 'ADM', 'sesion', p_id_sesion::text, 'EXITO',
          case when v_revocada
            then 'Sesion cerrada y revocada en el proveedor.'
            else 'Sesion marcada como cerrada; no tenia identificador del proveedor (anterior a la mejora).'
          end);

  return jsonb_build_object('cerrada', true, 'revocada_en_proveedor', v_revocada);
end;
$$;

comment on function public.cerrar_sesion_admin(uuid) is
  'Cierra UNA sesion concreta: borra su fila en auth.sessions (si se conoce) y marca la auditoria. Exige ADM_USUARIO_UPDATE. Req 29.';

revoke execute on function public.cerrar_sesion_admin(uuid) from public, anon;
grant execute on function public.cerrar_sesion_admin(uuid) to authenticated;

revoke execute on function public.registrar_sesion(text, boolean, text, text) from public, anon;
grant execute on function public.registrar_sesion(text, boolean, text, text) to authenticated;
