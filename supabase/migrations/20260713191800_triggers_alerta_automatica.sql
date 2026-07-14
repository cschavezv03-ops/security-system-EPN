-- Generacion automatica de alerta_seguridad a partir de un evento_acceso
-- DENEGADO (§D4: nadie crea alertas a mano, nacen de un trigger).
--
-- El mapeo motivo_resultado -> tipo_alerta es una heuristica conservadora:
-- ningun documento define el algoritmo exacto de clasificacion (D16 marca el
-- catalogo de tipo_alerta como "provisional, a confirmar con el equipo CAC").
-- Ver docs/99_DUDAS_PARA_EL_EQUIPO.md.

create or replace function public.generar_alerta_desde_evento_denegado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo_alerta text;
  v_nivel_riesgo text;
begin
  if new.resultado <> 'DENEGADO' then
    return new;
  end if;

  v_tipo_alerta := case
    when new.motivo_resultado ilike '%biometr%' then 'BIOMETRIA_FALLIDA'
    when new.motivo_resultado ilike '%memorando%' then 'MEMORANDO_VENCIDO'
    when new.motivo_resultado ilike '%horario%' then 'FUERA_DE_HORARIO'
    when new.motivo_resultado ilike '%salida%' then 'PUNTO_SALIDA_INCORRECTO'
    when new.motivo_resultado ilike '%dispositivo%' then 'DISPOSITIVO_NO_RECONOCIDO'
    when new.id_vehiculo is not null and new.motivo_resultado ilike '%vehic%' then 'VEHICULO_NO_AUTORIZADO'
    -- Default conservador para una denegacion sin motivo clasificable: se
    -- trata como identidad sin autorizacion de acceso, el caso mas comun.
    else 'PERSONA_NO_AUTORIZADA'
  end;

  v_nivel_riesgo := case v_tipo_alerta
    when 'DISPOSITIVO_NO_RECONOCIDO' then 'ALTO'
    when 'VEHICULO_NO_AUTORIZADO' then 'ALTO'
    else 'MEDIO'
  end;

  insert into public.alerta_seguridad (id_evento, tipo_alerta, nivel_riesgo, estado_alerta)
  values (new.id_evento, v_tipo_alerta, v_nivel_riesgo, 'PENDIENTE');

  return new;
end;
$$;

create trigger trg_generar_alerta_evento_denegado
after insert on public.evento_acceso
for each row execute function public.generar_alerta_desde_evento_denegado();
