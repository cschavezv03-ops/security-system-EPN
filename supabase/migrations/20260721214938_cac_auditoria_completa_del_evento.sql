-- Poder responder, sobre un ingreso o una salida: por dónde fue, qué aparato lo leyó y quién
-- estaba allí.
--
-- Hasta ahora un `evento_acceso` no guardaba ninguna de las dos últimas cosas:
--
--   * **El dispositivo**: la Edge Function comprueba la MAC y la IP del lector antes de aceptar
--     un registro automático, pero luego no anotaba cuál era. Si una cámara empieza a autorizar
--     lo que no debe, no había forma de saber desde el histórico qué aparato lo hizo.
--   * **El guardia**: en un registro manual quedaba una fila suelta en la bitácora con los ids
--     de evento concatenados por comas. Servía para rastrear a mano, no para responder "¿quién
--     dejó entrar a esta persona?" desde la pantalla.
--
-- Con esas dos columnas, más `id_evento_ingreso` que ya existía, un evento se puede reconstruir
-- entero sin cruzar tablas a ojo.

alter table public.evento_acceso
  add column if not exists id_dispositivo uuid references public.dispositivo(id_dispositivo);

alter table public.evento_acceso
  add column if not exists id_usuario_registro uuid references public.usuario_sistema(id_usuario);

comment on column public.evento_acceso.id_dispositivo is
  'Lector que produjo el registro automático (cámara o LPR). Nulo en los registros manuales.';
comment on column public.evento_acceso.id_usuario_registro is
  'Guardia que registró el movimiento a mano. Nulo en los registros automáticos.';

create index if not exists evento_acceso_por_dispositivo on public.evento_acceso (id_dispositivo);
create index if not exists evento_acceso_por_usuario_registro on public.evento_acceso (id_usuario_registro);

-- ---------------------------------------------------------------------------
-- Quién cubría ese punto a esa hora
-- ---------------------------------------------------------------------------
-- Para un registro automático no hay guardia que lo haya tecleado, pero sí alguien responsable
-- del punto en ese momento. Es la pregunta que se hace cualquiera al revisar un acceso raro, y
-- hasta ahora había que reconstruirla a mano cruzando turnos.

create or replace function public.guardia_de_turno_en(
  p_id_punto_control uuid, p_momento timestamptz
)
returns table (id_usuario uuid, nombre_usuario varchar, correo_electronico varchar, turno varchar)
language sql
stable
security definer
set search_path = public
as $$
  with momento as (
    select (p_momento at time zone 'America/Guayaquil')::time as hora,
           p_momento as instante
  )
  select u.id_usuario, u.nombre_usuario, u.correo_electronico, g.turno
    from public.guardia_punto_control g
    join public.usuario_sistema u on u.id_usuario = g.id_usuario
   cross join momento m
   where g.id_punto_control = p_id_punto_control
     and g.estado_asignacion = 'ACTIVA'
     and m.instante >= g.fecha_inicio
     and (g.fecha_fin is null or m.instante <= g.fecha_fin)
     and (
       g.hora_inicio is null or g.hora_fin is null
       -- Un turno que cruza la medianoche (22:00-06:00) cubre dos tramos del reloj. Es el
       -- mismo detalle que ya mordió tres veces en este proyecto.
       or (g.hora_inicio <= g.hora_fin and m.hora between g.hora_inicio and g.hora_fin)
       or (g.hora_inicio > g.hora_fin and (m.hora >= g.hora_inicio or m.hora <= g.hora_fin))
     );
$$;

comment on function public.guardia_de_turno_en(uuid, timestamptz) is
  'Guardia asignado a ese punto en ese instante, aunque el registro haya sido automático.';

