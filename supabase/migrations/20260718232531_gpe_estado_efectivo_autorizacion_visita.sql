-- GPE §8: el combo "Estado" del formulario de registro de autorización no tenía sentido —
-- ofrecía elegir entre VIGENTE y REVOCADA al crear una visita que, por definición, nace
-- vigente. Y una vez creada, la columna se quedaba en VIGENTE aunque la fecha de visita ya
-- hubiera pasado, igual que ocurría con los memorandos.
--
-- Se resuelve igual que en el memorando: lo ALMACENADO recoge solo la decisión humana
-- (VIGENTE o REVOCADA); lo MOSTRADO se calcula a partir de la fecha. No hace falta ampliar el
-- CHECK: PROGRAMADA y CADUCADA no son decisiones, son consecuencias del calendario.

create or replace function public.estado_autorizacion_efectivo(
  p_estado text, p_fecha_visita date
)
returns text
language sql
stable
as $$
  select case
    when p_estado = 'REVOCADA' then 'REVOCADA'
    when p_fecha_visita > current_date then 'PROGRAMADA'
    when p_fecha_visita < current_date then 'CADUCADA'
    else 'VIGENTE'
  end;
$$;

comment on function public.estado_autorizacion_efectivo(text, date) is
  'Estado real de una autorización de visita según el calendario (GPE §8). Solo VIGENTE/REVOCADA se almacenan.';

-- El motivo de la revocación se perdía: el modal de baja lo pedía pero no había dónde
-- guardarlo, así que se descartaba en silencio.
alter table public.autorizacion_visita_diaria add column if not exists motivo_revocacion text;

alter table public.autorizacion_visita_diaria
  add constraint autorizacion_revocada_con_motivo
  check (estado_autorizacion <> 'REVOCADA' or btrim(coalesce(motivo_revocacion, '')) <> '');

-- Una misma persona no debería tener dos autorizaciones para el mismo día: la segunda no
-- añade nada y confunde al guardia sobre cuál está usando.
create unique index if not exists autorizacion_visita_persona_fecha_unica
  on public.autorizacion_visita_diaria (id_persona, fecha_visita);
