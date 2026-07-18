-- Revocacion INMEDIATA de una sesion: el token deja de servir al instante.
--
-- El problema: los JWT de Supabase son autocontenidos. Al cerrar una sesion se
-- borra su fila de auth.sessions (y con ella su refresh token), asi que no se
-- puede renovar, pero el access token YA EMITIDO sigue siendo criptograficamente
-- valido hasta caducar (hasta 1 hora). Durante esa ventana el usuario seguia
-- navegando: la pantalla decia REVOCADA y la sesion seguia funcionando.
--
-- Solucion: los permisos ya se leen en vivo en cada consulta (doc 01 §2, "no se
-- copian al JWT"), que es lo que hace inmediato el bloqueo de usuarios (§D29).
-- Se aplica la misma idea a la sesion: si la sesion del proveedor ya no existe,
-- el usuario se queda sin ningun permiso y RLS le niega todo.
--
-- FAIL-OPEN deliberado cuando el token NO trae el claim `session_id`: ese es el
-- caso de service_role (Edge Functions, dispositivos, tareas de pg_cron), que
-- deben seguir funcionando. No es un agujero: esas llaves no son de usuario.

-- ---------------------------------------------------------------------------
-- 1. ¿Sigue viva la sesion con la que se firmo este token?
-- ---------------------------------------------------------------------------
create or replace function public.sesion_vigente()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- Sin claim de sesion (service_role / peticiones internas): no aplica.
    when nullif(auth.jwt() ->> 'session_id', '') is null then true
    else exists (
      select 1 from auth.sessions s
       where s.id = (auth.jwt() ->> 'session_id')::uuid
    )
  end;
$$;

comment on function public.sesion_vigente() is
  'False si la sesion del proveedor con la que se emitio este JWT ya fue revocada. Hace inmediato el cierre de sesion pese a que el access token siga sin caducar.';

revoke execute on function public.sesion_vigente() from public, anon;
grant execute on function public.sesion_vigente() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Los permisos exigen ademas que la sesion siga viva
-- ---------------------------------------------------------------------------
-- Se redefinen anadiendo la comprobacion; el resto del cuerpo es identico al de
-- 20260717020418_bloqueo_efectivo.sql (guard de estado_usuario incluido).
create or replace function public.tiene_permiso(p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.sesion_vigente() and exists (
    select 1
      from public.usuario_sistema us
      join public.usuario_rol ur on ur.id_usuario = us.id_usuario
      join public.rol r on r.id_rol = ur.id_rol
      join public.rol_permiso rp on rp.id_rol = r.id_rol
      join public.permiso p on p.id_permiso = rp.id_permiso
     where us.id_usuario = auth.uid()
       and us.estado_usuario = 'ACTIVO'
       and ur.estado_asignacion = 'ACTIVO'
       and r.estado_rol = 'ACTIVO'
       and rp.estado_asignacion = 'ACTIVO'
       and p.estado_permiso = 'ACTIVO'
       and p.codigo_permiso = p_codigo
  );
$$;

comment on function public.tiene_permiso(text) is
  'True si el usuario esta ACTIVO, su sesion sigue viva y tiene el permiso vigente. Un usuario bloqueado o con la sesion revocada no tiene ninguno.';

create or replace function public.permisos_efectivos()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.codigo_permiso
    from public.usuario_sistema us
    join public.usuario_rol ur on ur.id_usuario = us.id_usuario
    join public.rol r on r.id_rol = ur.id_rol
    join public.rol_permiso rp on rp.id_rol = r.id_rol
    join public.permiso p on p.id_permiso = rp.id_permiso
   where us.id_usuario = auth.uid()
     and us.estado_usuario = 'ACTIVO'
     and ur.estado_asignacion = 'ACTIVO'
     and r.estado_rol = 'ACTIVO'
     and rp.estado_asignacion = 'ACTIVO'
     and p.estado_permiso = 'ACTIVO'
     and public.sesion_vigente();
$$;

comment on function public.permisos_efectivos() is
  'Permisos del usuario autenticado. Vacio si su cuenta no esta ACTIVA o si su sesion fue revocada.';

-- ---------------------------------------------------------------------------
-- 3. El frontend necesita saberlo para cerrar la sesion por su cuenta
-- ---------------------------------------------------------------------------
-- tocar_sesion() ya se llama periodicamente como latido de actividad; ahora
-- ademas informa si la sesion sigue siendo valida, para que la aplicacion salga
-- sola en vez de quedarse en una pantalla sin datos.
-- Cambia el tipo de retorno (void -> boolean), asi que hay que eliminarla antes.
drop function if exists public.tocar_sesion(uuid);

create or replace function public.tocar_sesion(p_id_sesion uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if not public.sesion_vigente() then
    return false;
  end if;

  if p_id_sesion is not null then
    update public.sesion set fecha_ultima_actividad = now()
     where id_sesion = p_id_sesion
       and id_usuario = auth.uid()
       and estado_sesion = 'ACTIVA';
  else
    update public.sesion set fecha_ultima_actividad = now()
     where id_usuario = auth.uid() and estado_sesion = 'ACTIVA';
  end if;

  return true;
end;
$$;

comment on function public.tocar_sesion(uuid) is
  'Renueva la ultima actividad de la sesion y devuelve si sigue vigente (false = fue revocada y la aplicacion debe cerrar sesion).';

revoke execute on function public.tocar_sesion(uuid) from public, anon;
grant execute on function public.tocar_sesion(uuid) to authenticated;

revoke execute on function public.tiene_permiso(text), public.permisos_efectivos() from public, anon;
grant execute on function public.tiene_permiso(text), public.permisos_efectivos() to authenticated;
