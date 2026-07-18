-- ADM · Auditoría: el cambio también en forma estructurada.
--
-- `resumir_cambio` devuelve una línea de texto ("Descripcion: … → …"), y ahí se ve el
-- problema: la etiqueta sale del nombre de la columna, así que aparece "Descripcion" sin
-- tilde y los valores en crudo ("BLOQUEADO"). Traducirlos en SQL obligaría a duplicar en
-- la base el catálogo de etiquetas que ya vive en web/src/lib/catalogos.ts, con el riesgo
-- de que los dos se separen.
--
-- Se expone además el cambio como jsonb [{campo, antes, despues}] y es la interfaz quien
-- pone tildes y traduce los valores, con el mapa que ya tiene. El texto plano se conserva
-- para la exportación a CSV, donde no hay quien renderice.

create or replace function public.detalle_cambio(anterior jsonb, nuevo jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('campo', clave, 'antes', antes, 'despues', despues) order by clave),
    '[]'::jsonb
  )
  from (
    select clave,
           anterior ->> clave as antes,
           nuevo    ->> clave as despues
    from jsonb_object_keys(coalesce(nuevo, anterior, '{}'::jsonb)) as t(clave)
    where clave not like 'id\_%'
      and clave <> all (array[
        'descriptor_facial', 'token_hash', 'path_storage',
        'fecha_modificacion', 'fecha_registro', 'fecha_creacion'
      ])
      and (
        anterior is null or nuevo is null
        or (anterior -> clave) is distinct from (nuevo -> clave)
      )
      and coalesce(anterior ->> clave, nuevo ->> clave) is not null
    order by clave
    limit 8
  ) s;
$$;

comment on function public.detalle_cambio(jsonb, jsonb) is
  'Cambios de un registro como [{campo, antes, despues}], para que la interfaz los traduzca.';

-- CREATE OR REPLACE VIEW solo admite añadir columnas al final: `cambios` va al final.
-- Y la cláusula WITH debe repetirse — sin ella la vista perdería security_invoker
-- (lección de 20260717021430).
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
  public.resumir_cambio(b.valor_anterior, b.valor_nuevo)  as datos,
  public.detalle_cambio(b.valor_anterior, b.valor_nuevo)  as cambios
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

revoke all on public.v_auditoria from anon;
grant select on public.v_auditoria to authenticated;
