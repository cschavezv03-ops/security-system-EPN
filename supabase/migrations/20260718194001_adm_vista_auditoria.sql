-- ADM · Auditoría legible sobre bitacora_sistema.
--
-- Pedido del equipo (Requerimientos_ADM): "cambiar el nombre Bitácora por Auditoría.
-- Reemplazar Entidad por una referencia más intuitiva, mostrar Usuario que realizó la
-- acción, Usuario accedido cuando aplique, Datos y la hora de salida para eventos de sesión."
--
-- La bitácora guarda lo correcto pero lo guarda en crudo: `entidad_afectada` es el nombre
-- de la tabla ("usuario_sistema") y `id_entidad_afectada` un uuid. Quien audita necesita
-- leer "gary.defas" y "Estado: Activo → Bloqueado", no un uuid y dos JSON.
--
-- Se resuelve con una vista, NO con columnas nuevas: bitacora_sistema es histórica y de
-- solo INSERT (CLAUDE.md), así que columnas nuevas dejarían vacíos los 600+ registros ya
-- escritos. La vista funciona sobre todo el histórico desde el primer día.
--
-- security_invoker = true: la vista se evalúa con el RLS de quien consulta, no del
-- propietario. Es la lección de 20260717021430 — una vista SECURITY DEFINER sobre
-- persona/usuario_sistema sería una fuga de datos.
--
-- NOTA: la definición de la vista se amplía en 20260718194054 (columna `cambios`). Ese
-- archivo tiene la versión vigente; este deja el histórico de cómo se llegó a ella.

