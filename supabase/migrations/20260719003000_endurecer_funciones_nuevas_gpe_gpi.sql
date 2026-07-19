-- El linter de Supabase señaló dos cosas de las funciones que añadió esta ronda.
--
-- 1) `sincronizar_estado_memorandos` es SECURITY DEFINER y quedaba ejecutable por el rol
--    `anon`. Es la más delicada de todas: escribe sobre `memorando`, así que alguien con solo
--    la clave anónima —que va incrustada en el JavaScript de la aplicación y por tanto es
--    pública— podría reactivar memorandos vencidos y darse acceso al campus. El `revoke ... from
--    public` de la migración original no bastó: `anon` y `authenticated` son roles concretos y
--    hay que revocarles el privilegio de forma explícita.
--
-- 2) Las funciones nuevas no fijaban `search_path`. En una SECURITY DEFINER eso permite que
--    quien la llame anteponga un esquema propio y sustituya las tablas que la función
--    referencia. En las STABLE el riesgo es menor, pero la convención del proyecto
--    (`hardening_funciones`, `endurecer_permisos_funciones_trigger`) es fijarlo siempre.

revoke execute on function public.sincronizar_estado_memorandos() from anon;

alter function public.hoy_ecuador() set search_path = public;
alter function public.estado_memorando_efectivo(text, date, date) set search_path = public;
alter function public.estado_autorizacion_efectivo(text, date) set search_path = public;
alter function public.es_numero_memorando(text) set search_path = public;
alter function public.hora_corte_categoria(uuid) set search_path = public;
alter function public.normalizar_zona() set search_path = public;
alter function public.normalizar_punto_control() set search_path = public;
