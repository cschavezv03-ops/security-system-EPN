-- La vista traia id_persona_conductor y tipo_persona_conductor, pero no el
-- NOMBRE: el guardia veia "PDF-1234 / Interna" y tenia que ir a buscar quien
-- era. Se anaden nombre y cedula del conductor al final (CREATE OR REPLACE VIEW
-- solo admite anadir columnas al final, no reordenarlas).
--
-- El resto de la definicion es identica a 20260713192500_fix_vista_vehiculos_dentro:
-- no se toca la logica de permanencia ni los limites. revisar_permanencia_vehiculos()
-- hace `select * from` sobre esta vista, asi que columnas nuevas al final no le
-- afectan.
--
-- ATENCION: esta migracion se aplico SIN la clausula `with (security_invoker = true)`
-- y eso reseteo la reloption de la vista (CREATE OR REPLACE VIEW no la conserva),
-- dejandola como SECURITY DEFINER. Se reparo en
-- 20260717021430_fix_security_invoker_vista_vehiculos_dentro. Aqui ya va incluida
-- para que un `db reset` desde cero no reproduzca el fallo.
create or replace view public.vista_vehiculos_dentro
with (security_invoker = true)
as
 with parametros as (
   select
     max(parametro_sistema.valor_parametro) filter (where parametro_sistema.codigo_parametro::text = 'PERMANENCIA_MAX_INTERNO_H'::text)::numeric as max_interno_h,
     max(parametro_sistema.valor_parametro) filter (where parametro_sistema.codigo_parametro::text = 'PERMANENCIA_MAX_EXTERNO_H'::text)::numeric as max_externo_h,
     max(parametro_sistema.valor_parametro) filter (where parametro_sistema.codigo_parametro::text = 'PERMANENCIA_MAX_VISITA_H'::text)::numeric as max_visita_h,
     max(parametro_sistema.valor_parametro) filter (where parametro_sistema.codigo_parametro::text = 'PERMANENCIA_ABANDONO_H'::text)::numeric as abandono_h
   from parametro_sistema
 ), movimientos as (
   select ea.id_vehiculo, ea.id_evento, ea.fecha_hora, ea.tipo_movimiento,
          ea.id_punto_control, ea.id_persona, ea.es_conductor,
          row_number() over (
            partition by ea.id_vehiculo
            order by ea.fecha_hora desc,
              (case ea.tipo_movimiento when 'SALIDA'::text then 0 else 1 end),
              (case when ea.es_conductor then 0 else 1 end)
          ) as rn
     from evento_acceso ea
    where ea.id_vehiculo is not null
      and ea.resultado = 'AUTORIZADO'::text
      and (ea.tipo_movimiento = any (array['INGRESO'::text, 'SALIDA'::text]))
 ), ultimo as (
   select movimientos.id_vehiculo, movimientos.id_evento, movimientos.fecha_hora,
          movimientos.tipo_movimiento, movimientos.id_punto_control, movimientos.id_persona
     from movimientos
    where movimientos.rn = 1 and movimientos.tipo_movimiento = 'INGRESO'::text
 )
 select
   u.id_vehiculo,
   v.placa,
   u.id_evento as id_evento_ingreso,
   u.fecha_hora as fecha_ingreso,
   u.id_punto_control,
   u.id_persona as id_persona_conductor,
   p.tipo_persona as tipo_persona_conductor,
   round(extract(epoch from now() - u.fecha_hora) / 3600.0, 2) as horas_dentro,
   case
     when p.tipo_persona = 'INTERNA'::text and p.estado = 'ACTIVO'::text then pa.max_interno_h
     when (exists (
       select 1 from persona_memorando pm
         join memorando m on m.id_memorando = pm.id_memorando
        where pm.id_persona = p.id_persona and pm.estado_acceso = 'ACTIVO'::text
          and current_date >= m.fecha_inicio and current_date <= m.fecha_fin
     )) then pa.max_externo_h
     when (exists (
       select 1 from autorizacion_visita_diaria a
        where a.id_persona = p.id_persona and a.estado_autorizacion = 'VIGENTE'::text
          and a.fecha_visita = current_date
     )) then pa.max_visita_h
     else null::numeric
   end as limite_horas_aplicable,
   pa.abandono_h as limite_abandono_horas,
   -- Columnas nuevas: quien conduce, no solo de que tipo es.
   p.nombres as nombres_conductor,
   p.apellidos as apellidos_conductor,
   p.cedula as cedula_conductor
 from ultimo u
   cross join parametros pa
   join vehiculo v on v.id_vehiculo = u.id_vehiculo
   left join persona p on p.id_persona = u.id_persona;

comment on view public.vista_vehiculos_dentro is
  'Vehiculos actualmente dentro del campus, con su conductor (nombre y cedula), horas dentro y limite de permanencia aplicable segun el tipo de persona.';
