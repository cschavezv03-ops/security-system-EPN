-- Escritura automatica en bitacora_sistema (SECURITY DEFINER) para toda
-- accion relevante de negocio. bitacora_sistema no tiene INSERT por politica
-- para ningun rol humano (docs/02_MATRIZ_PERMISOS_RLS.md): se escribe
-- exclusivamente desde aqui. No se audita `sesion` (ya es en si misma una
-- tabla de auditoria) ni `bitacora_sistema` (evita recursion).
--
-- Argumentos del trigger: arg0 = nombre de la columna PK, arg1 = modulo
-- dueño de la tabla (para la columna bitacora_sistema.modulo).

create or replace function public.registrar_bitacora()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id_entidad text;
begin
  v_id_entidad := to_jsonb(new) ->> TG_ARGV[0];

  insert into public.bitacora_sistema (
    id_usuario, accion, modulo, entidad_afectada, id_entidad_afectada,
    resultado, valor_anterior, valor_nuevo
  ) values (
    auth.uid(),
    TG_OP,
    TG_ARGV[1],
    TG_TABLE_NAME,
    v_id_entidad,
    'EXITO',
    case when TG_OP = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return new;
end;
$$;

-- ADM
create trigger trg_bitacora_persona after insert or update on public.persona for each row execute function public.registrar_bitacora('id_persona', 'ADM');
create trigger trg_bitacora_empresa after insert or update on public.empresa for each row execute function public.registrar_bitacora('id_empresa', 'ADM');
create trigger trg_bitacora_categoria_persona after insert or update on public.categoria_persona for each row execute function public.registrar_bitacora('id_categoria', 'ADM');
create trigger trg_bitacora_usuario_sistema after insert or update on public.usuario_sistema for each row execute function public.registrar_bitacora('id_usuario', 'ADM');
create trigger trg_bitacora_rol after insert or update on public.rol for each row execute function public.registrar_bitacora('id_rol', 'ADM');
create trigger trg_bitacora_permiso after insert or update on public.permiso for each row execute function public.registrar_bitacora('id_permiso', 'ADM');
create trigger trg_bitacora_usuario_rol after insert or update on public.usuario_rol for each row execute function public.registrar_bitacora('id_usuario_rol', 'ADM');
create trigger trg_bitacora_rol_permiso after insert or update on public.rol_permiso for each row execute function public.registrar_bitacora('id_rol_permiso', 'ADM');
create trigger trg_bitacora_parametro_sistema after insert or update on public.parametro_sistema for each row execute function public.registrar_bitacora('id_parametro', 'ADM');
create trigger trg_bitacora_vehiculo after insert or update on public.vehiculo for each row execute function public.registrar_bitacora('id_vehiculo', 'ADM');
create trigger trg_bitacora_persona_vehiculo after insert or update on public.persona_vehiculo for each row execute function public.registrar_bitacora('id_persona_vehiculo', 'ADM');

-- GPI
create trigger trg_bitacora_persona_interna_detalle after insert or update on public.persona_interna_detalle for each row execute function public.registrar_bitacora('id_persona', 'GPI');
create trigger trg_bitacora_registro_biometrico after insert or update on public.registro_biometrico for each row execute function public.registrar_bitacora('id_registro', 'GPI');

-- GPE
create trigger trg_bitacora_memorando after insert or update on public.memorando for each row execute function public.registrar_bitacora('id_memorando', 'GPE');
create trigger trg_bitacora_persona_memorando after insert or update on public.persona_memorando for each row execute function public.registrar_bitacora('id_persona_memorando', 'GPE');
create trigger trg_bitacora_autorizacion_visita_diaria after insert or update on public.autorizacion_visita_diaria for each row execute function public.registrar_bitacora('id_autorizacion', 'GPE');

-- PCO
create trigger trg_bitacora_zona after insert or update on public.zona for each row execute function public.registrar_bitacora('id_zona', 'PCO');
create trigger trg_bitacora_punto_control after insert or update on public.punto_control for each row execute function public.registrar_bitacora('id_punto_control', 'PCO');
create trigger trg_bitacora_dispositivo after insert or update on public.dispositivo for each row execute function public.registrar_bitacora('id_dispositivo', 'PCO');
create trigger trg_bitacora_guardia_punto_control after insert or update on public.guardia_punto_control for each row execute function public.registrar_bitacora('id_asignacion', 'PCO');

-- CAC
create trigger trg_bitacora_regla_acceso after insert or update on public.regla_acceso for each row execute function public.registrar_bitacora('id_regla_acceso', 'CAC');
create trigger trg_bitacora_evento_acceso after insert on public.evento_acceso for each row execute function public.registrar_bitacora('id_evento', 'CAC');
create trigger trg_bitacora_alerta_seguridad after insert or update on public.alerta_seguridad for each row execute function public.registrar_bitacora('id_alerta', 'CAC');
