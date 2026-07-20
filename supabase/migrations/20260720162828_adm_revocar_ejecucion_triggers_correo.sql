-- ADM · Los triggers de propagación del correo no son API.
--
-- El linter de Supabase (0028/0029) los señaló tras la migración adm_correo_unico_sincronizado:
-- al crearse como funciones normales quedaron con el EXECUTE por defecto, así que aparecían
-- publicados en /rest/v1/rpc/ para `anon` y `authenticated`.
--
-- El riesgo real es bajo —son funciones de trigger: sin NEW/OLD fallan nada más entrar—, pero
-- una función SECURITY DEFINER que toca el esquema auth no tiene por qué estar publicada en la
-- API para que alguien la sondee. Se revoca, que es lo que ya se hizo con
-- `sincronizar_correo_auth` en su propia migración.

revoke all on function public.propagar_correo_cuenta() from public, anon, authenticated;
revoke all on function public.propagar_correo_persona() from public, anon, authenticated;

comment on function public.propagar_correo_cuenta() is
  'Trigger de usuario_sistema. No es API: EXECUTE revocado a anon y authenticated.';
comment on function public.propagar_correo_persona() is
  'Trigger de persona. No es API: EXECUTE revocado a anon y authenticated.';
