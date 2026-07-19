-- El servidor corre en UTC y todo el sistema usaba `current_date`, que a partir de las 19:00
-- hora de Ecuador (UTC-5) ya devuelve el día siguiente. Consecuencia real, no teórica:
--
--   * `vista_vigencia_acceso` dejaba de reconocer las autorizaciones de visita del día a las
--     19:00. Un visitante con permiso válido era DENEGADO en la garita durante las últimas
--     cinco horas de cada jornada.
--   * Un memorando cuyo último día era hoy dejaba de autorizar cinco horas antes de tiempo,
--     contradiciendo §D24 ("fecha_fin inclusiva").
--   * `es_fecha_nacimiento_valida` aceptaba como pasada una fecha que en Ecuador es mañana.
--
-- La Edge Function `registrar-evento-acceso` ya hacía lo correcto: calcula la hora con
-- `America/Guayaquil` explícitamente para evaluar las reglas de CAC. La base se había quedado
-- atrás, así que la comprobación de horario pasaba y la de vigencia fallaba.
--
-- Ecuador continental no aplica horario de verano, pero se usa el nombre de zona en vez de un
-- desplazamiento fijo para que siga siendo correcto si eso cambia.

create or replace function public.hoy_ecuador()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Guayaquil')::date;
$$;

comment on function public.hoy_ecuador() is
  'Fecha de hoy en Ecuador. El servidor corre en UTC: current_date adelanta un día desde las 19:00 local.';

grant execute on function public.hoy_ecuador() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Vigencia de acceso: la vista que decide si alguien entra
-- ---------------------------------------------------------------------------

create or replace view public.vista_vigencia_acceso
with (security_invoker = true) as
  select p.id_persona,
         p.tipo_persona,
         'INTERNA_ACTIVA'::text as via_vigencia,
         null::uuid as id_memorando,
         null::uuid as id_autorizacion,
         null::date as vigente_hasta
    from persona p
   where p.tipo_persona = 'INTERNA' and p.estado = 'ACTIVO'
  union all
  select p.id_persona,
         p.tipo_persona,
         'MEMORANDO'::text as via_vigencia,
         m.id_memorando,
         null::uuid as id_autorizacion,
         m.fecha_fin as vigente_hasta
    from persona p
    join persona_memorando pm on pm.id_persona = p.id_persona and pm.estado_acceso = 'ACTIVO'
    join memorando m on m.id_memorando = pm.id_memorando
   where p.tipo_persona = 'EXTERNA'
     and p.estado = 'ACTIVO'
     -- Un memorando anulado deja de autorizar aunque sus fechas sigan corriendo.
     and m.estado_memorando <> 'ANULADO'
     and public.hoy_ecuador() between m.fecha_inicio and m.fecha_fin
  union all
  select p.id_persona,
         p.tipo_persona,
         'AUTORIZACION_DIARIA'::text as via_vigencia,
         null::uuid as id_memorando,
         a.id_autorizacion,
         a.fecha_visita as vigente_hasta
    from persona p
    join autorizacion_visita_diaria a on a.id_persona = p.id_persona
   where p.tipo_persona = 'EXTERNA'
     and p.estado = 'ACTIVO'
     and a.estado_autorizacion = 'VIGENTE'
     and a.fecha_visita = public.hoy_ecuador();

comment on view public.vista_vigencia_acceso is
  'Vías por las que una persona puede entrar hoy (hora de Ecuador). La consulta la Edge Function de acceso.';

-- ---------------------------------------------------------------------------
-- Estados efectivos y validaciones que dependen del día
-- ---------------------------------------------------------------------------

create or replace function public.estado_memorando_efectivo(
  p_estado text, p_fecha_inicio date, p_fecha_fin date
)
returns text
language sql
stable
as $$
  select case
    when p_estado = 'ANULADO' then 'ANULADO'
    when public.hoy_ecuador() < p_fecha_inicio then 'PROGRAMADO'
    when public.hoy_ecuador() > p_fecha_fin then 'VENCIDO'
    else 'VIGENTE'
  end;
$$;

create or replace function public.estado_autorizacion_efectivo(
  p_estado text, p_fecha_visita date
)
returns text
language sql
stable
as $$
  select case
    when p_estado = 'REVOCADA' then 'REVOCADA'
    when p_fecha_visita > public.hoy_ecuador() then 'PROGRAMADA'
    when p_fecha_visita < public.hoy_ecuador() then 'CADUCADA'
    else 'VIGENTE'
  end;
$$;

create or replace function public.sincronizar_estado_memorandos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_afectados integer;
begin
  update public.memorando
     set estado_memorando = 'VENCIDO'
   where estado_memorando = 'VIGENTE'
     and public.hoy_ecuador() > fecha_fin;
  get diagnostics v_afectados = row_count;

  update public.memorando
     set estado_memorando = 'VIGENTE'
   where estado_memorando = 'VENCIDO'
     and public.hoy_ecuador() between fecha_inicio and fecha_fin;

  return v_afectados;
end;
$$;

revoke all on function public.sincronizar_estado_memorandos() from public;
grant execute on function public.sincronizar_estado_memorandos() to authenticated, service_role;

-- Una fecha de nacimiento "de mañana en Ecuador" no debe colarse por ser "hoy en UTC".
create or replace function public.es_fecha_nacimiento_valida(p_fecha date)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_fecha is null
      or (p_fecha <= public.hoy_ecuador() and p_fecha > public.hoy_ecuador() - interval '120 years');
$$;
