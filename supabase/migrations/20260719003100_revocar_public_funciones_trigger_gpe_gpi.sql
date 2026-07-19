-- Las funciones de trigger seguían siendo invocables por `anon` pese al revoke anterior: en
-- PostgreSQL, EXECUTE se concede a PUBLIC por defecto al crear una función, y tanto `anon` como
-- `authenticated` heredan de ahí. Revocar del rol concreto no quita lo que viene de PUBLIC.
--
-- Ninguna de las tres tiene sentido llamada desde la API REST: son el cuerpo de un trigger y
-- esperan el contexto de una fila (NEW/OLD). `validar_codigo_unico_estudiante` es además
-- SECURITY DEFINER.

revoke execute on function public.validar_codigo_unico_estudiante() from public, anon, authenticated;
revoke execute on function public.normalizar_zona() from public, anon, authenticated;
revoke execute on function public.normalizar_punto_control() from public, anon, authenticated;

-- El propietario de la tabla es quien dispara el trigger, así que siguen funcionando: se
-- comprobó insertando una zona con espacios sobrantes (se normalizó) y un docente con código
-- único (se rechazó), ambos dentro de una transacción deshecha.
