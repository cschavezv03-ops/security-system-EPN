-- Nuevos requerimientos PCO (documento "Nuevos_Requerimientos_PCO", 21/07):
--
-- 1. "Controlar que las direcciones IP no se repitan, tiene que funcionar como la vida real,
--    una IP única por dispositivo". Verificado contra el remoto: hoy NO hay ninguna restricción
--    de unicidad sobre `direccion_ip`, y de hecho hay dos dispositivos con la misma IP
--    (10.0.0.10) — el propio bug que reporta el documento con una captura de pantalla.
--
-- 2. "En vez de MAC trabajar con un ID" con formato BIO-0001 / LPR-0001, asignado
--    automáticamente (no tecleado), tanto para los dispositivos que ya existen como para los
--    nuevos. `dispositivo_tecnologia` solo tiene dos valores hoy (BIOMETRIA_FACIAL, LPR_PLACAS),
--    que son justo los dos prefijos que pide el documento.
--
-- La MAC no se borra (sin borrado físico de datos, y son direcciones reales de hardware ya
-- inventariado): deja de ser obligatoria y deja de ser la identidad del dispositivo, pero se
-- conserva como dato histórico opcional.

-- --- 1. Arreglar el duplicado real antes de poder exigir unicidad -----------------------------
-- Los dos dispositivos con 10.0.0.10 son el sembrado de demo (Edificio 20): se corrige el que
-- está en avería, dejando operativo el que ya identificaba al punto en el resto de las demos.
update public.dispositivo
   set direccion_ip = '10.0.0.12'
 where id_dispositivo = '27cdf814-9849-4ba7-84f4-7ae0bcfc238f'
   and direccion_ip = '10.0.0.10';

alter table public.dispositivo
  add constraint dispositivo_direccion_ip_key unique (direccion_ip);

-- --- 2. Código legible autogenerado, con prefijo por tecnología -----------------------------

create or replace function public.prefijo_tecnologia_dispositivo(p_tipo text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_tipo
    when 'BIOMETRIA_FACIAL' then 'BIO'
    when 'LPR_PLACAS'       then 'LPR'
  end;
$$;

comment on function public.prefijo_tecnologia_dispositivo(text) is
  'Prefijo del código legible de un dispositivo según su tecnología: BIO (biometría facial), LPR (lector de placas).';

-- Siguiente número disponible para un prefijo, a partir del máximo ya usado (no un secuencial
-- de tabla aparte: así conviven sin líos los dos contadores, uno por tecnología).
create or replace function public.siguiente_codigo_dispositivo(p_tipo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefijo text := public.prefijo_tecnologia_dispositivo(p_tipo);
  v_siguiente int;
begin
  if v_prefijo is null then
    raise exception 'No hay un prefijo de código definido para la tecnología %', p_tipo
      using errcode = 'check_violation';
  end if;

  select coalesce(max(substring(codigo_dispositivo from '[0-9]+$')::int), 0) + 1
    into v_siguiente
    from public.dispositivo
   where tipo_tecnologia = p_tipo;

  return v_prefijo || '-' || lpad(v_siguiente::text, 4, '0');
end;
$$;

comment on function public.siguiente_codigo_dispositivo(text) is
  'Siguiente código legible para una tecnología dada, ej. BIO-0001, BIO-0002, LPR-0001.';

alter table public.dispositivo add column if not exists codigo_dispositivo varchar(20);

-- Backfill de los dispositivos existentes, en un orden estable (por MAC, que hasta hoy era su
-- identidad) para que el resultado sea reproducible.
do $$
declare
  r record;
  v_contador int;
begin
  for r in
    select id_dispositivo, tipo_tecnologia,
           row_number() over (partition by tipo_tecnologia order by codigo_mac) as posicion
      from public.dispositivo
     order by tipo_tecnologia, codigo_mac
  loop
    v_contador := r.posicion;
    update public.dispositivo
       set codigo_dispositivo = public.prefijo_tecnologia_dispositivo(r.tipo_tecnologia) || '-' || lpad(v_contador::text, 4, '0')
     where id_dispositivo = r.id_dispositivo;
  end loop;
end;
$$;

alter table public.dispositivo alter column codigo_dispositivo set not null;
alter table public.dispositivo add constraint dispositivo_codigo_dispositivo_key unique (codigo_dispositivo);

-- La MAC deja de ser obligatoria ni la identidad del dispositivo: se conserva como dato
-- histórico opcional (no hay borrado físico de datos ya inventariados).
alter table public.dispositivo alter column codigo_mac drop not null;

create or replace function public.asignar_codigo_dispositivo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- El código se asigna una sola vez, al crear el dispositivo, y no cambia después: es su
  -- identidad, igual que antes lo era la MAC. Cualquier valor que llegue del cliente se ignora.
  new.codigo_dispositivo := public.siguiente_codigo_dispositivo(new.tipo_tecnologia);
  return new;
end;
$$;

comment on function public.asignar_codigo_dispositivo() is
  'Asigna automáticamente el código legible (BIO-0001, LPR-0001...) al registrar un dispositivo. No se puede teclear a mano ni cambiar después.';

drop trigger if exists trg_asignar_codigo_dispositivo on public.dispositivo;
create trigger trg_asignar_codigo_dispositivo
  before insert on public.dispositivo
  for each row execute function public.asignar_codigo_dispositivo();

revoke execute on function public.prefijo_tecnologia_dispositivo(text) from public, anon, authenticated;
revoke execute on function public.siguiente_codigo_dispositivo(text) from public, anon, authenticated;
revoke execute on function public.asignar_codigo_dispositivo() from public, anon, authenticated;