-- ---------------------------------------------------------------------------
-- 1. Cast defensivo: id_entidad_afectada es varchar y no siempre es un uuid.
-- ---------------------------------------------------------------------------
create or replace function public.uuid_seguro(texto text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return texto::uuid;
exception when others then
  return null;
end;
$$;

comment on function public.uuid_seguro(text) is
  'Convierte a uuid o devuelve NULL si no lo es. Evita que un id_entidad_afectada mal formado rompa la vista de auditoría.';

-- ---------------------------------------------------------------------------
-- 2. Nombre legible de la entidad ("usuario_sistema" → "Usuario del sistema").
-- ---------------------------------------------------------------------------
create or replace function public.etiqueta_entidad(entidad text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case entidad
    when 'usuario_sistema'         then 'Usuario del sistema'
    when 'usuario_rol'             then 'Rol de usuario'
    when 'rol'                     then 'Rol'
    when 'permiso'                 then 'Permiso'
    when 'rol_permiso'             then 'Permiso de rol'
    when 'sesion'                  then 'Sesión'
    when 'persona'                 then 'Persona'
    when 'persona_interna_detalle' then 'Datos internos de la persona'
    when 'categoria_persona'       then 'Categoría de persona'
    when 'empresa'                 then 'Empresa'
    when 'parametro_sistema'       then 'Parámetro del sistema'
    when 'vehiculo'                then 'Vehículo'
    when 'persona_vehiculo'        then 'Asociación persona-vehículo'
    when 'registro_biometrico'     then 'Registro biométrico'
    when 'zona'                    then 'Zona'
    when 'punto_control'           then 'Punto de control'
    when 'dispositivo'             then 'Dispositivo'
    when 'guardia_punto_control'   then 'Asignación de guardia'
    when 'regla_acceso'            then 'Regla de acceso'
    when 'evento_acceso'           then 'Evento de acceso'
    when 'alerta_seguridad'        then 'Alerta de seguridad'
    when 'memorando'               then 'Memorando'
    when 'persona_memorando'       then 'Persona en memorando'
    when 'autorizacion_visita'     then 'Autorización de visita'
    else initcap(replace(coalesce(entidad, ''), '_', ' '))
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3. "Datos": qué cambió, en una línea legible.
--    UPDATE → "Estado usuario: ACTIVO → BLOQUEADO"; INSERT/DELETE → los campos.
-- ---------------------------------------------------------------------------
create or replace function public.resumir_cambio(anterior jsonb, nuevo jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  with campos as (
    select clave,
           anterior ->> clave as antes,
           nuevo ->> clave    as despues
    from jsonb_object_keys(coalesce(nuevo, anterior, '{}'::jsonb)) as t(clave)
    where
      -- Ruido técnico: uuids que el auditor no puede leer, vectores biométricos de 128
      -- dimensiones y hashes de sesión que no deben aparecer en pantalla.
      clave not like 'id\_%'
      and clave <> all (array[
        'descriptor_facial', 'token_hash', 'path_storage',
        'fecha_modificacion', 'fecha_registro', 'fecha_creacion'
      ])
      -- En un UPDATE solo interesa lo que cambió de verdad.
      and (
        anterior is null or nuevo is null
        or (anterior -> clave) is distinct from (nuevo -> clave)
      )
      and coalesce(anterior ->> clave, nuevo ->> clave) is not null
  )
  select nullif(string_agg(texto, ' · ' order by orden), '')
  from (
    select row_number() over (order by clave) as orden,
           initcap(replace(clave, '_', ' ')) || ': ' ||
           case
             when anterior is not null and nuevo is not null
               then coalesce(antes, '—') || ' → ' || coalesce(despues, '—')
             else coalesce(despues, antes, '—')
           end as texto
    from campos
    order by clave
    limit 8
  ) s;
$$;

comment on function public.resumir_cambio(jsonb, jsonb) is
  'Resumen en una línea de valor_anterior/valor_nuevo para la pantalla de Auditoría.';

-- ---------------------------------------------------------------------------
-- 4. La vista (versión inicial; ampliada en 20260718194054).
-- ---------------------------------------------------------------------------
create or replace view public.v_auditoria
with (security_invoker = true)
as
select
  b.id_bitacora,
  b.fecha_hora,
  b.modulo,
  b.accion,
  b.resultado,
  b.entidad_afectada,
  b.id_entidad_afectada,
  b.ip_origen,
  b.descripcion,
  b.valor_anterior,
  b.valor_nuevo,
  b.id_usuario,
  public.etiqueta_entidad(b.entidad_afectada) as tipo_registro,
  ejec.nombre_usuario                          as ejecutor_usuario,
  ejec.correo_electronico                      as ejecutor_correo,
  pe.nombres || ' ' || pe.apellidos            as ejecutor_nombre,
  coalesce(
    case b.entidad_afectada
      when 'usuario_sistema'   then ua.nombre_usuario
      when 'sesion'            then 'Sesión de ' || coalesce(us.nombre_usuario, 'usuario desconocido')
      when 'usuario_rol'       then coalesce(uru.nombre_usuario, '?') || ' · ' || coalesce(urr.nombre_rol, '?')
      when 'persona'           then pa.apellidos || ' ' || pa.nombres || ' (' || pa.cedula || ')'
      when 'vehiculo'          then veh.placa
      when 'rol'               then rl.nombre_rol
      when 'permiso'           then pm.codigo_permiso
      when 'parametro_sistema' then par.codigo_parametro
      when 'categoria_persona' then cat.codigo_categoria
      when 'empresa'           then emp.nombre
      else null
    end,
    b.descripcion,
    b.id_entidad_afectada
  ) as registro_afectado,
  coalesce(ua.nombre_usuario, us.nombre_usuario, uru.nombre_usuario)             as usuario_accedido,
  coalesce(ua.correo_electronico, us.correo_electronico, uru.correo_electronico) as usuario_accedido_correo,
  ses.fecha_inicio  as hora_entrada,
  ses.fecha_cierre  as hora_salida,
  ses.motivo_cierre as motivo_cierre,
  public.resumir_cambio(b.valor_anterior, b.valor_nuevo) as datos
from public.bitacora_sistema b
left join public.usuario_sistema ejec on ejec.id_usuario = b.id_usuario
left join public.persona pe          on pe.id_persona   = ejec.id_persona
left join public.usuario_sistema ua
       on b.entidad_afectada = 'usuario_sistema'
      and ua.id_usuario = public.uuid_seguro(b.id_entidad_afectada)
left join public.sesion ses
       on b.entidad_afectada = 'sesion'
      and ses.id_sesion = public.uuid_seguro(b.id_entidad_afectada)
left join public.usuario_sistema us on us.id_usuario = ses.id_usuario
left join public.usuario_rol ur
       on b.entidad_afectada = 'usuario_rol'
      and ur.id_usuario_rol = public.uuid_seguro(b.id_entidad_afectada)
left join public.usuario_sistema uru on uru.id_usuario = ur.id_usuario
left join public.rol urr             on urr.id_rol     = ur.id_rol
left join public.persona pa
       on b.entidad_afectada = 'persona'
      and pa.id_persona = public.uuid_seguro(b.id_entidad_afectada)
left join public.vehiculo veh
       on b.entidad_afectada = 'vehiculo'
      and veh.id_vehiculo = public.uuid_seguro(b.id_entidad_afectada)
left join public.rol rl
       on b.entidad_afectada = 'rol'
      and rl.id_rol = public.uuid_seguro(b.id_entidad_afectada)
left join public.permiso pm
       on b.entidad_afectada = 'permiso'
      and pm.id_permiso = public.uuid_seguro(b.id_entidad_afectada)
left join public.parametro_sistema par
       on b.entidad_afectada = 'parametro_sistema'
      and par.id_parametro = public.uuid_seguro(b.id_entidad_afectada)
left join public.categoria_persona cat
       on b.entidad_afectada = 'categoria_persona'
      and cat.id_categoria = public.uuid_seguro(b.id_entidad_afectada)
left join public.empresa emp
       on b.entidad_afectada = 'empresa'
      and emp.id_empresa = public.uuid_seguro(b.id_entidad_afectada);

comment on view public.v_auditoria is
  'Bitácora del sistema en formato legible para la pantalla de Auditoría de ADM.';

revoke all on public.v_auditoria from anon;
grant select on public.v_auditoria to authenticated;
