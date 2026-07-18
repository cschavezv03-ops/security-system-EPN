-- Una sesion del proveedor = UNA sola fila de auditoria.
--
-- El problema: `supabase-js` emite el evento SIGNED_IN no solo al iniciar sesion,
-- sino tambien cada vez que la pestaña recupera visibilidad y el cliente
-- revalida la sesion. El frontend llamaba a registrar_sesion() en cada SIGNED_IN,
-- asi que cambiar de pestaña generaba una fila ACTIVA nueva cada vez: el registro
-- mostraba decenas de sesiones abiertas para un solo usuario que solo estaba
-- trabajando.
--
-- El frontend deja de registrar en cada evento, pero eso por si solo no basta:
-- cualquier cliente (o un reintento) podria volver a insertar. La garantia se
-- pone AQUI, en la base: registrar_sesion() es ahora idempotente respecto al
-- identificador de sesion del proveedor (claim session_id del JWT), y un indice
-- unico lo impide a nivel fisico.

-- ---------------------------------------------------------------------------
-- 1. Consolidar las filas duplicadas que ya existen
-- ---------------------------------------------------------------------------
-- Se conserva la mas reciente de cada sesion real y se cierran las demas. Las
-- filas antiguas sin identificador de proveedor se agrupan por usuario: de esas
-- solo puede seguir viva la ultima.
with ordenadas as (
  select id_sesion,
         row_number() over (
           partition by id_usuario, coalesce(id_sesion_proveedor::text, 'sin-identificador')
           order by fecha_inicio desc
         ) as posicion
    from public.sesion
   where estado_sesion = 'ACTIVA'
)
update public.sesion s
   set estado_sesion = 'CERRADA',
       fecha_cierre = now(),
       motivo_cierre = 'DUPLICADA'
  from ordenadas o
 where o.id_sesion = s.id_sesion
   and o.posicion > 1;

-- ---------------------------------------------------------------------------
-- 2. Impedirlo fisicamente de aqui en adelante
-- ---------------------------------------------------------------------------
create unique index if not exists uq_sesion_proveedor_activa
  on public.sesion (id_sesion_proveedor)
  where estado_sesion = 'ACTIVA' and id_sesion_proveedor is not null;

-- ---------------------------------------------------------------------------
-- 3. registrar_sesion idempotente
-- ---------------------------------------------------------------------------
-- Si ya hay una fila ACTIVA para esta sesion del proveedor, se devuelve esa (y de
-- paso se refresca su ultima actividad) en vez de crear otra. Asi da igual cuantas
-- veces la llame el cliente: el resultado es el mismo.
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
  v_sid uuid;
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

  v_sid := nullif(auth.jwt() ->> 'session_id', '')::uuid;

  -- Ya existe la fila de esta sesion: se reutiliza.
  if v_sid is not null then
    update public.sesion
       set fecha_ultima_actividad = now()
     where id_sesion_proveedor = v_sid
       and estado_sesion = 'ACTIVA'
    returning * into v_row;

    if found then
      return v_row;
    end if;
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
    p_user_agent, public.normalizar_espacios(p_dispositivo), v_sid
  )
  returning * into v_row;

  update public.usuario_sistema set fecha_ultimo_login = now() where id_usuario = auth.uid();
  return v_row;
end;
$$;

comment on function public.registrar_sesion(text, boolean, text, text) is
  'Registra la sesion de auditoria. IDEMPOTENTE: una sesion del proveedor (claim session_id) tiene una sola fila ACTIVA.';

revoke execute on function public.registrar_sesion(text, boolean, text, text) from public, anon;
grant execute on function public.registrar_sesion(text, boolean, text, text) to authenticated;
