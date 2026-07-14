-- Bloqueo de DELETE fisico a nivel de trigger, ademas del REVOKE DELETE ya
-- aplicado (bloque 4). Cinturon y tirantes: ninguna baja elimina la fila,
-- se cambia el campo de estado.

create or replace function public.bloquear_delete_fisico()
returns trigger
language plpgsql
as $$
begin
  raise exception 'DELETE fisico prohibido en %: cambie el campo de estado de la fila en su lugar.', TG_TABLE_NAME;
end;
$$;

create trigger trg_bloquear_delete_persona before delete on public.persona for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_empresa before delete on public.empresa for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_categoria_persona before delete on public.categoria_persona for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_usuario_sistema before delete on public.usuario_sistema for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_sesion before delete on public.sesion for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_rol before delete on public.rol for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_permiso before delete on public.permiso for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_usuario_rol before delete on public.usuario_rol for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_rol_permiso before delete on public.rol_permiso for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_parametro_sistema before delete on public.parametro_sistema for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_bitacora_sistema before delete on public.bitacora_sistema for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_vehiculo before delete on public.vehiculo for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_persona_vehiculo before delete on public.persona_vehiculo for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_persona_interna_detalle before delete on public.persona_interna_detalle for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_registro_biometrico before delete on public.registro_biometrico for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_memorando before delete on public.memorando for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_persona_memorando before delete on public.persona_memorando for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_autorizacion_visita_diaria before delete on public.autorizacion_visita_diaria for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_zona before delete on public.zona for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_punto_control before delete on public.punto_control for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_dispositivo before delete on public.dispositivo for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_guardia_punto_control before delete on public.guardia_punto_control for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_regla_acceso before delete on public.regla_acceso for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_evento_acceso before delete on public.evento_acceso for each row execute function public.bloquear_delete_fisico();
create trigger trg_bloquear_delete_alerta_seguridad before delete on public.alerta_seguridad for each row execute function public.bloquear_delete_fisico();
