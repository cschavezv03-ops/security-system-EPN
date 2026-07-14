-- Fix de vista_vehiculos_dentro: robustez ante timestamps iguales.
--
-- La version anterior decidia "dentro" con `not exists (salida con fecha_hora >
-- ingreso)` (comparacion estricta). Si un INGRESO y su SALIDA comparten el mismo
-- fecha_hora (misma transaccion, o dos eventos en el mismo instante), la salida
-- no se contaba como posterior y el vehiculo aparecia dentro para siempre.
--
-- Nueva logica "el ultimo movimiento manda": por cada vehiculo se ordenan sus
-- eventos AUTORIZADOS de INGRESO/SALIDA y se toma el mas reciente. Empates de
-- fecha_hora se rompen dando prioridad a SALIDA (no se puede salir antes de
-- entrar: si coinciden, el vehiculo esta fuera) y, entre eventos de un mismo
-- INGRESO multi-ocupante, al del conductor (es_conductor = true), que es al que
-- se imputa la permanencia (§D25/§D21). El vehiculo esta dentro solo si su
-- ultimo movimiento es un INGRESO.

create or replace view public.vista_vehiculos_dentro
with (security_invoker = true)
as
with parametros as (
  select
    max(valor_parametro) filter (where codigo_parametro = 'PERMANENCIA_MAX_INTERNO_H')::numeric as max_interno_h,
    max(valor_parametro) filter (where codigo_parametro = 'PERMANENCIA_MAX_EXTERNO_H')::numeric as max_externo_h,
    max(valor_parametro) filter (where codigo_parametro = 'PERMANENCIA_MAX_VISITA_H')::numeric as max_visita_h,
    max(valor_parametro) filter (where codigo_parametro = 'PERMANENCIA_ABANDONO_H')::numeric as abandono_h
  from public.parametro_sistema
),
movimientos as (
  select
    ea.id_vehiculo,
    ea.id_evento,
    ea.fecha_hora,
    ea.tipo_movimiento,
    ea.id_punto_control,
    ea.id_persona,
    ea.es_conductor,
    row_number() over (
      partition by ea.id_vehiculo
      order by ea.fecha_hora desc,
        case ea.tipo_movimiento when 'SALIDA' then 0 else 1 end,   -- SALIDA gana el empate
        case when ea.es_conductor then 0 else 1 end                -- entre ocupantes del ingreso, el conductor
    ) as rn
  from public.evento_acceso ea
  where ea.id_vehiculo is not null
    and ea.resultado = 'AUTORIZADO'
    and ea.tipo_movimiento in ('INGRESO', 'SALIDA')
),
ultimo as (
  select id_vehiculo, id_evento, fecha_hora, tipo_movimiento, id_punto_control, id_persona
  from movimientos
  where rn = 1 and tipo_movimiento = 'INGRESO'   -- ultimo movimiento = INGRESO => dentro
)
select
  u.id_vehiculo,
  v.placa,
  u.id_evento as id_evento_ingreso,
  u.fecha_hora as fecha_ingreso,
  u.id_punto_control,
  u.id_persona as id_persona_conductor,
  p.tipo_persona as tipo_persona_conductor,
  round(extract(epoch from (now() - u.fecha_hora)) / 3600.0, 2) as horas_dentro,
  case
    when p.tipo_persona = 'INTERNA' and p.estado = 'ACTIVO' then pa.max_interno_h
    when exists (
      select 1
        from public.persona_memorando pm
        join public.memorando m on m.id_memorando = pm.id_memorando
       where pm.id_persona = p.id_persona
         and pm.estado_acceso = 'ACTIVO'
         and current_date between m.fecha_inicio and m.fecha_fin
    ) then pa.max_externo_h
    when exists (
      select 1
        from public.autorizacion_visita_diaria a
       where a.id_persona = p.id_persona
         and a.estado_autorizacion = 'VIGENTE'
         and a.fecha_visita = current_date
    ) then pa.max_visita_h
    else null
  end as limite_horas_aplicable,
  pa.abandono_h as limite_abandono_horas
from ultimo u
cross join parametros pa
join public.vehiculo v on v.id_vehiculo = u.id_vehiculo
left join public.persona p on p.id_persona = u.id_persona;

grant select on public.vista_vehiculos_dentro to authenticated;
