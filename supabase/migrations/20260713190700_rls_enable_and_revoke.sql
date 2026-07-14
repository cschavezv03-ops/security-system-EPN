-- RLS: habilitacion en las 25 tablas + privilegios base.
-- Fuente: docs/02_MATRIZ_PERMISOS_RLS.md "Notas de implementacion para RLS".
--
-- Nota: config.toml tiene auto_expose_new_tables desactivado (default nuevo
-- de Supabase), por lo que las tablas nuevas NO son alcanzables por
-- anon/authenticated sin GRANT explicito. Se otorga SELECT/INSERT/UPDATE
-- (nunca DELETE) a `authenticated`; las politicas RLS de los siguientes
-- migrations son las que de verdad restringen fila por fila. `anon` no
-- recibe ningun privilegio: no hay usuarios anonimos en este sistema.

alter table public.persona enable row level security;
alter table public.empresa enable row level security;
alter table public.categoria_persona enable row level security;
alter table public.usuario_sistema enable row level security;
alter table public.sesion enable row level security;
alter table public.rol enable row level security;
alter table public.permiso enable row level security;
alter table public.usuario_rol enable row level security;
alter table public.rol_permiso enable row level security;
alter table public.parametro_sistema enable row level security;
alter table public.bitacora_sistema enable row level security;
alter table public.vehiculo enable row level security;
alter table public.persona_vehiculo enable row level security;
alter table public.persona_interna_detalle enable row level security;
alter table public.registro_biometrico enable row level security;
alter table public.memorando enable row level security;
alter table public.persona_memorando enable row level security;
alter table public.autorizacion_visita_diaria enable row level security;
alter table public.zona enable row level security;
alter table public.punto_control enable row level security;
alter table public.dispositivo enable row level security;
alter table public.guardia_punto_control enable row level security;
alter table public.regla_acceso enable row level security;
alter table public.evento_acceso enable row level security;
alter table public.alerta_seguridad enable row level security;

-- Privilegios base: SELECT/INSERT/UPDATE a authenticated (RLS restringe filas).
grant select, insert, update on all tables in schema public to authenticated;

-- DELETE prohibido en todo el sistema (cinturon y tirantes junto con la
-- ausencia de politicas de DELETE).
revoke delete on all tables in schema public from authenticated;

-- evento_acceso y bitacora_sistema son historicos: solo INSERT, nunca UPDATE.
revoke update on public.evento_acceso from authenticated;
revoke update on public.bitacora_sistema from authenticated;

-- Privilegios por defecto para tablas futuras (si se añaden migraciones
-- posteriores) siguen el mismo patron: select/insert/update, nunca delete.
alter default privileges in schema public grant select, insert, update on tables to authenticated;
