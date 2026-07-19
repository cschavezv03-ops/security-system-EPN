-- RF-CA-005 exige que un ingreso sin regla configurada se registre con un motivo propio
-- ("No existe regla de acceso para el ingreso"), y RF-CA-023 pide alerta por cada evento de
-- seguridad. Sin un tipo propio, ese caso caia en PERSONA_NO_AUTORIZADA y quedaba mezclado
-- con las personas bloqueadas: dos problemas que se arreglan en sitios distintos — uno lo
-- resuelve CAC creando una regla, el otro ADM desbloqueando a alguien.

alter table public.alerta_seguridad
  drop constraint alerta_seguridad_tipo_alerta_check;

alter table public.alerta_seguridad
  add constraint alerta_seguridad_tipo_alerta_check
  check (tipo_alerta in (
    'BIOMETRIA_FALLIDA', 'PERSONA_NO_AUTORIZADA', 'MEMORANDO_VENCIDO', 'FUERA_DE_HORARIO',
    'PUNTO_SALIDA_INCORRECTO', 'DISPOSITIVO_NO_RECONOCIDO', 'VEHICULO_NO_AUTORIZADO',
    'VEHICULO_PERMANENCIA_EXCEDIDA', 'VEHICULO_ABANDONADO',
    'PERSONA_DESCONOCIDA', 'GARITA_NO_AUTORIZADA', 'PLACA_NO_RECONOCIDA',
    'DOBLE_AUTENTICACION_FALLIDA', 'SIN_REGLA_ACCESO'
  ));

create or replace function public.generar_alerta_desde_evento_denegado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_codigo text;
  v_tipo_alerta text;
  v_nivel_riesgo text;
  v_tipos_validos text[] := array[
    'BIOMETRIA_FALLIDA', 'PERSONA_NO_AUTORIZADA', 'MEMORANDO_VENCIDO',
    'FUERA_DE_HORARIO', 'PUNTO_SALIDA_INCORRECTO', 'VEHICULO_NO_AUTORIZADO',
    'PERSONA_DESCONOCIDA', 'GARITA_NO_AUTORIZADA', 'PLACA_NO_RECONOCIDA',
    'DOBLE_AUTENTICACION_FALLIDA', 'SIN_REGLA_ACCESO'
  ];
begin
  if new.resultado <> 'DENEGADO' then
    return new;
  end if;

  v_codigo := upper(trim(split_part(coalesce(new.motivo_resultado, ''), ':', 1)));

  if v_codigo = any(v_tipos_validos) then
    v_tipo_alerta := v_codigo;
  else
    v_tipo_alerta := 'PERSONA_NO_AUTORIZADA';
  end if;

  v_nivel_riesgo := case v_tipo_alerta
    when 'PERSONA_DESCONOCIDA' then 'ALTO'
    when 'PLACA_NO_RECONOCIDA' then 'ALTO'
    when 'VEHICULO_NO_AUTORIZADO' then 'ALTO'
    when 'DOBLE_AUTENTICACION_FALLIDA' then 'ALTO'
    when 'FUERA_DE_HORARIO' then 'BAJO'
    when 'GARITA_NO_AUTORIZADA' then 'BAJO'
    -- Un hueco de configuracion, no una amenaza: nadie ha hecho nada malo, falta una regla.
    when 'SIN_REGLA_ACCESO' then 'BAJO'
    else 'MEDIO'
  end;

  insert into public.alerta_seguridad (id_evento, tipo_alerta, nivel_riesgo, estado_alerta)
  values (new.id_evento, v_tipo_alerta, v_nivel_riesgo, 'PENDIENTE');

  return new;
end;
$function$;