revoke all on function public.guardia_de_turno_en(uuid, timestamptz) from public, anon;
grant execute on function public.guardia_de_turno_en(uuid, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- El evento entero, en una sola pregunta
-- ---------------------------------------------------------------------------

create or replace function public.detalle_evento_acceso(p_id_evento uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id_evento', e.id_evento,
    'fecha_hora', e.fecha_hora,
    'tipo_movimiento', e.tipo_movimiento,
    'tipo_acceso', e.tipo_acceso,
    'resultado', e.resultado,
    'motivo_resultado', e.motivo_resultado,
    'origen_registro', e.origen_registro,
    'es_conductor', e.es_conductor,
    'confianza_biometria', e.confianza_biometria,
    'confianza_placa', e.confianza_placa,
    'placa_detectada', e.placa_detectada,

    'persona', case when p.id_persona is null then null else jsonb_build_object(
      'id_persona', p.id_persona, 'cedula', p.cedula,
      'nombres', p.nombres, 'apellidos', p.apellidos,
      'tipo_persona', p.tipo_persona,
      'categoria', c.codigo_categoria) end,

    'vehiculo', case when v.id_vehiculo is null then null else jsonb_build_object(
      'placa', v.placa, 'tipo_vehiculo', v.tipo_vehiculo,
      'marca', v.marca, 'modelo', v.modelo, 'color', v.color) end,

    'punto', jsonb_build_object(
      'id_punto_control', pc.id_punto_control,
      'nombre_punto', pc.nombre_punto,
      'zona', z.nombre_zona),

    -- Qué aparato lo leyó. Nulo si lo tecleó un guardia.
    'dispositivo', case when d.id_dispositivo is null then null else jsonb_build_object(
      'codigo_dispositivo', d.codigo_dispositivo,
      'tipo_tecnologia', d.tipo_tecnologia,
      'codigo_mac', d.codigo_mac,
      'direccion_ip', d.direccion_ip,
      'estado_dispositivo', d.estado_dispositivo) end,

    -- Quién lo registró a mano, si alguien lo hizo.
    'registrado_por', case when ur.id_usuario is null then null else jsonb_build_object(
      'nombre_usuario', ur.nombre_usuario,
      'correo_electronico', ur.correo_electronico,
      'persona', pr.nombres || ' ' || pr.apellidos) end,

    -- Y quién respondía de ese punto en ese momento, lo haya tecleado o no.
    'guardia_de_turno', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nombre_usuario', g.nombre_usuario,
               'correo_electronico', g.correo_electronico,
               'turno', g.turno)), '[]'::jsonb)
        from public.guardia_de_turno_en(e.id_punto_control, e.fecha_hora) g),

    -- Una salida se explica junto a su ingreso: por dónde entró y cuánto estuvo dentro.
    'ingreso_relacionado', case when ei.id_evento is null then null else jsonb_build_object(
      'id_evento', ei.id_evento,
      'fecha_hora', ei.fecha_hora,
      'punto', pci.nombre_punto,
      'mismo_punto', ei.id_punto_control = e.id_punto_control,
      'horas_dentro', round(extract(epoch from (e.fecha_hora - ei.fecha_hora)) / 3600.0, 2)) end,

    -- Con qué respaldo se le dejó pasar.
    'regla_aplicada', case when ra.id_regla_acceso is null then null else jsonb_build_object(
      'nombre_regla', ra.nombre_regla,
      'horario', to_char(ra.horario_inicio, 'HH24:MI') || ' - ' || to_char(ra.horario_fin, 'HH24:MI'),
      'requiere_memorando', ra.requiere_memorando) end,

    'autorizacion_visita', case when av.id_autorizacion is null then null else jsonb_build_object(
      'fecha_visita', av.fecha_visita, 'motivo', av.motivo) end
  )
  from public.evento_acceso e
  left join public.persona p on p.id_persona = e.id_persona
  left join public.categoria_persona c on c.id_categoria = p.id_categoria
  left join public.vehiculo v on v.id_vehiculo = e.id_vehiculo
  join public.punto_control pc on pc.id_punto_control = e.id_punto_control
  left join public.zona z on z.id_zona = pc.id_zona
  left join public.dispositivo d on d.id_dispositivo = e.id_dispositivo
  left join public.usuario_sistema ur on ur.id_usuario = e.id_usuario_registro
  left join public.persona pr on pr.id_persona = ur.id_persona
  left join public.evento_acceso ei on ei.id_evento = e.id_evento_ingreso
  left join public.punto_control pci on pci.id_punto_control = ei.id_punto_control
  left join public.regla_acceso ra on ra.id_regla_acceso = e.id_regla_acceso
  left join public.autorizacion_visita_diaria av on av.id_autorizacion = e.id_autorizacion_visita
 where e.id_evento = p_id_evento;
$$;

comment on function public.detalle_evento_acceso(uuid) is
  'Todo lo que se sabe de un ingreso o una salida: por dónde, con qué aparato, quién lo registró y quién cubría el punto.';

revoke all on function public.detalle_evento_acceso(uuid) from public, anon;
grant execute on function public.detalle_evento_acceso(uuid) to authenticated, service_role;
