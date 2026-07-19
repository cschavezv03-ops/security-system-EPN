-- GPE §3: `numero_memorando` deja de ser autogenerado. Ahora lo teclea quien registra el
-- memorando, copiando el número del oficio real. Eso obliga a garantizar en la base lo que
-- antes garantizaba el generador: que no se repita y que tenga una forma razonable.
--
-- GPE §2: la vigencia ya se calculaba bien en `vista_vigencia_acceso` (el acceso se deniega
-- correctamente), pero `estado_memorando` se quedaba en VIGENTE para siempre porque nada lo
-- actualizaba. Los tres memorandos sembrados vencieron el 2026-07-17 y seguían marcados como
-- vigentes. Se corrige con un estado efectivo calculado + una tarea diaria que sincroniza el
-- valor almacenado, para que la columna y la realidad no vuelvan a divergir.

-- ---------------------------------------------------------------------------
-- 1. Formato y unicidad del número tecleado a mano
-- ---------------------------------------------------------------------------

create or replace function public.es_numero_memorando(p_numero text)
returns boolean
language sql
immutable
as $$
  -- Sin patrón institucional fijo (§V3: cada dependencia numera a su manera), pero sí una
  -- forma mínima: 3 a 50 caracteres, letras/dígitos y los separadores de un número de oficio.
  -- Debe contener al menos un dígito: "MEMORANDO" a secas no identifica ningún documento.
  select p_numero is null or (
    length(btrim(p_numero)) between 3 and 50
    and btrim(p_numero) ~ '^[A-Za-z0-9][A-Za-z0-9 ./-]*[A-Za-z0-9]$'
    and btrim(p_numero) ~ '[0-9]'
  );
$$;

comment on function public.es_numero_memorando(text) is
  'Forma mínima de un número de memorando tecleado a mano (GPE §3). Sin patrón institucional fijo.';

-- Los tres números sembrados venían del generador `MEM-${Date.now().toString(36)}`, que produce
-- cadenas como MEM-MRQUHXKD — sin un solo dígito, y que no se parecen a un memorando real de la
-- Politécnica. Como ese generador desaparece en esta misma migración, se renumeran ahora con el
-- formato institucional para que las pantallas muestren algo reconocible. Son datos de demo.
update public.memorando m
   set numero_memorando = 'EPN-DA-2026-' || lpad((t.orden)::text, 4, '0') || '-M'
  from (
    select id_memorando, row_number() over (order by fecha_registro) as orden
      from public.memorando
  ) t
 where t.id_memorando = m.id_memorando
   and m.numero_memorando like 'MEM-%';

alter table public.memorando
  add constraint memorando_numero_formato check (public.es_numero_memorando(numero_memorando));

-- Único: dos memorandos con el mismo número serían indistinguibles para el guardia.
create unique index if not exists memorando_numero_unico
  on public.memorando (upper(btrim(numero_memorando)));

-- ---------------------------------------------------------------------------
-- 2. Estado ANULADO
-- ---------------------------------------------------------------------------
-- Un memorando puede revocarse antes de su fecha_fin (la empresa termina el contrato, la
-- dependencia retira la autorización). Hasta ahora la única salida era acortar fecha_fin, que
-- falsea el documento original.

alter table public.memorando drop constraint if exists memorando_estado_memorando_check;
alter table public.memorando
  add constraint memorando_estado_memorando_check
  check (estado_memorando in ('VIGENTE', 'VENCIDO', 'ANULADO'));

alter table public.memorando add column if not exists motivo_anulacion text;
alter table public.memorando add column if not exists fecha_anulacion timestamptz;

alter table public.memorando
  add constraint memorando_anulado_con_motivo
  check (estado_memorando <> 'ANULADO' or btrim(coalesce(motivo_anulacion, '')) <> '');

-- ---------------------------------------------------------------------------
-- 3. Estado efectivo y hora de corte
-- ---------------------------------------------------------------------------

create or replace function public.estado_memorando_efectivo(
  p_estado text, p_fecha_inicio date, p_fecha_fin date
)
returns text
language sql
stable
as $$
  -- La anulación es una decisión humana y gana sobre las fechas. El resto se deduce del
  -- calendario: fecha_fin es inclusiva (§D24), así que el último día todavía vale.
  select case
    when p_estado = 'ANULADO' then 'ANULADO'
    when current_date < p_fecha_inicio then 'PROGRAMADO'
    when current_date > p_fecha_fin then 'VENCIDO'
    else 'VIGENTE'
  end;
$$;

comment on function public.estado_memorando_efectivo(text, date, date) is
  'Estado real del memorando según el calendario (GPE §2). PROGRAMADO no se almacena: es informativo.';

create or replace function public.hora_corte_categoria(p_id_categoria uuid)
returns time
language sql
stable
as $$
  -- GPE §2 pide considerar "la hora que se añade como regla desde CAC": el último día de
  -- vigencia el acceso no dura hasta medianoche, sino hasta que cierra la regla de acceso
  -- aplicable a esa categoría. La Edge Function ya lo aplica al validar; esto existe para
  -- poder MOSTRARLO ("vigente hasta el 17/07/2026 a las 18:00") en vez de dejar que el
  -- usuario lo descubra en la garita.
  select max(horario_fin)
  from public.regla_acceso
  where id_categoria = p_id_categoria and estado_regla = 'ACTIVA';
$$;

comment on function public.hora_corte_categoria(uuid) is
  'Hora a la que cierra el acceso para una categoría, según las reglas activas de CAC (GPE §2).';

-- ---------------------------------------------------------------------------
-- 4. Sincronización automática del estado almacenado
-- ---------------------------------------------------------------------------

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
     and current_date > fecha_fin;
  get diagnostics v_afectados = row_count;

  -- Un memorando que vuelve a estar dentro de su ventana (se corrigió la fecha_fin) recupera
  -- la vigencia. Sin esto, alargar un memorando vencido no lo reactivaría nunca.
  update public.memorando
     set estado_memorando = 'VIGENTE'
   where estado_memorando = 'VENCIDO'
     and current_date between fecha_inicio and fecha_fin;

  return v_afectados;
end;
$$;

comment on function public.sincronizar_estado_memorandos() is
  'Pone al día memorando.estado_memorando según el calendario. La ejecuta pg_cron cada día (GPE §2).';

revoke all on function public.sincronizar_estado_memorandos() from public;
grant execute on function public.sincronizar_estado_memorandos() to authenticated, service_role;

-- 00:05 hora de Ecuador = 05:05 UTC. El servidor corre en UTC.
select cron.schedule(
  'sincronizar-estado-memorandos',
  '5 5 * * *',
  $cron$ select public.sincronizar_estado_memorandos(); $cron$
);

-- Poner al día lo que ya está vencido (los tres memorandos sembrados).
select public.sincronizar_estado_memorandos();
