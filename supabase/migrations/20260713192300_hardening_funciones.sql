-- Hardening de funciones (resuelve los advisors de seguridad del linter de
-- Supabase, categoria WARN):
--   1. function_search_path_mutable: fijar search_path en las 6 funciones de
--      trigger que no lo tenian.
--   2. anon/authenticated_security_definer_function_executable: revocar
--      EXECUTE a PUBLIC/anon en todas las funciones propias; re-conceder solo
--      a authenticated las que son RPC/uso-en-RLS legitimos. Las funciones de
--      trigger y la de cron quedan sin EXECUTE para ningun rol de la API
--      (los triggers y pg_cron las invocan por mecanismo interno, que no
--      comprueba el privilegio EXECUTE).
--
-- Nota: public.rls_auto_enable() NO se toca: es un event trigger propio de la
-- plataforma Supabase (auto-habilita RLS en tablas nuevas), no de este proyecto.

-- 1. search_path fijo en las funciones de trigger que faltaban.
alter function public.normalizar_placa_vehiculo() set search_path = public;
alter function public.bloquear_biometria_externa() set search_path = public;
alter function public.set_fecha_modificacion() set search_path = public;
alter function public.set_fecha_actualizacion_vehiculo() set search_path = public;
alter function public.bloquear_delete_fisico() set search_path = public;
alter function public.validar_jerarquia_zona() set search_path = public;

-- 2a. Revocar EXECUTE a PUBLIC (cubre anon y cualquier rol) en todas las
-- funciones propias.
revoke execute on function
  public.tiene_permiso(text),
  public.permisos_efectivos(),
  public.tiene_algun_modulo(),
  public.tiene_acceso_operativo_cac(),
  public.puntos_control_asignados(),
  public.allowed_modules(),
  public.registrar_sesion(text, boolean),
  public.crear_usuario_sistema(),
  public.sincronizar_correo_usuario_sistema(),
  public.generar_alerta_desde_evento_denegado(),
  public.registrar_bitacora(),
  public.revisar_permanencia_vehiculos(),
  public.normalizar_placa_vehiculo(),
  public.bloquear_biometria_externa(),
  public.set_fecha_modificacion(),
  public.set_fecha_actualizacion_vehiculo(),
  public.bloquear_delete_fisico(),
  public.validar_jerarquia_zona()
from public;

revoke execute on function
  public.tiene_permiso(text),
  public.permisos_efectivos(),
  public.tiene_algun_modulo(),
  public.tiene_acceso_operativo_cac(),
  public.puntos_control_asignados(),
  public.allowed_modules(),
  public.registrar_sesion(text, boolean),
  public.crear_usuario_sistema(),
  public.sincronizar_correo_usuario_sistema(),
  public.generar_alerta_desde_evento_denegado(),
  public.registrar_bitacora(),
  public.revisar_permanencia_vehiculos(),
  public.normalizar_placa_vehiculo(),
  public.bloquear_biometria_externa(),
  public.set_fecha_modificacion(),
  public.set_fecha_actualizacion_vehiculo(),
  public.bloquear_delete_fisico(),
  public.validar_jerarquia_zona()
from anon;

-- 2b. Re-conceder EXECUTE solo a authenticated en las funciones que SI se
-- invocan por API (RPC desde el frontend) o dentro de las politicas RLS.
grant execute on function
  public.tiene_permiso(text),
  public.permisos_efectivos(),
  public.tiene_algun_modulo(),
  public.tiene_acceso_operativo_cac(),
  public.puntos_control_asignados(),
  public.allowed_modules(),
  public.registrar_sesion(text, boolean)
to authenticated;

-- 2c. Las funciones de trigger y la de cron quedan sin EXECUTE para
-- authenticated tambien (nadie las llama por RPC).
revoke execute on function
  public.crear_usuario_sistema(),
  public.sincronizar_correo_usuario_sistema(),
  public.generar_alerta_desde_evento_denegado(),
  public.registrar_bitacora(),
  public.revisar_permanencia_vehiculos(),
  public.normalizar_placa_vehiculo(),
  public.bloquear_biometria_externa(),
  public.set_fecha_modificacion(),
  public.set_fecha_actualizacion_vehiculo(),
  public.bloquear_delete_fisico(),
  public.validar_jerarquia_zona()
from authenticated;
