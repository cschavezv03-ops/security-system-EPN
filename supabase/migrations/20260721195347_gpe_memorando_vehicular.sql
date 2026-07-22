-- Ingreso vehicular del personal externo (GPE + CAC).
--
-- Hasta ahora un externo solo podía entrar a pie: la garita validaba su cédula contra la
-- vigencia y listo. El ingreso vehicular estaba pensado para el personal interno, donde la
-- doble autenticación de RF-CA-016 son la placa y el rostro. Un externo no tiene rostro
-- registrado (§D20), así que ese segundo factor no existe para él.
--
-- La regla nueva del equipo: para un externo el segundo factor es **el memorando**. La placa
-- identifica al vehículo y el memorando dice que esa persona, con ese vehículo, está autorizada
-- a entrar. Y su corolario: **sin memorando no hay ingreso vehicular para un externo**; puede
-- entrar a pie con su autorización de visita, pero no conduciendo.
--
-- Por eso el vehículo queda registrado EN el memorando: es el documento que lo autoriza, y
-- cuando el memorando vence o se anula, el permiso del vehículo cae con él sin que nadie tenga
-- que acordarse de revocarlo aparte.

-- ---------------------------------------------------------------------------
-- 1. Qué autoriza el memorando
-- ---------------------------------------------------------------------------

alter table public.memorando
  add column if not exists permite_vehiculo boolean not null default false;

alter table public.memorando
  add column if not exists permite_acompanantes boolean not null default false;

comment on column public.memorando.permite_vehiculo is
  'El memorando autoriza a entrar en vehículo. Sin esto, el personal externo solo entra a pie.';
comment on column public.memorando.permite_acompanantes is
  'El memorando contempla acompañantes. Informativo para la garita: cada ocupante se valida por su propia vigencia (RF-CA-017).';

-- ---------------------------------------------------------------------------
-- 2. Los vehículos que ampara cada memorando
-- ---------------------------------------------------------------------------
-- Tabla de vínculo y no una columna en `memorando`: una empresa puede acudir con más de un
-- vehículo amparado por el mismo oficio. Y se referencia `vehiculo`, que es la maestra única
-- (CLAUDE.md): aquí no se duplica ni la placa ni las características.

create table if not exists public.memorando_vehiculo (
  id_memorando_vehiculo uuid primary key default gen_random_uuid(),
  id_memorando uuid not null references public.memorando(id_memorando),
  id_vehiculo uuid not null references public.vehiculo(id_vehiculo),
  observacion text,
  fecha_registro timestamptz not null default now(),
  id_usuario_registro uuid references public.usuario_sistema(id_usuario),
  constraint memorando_vehiculo_unico unique (id_memorando, id_vehiculo)
);

comment on table public.memorando_vehiculo is
  'Vehículos amparados por un memorando (GPE). El permiso del vehículo caduca con el memorando.';

alter table public.memorando_vehiculo enable row level security;

-- La garita necesita leerlo para validar el ingreso: el guardia tiene GPE_MEMORANDO_SELECT.
create policy memorando_vehiculo_select on public.memorando_vehiculo
  for select using (
    public.tiene_permiso('ADM_MODULO_ACCEDER')
    or public.tiene_permiso('GPE_MEMORANDO_SELECT')
    or public.tiene_permiso('CAC_EVENTO_SELECT')
    or public.tiene_permiso('CAC_VALIDACION_EJECUTAR')
  );

create policy memorando_vehiculo_insert_gpe on public.memorando_vehiculo
  for insert with check (public.tiene_permiso('GPE_MEMORANDO_INSERT'));

create policy memorando_vehiculo_update_gpe on public.memorando_vehiculo
  for update using (public.tiene_permiso('GPE_MEMORANDO_UPDATE'))
  with check (public.tiene_permiso('GPE_MEMORANDO_UPDATE'));

drop trigger if exists trg_bloquear_delete_memorando_vehiculo on public.memorando_vehiculo;
create trigger trg_bloquear_delete_memorando_vehiculo
  before delete on public.memorando_vehiculo
  for each row execute function public.bloquear_delete_fisico();

drop trigger if exists trg_bitacora_memorando_vehiculo on public.memorando_vehiculo;
create trigger trg_bitacora_memorando_vehiculo
  after insert or update on public.memorando_vehiculo
  for each row execute function public.registrar_bitacora('id_memorando_vehiculo', 'GPE');

create index if not exists memorando_vehiculo_por_vehiculo
  on public.memorando_vehiculo (id_vehiculo);

-- ---------------------------------------------------------------------------
-- 3. La pregunta que hace la garita
-- ---------------------------------------------------------------------------

create or replace function public.vehiculo_amparado_por_memorando(
  p_id_persona uuid, p_id_vehiculo uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- ¿Tiene esta persona un memorando que hoy autorice el ingreso Y que ampare este vehículo?
  --
  -- Las tres condiciones van juntas a propósito: un memorando vigente que no menciona el coche
  -- no autoriza a entrar con él, y un memorando que sí lo menciona pero venció, tampoco.
  select exists (
    select 1
      from public.persona_memorando pm
      join public.memorando m on m.id_memorando = pm.id_memorando
      join public.memorando_vehiculo mv on mv.id_memorando = m.id_memorando
     where pm.id_persona = p_id_persona
       and pm.estado_acceso = 'ACTIVO'
       and mv.id_vehiculo = p_id_vehiculo
       and m.estado_memorando <> 'ANULADO'
       and m.permite_vehiculo
       and public.hoy_ecuador() between m.fecha_inicio and m.fecha_fin
  );
$$;

comment on function public.vehiculo_amparado_por_memorando(uuid, uuid) is
  'Segundo factor del ingreso vehicular de un externo: memorando vigente que ampara ese vehículo.';

revoke all on function public.vehiculo_amparado_por_memorando(uuid, uuid) from public, anon;
grant execute on function public.vehiculo_amparado_por_memorando(uuid, uuid) to authenticated, service_role;

-- Lo que la garita muestra al reconocer una placa: de quién es el permiso y por qué.
create or replace function public.memorandos_vigentes_de_vehiculo(p_id_vehiculo uuid)
returns table (
  id_memorando uuid,
  numero_memorando varchar,
  empresa text,
  dependencia_autorizada varchar,
  fecha_inicio date,
  fecha_fin date,
  permite_acompanantes boolean,
  personas_autorizadas bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id_memorando,
         m.numero_memorando,
         e.nombre::text,
         m.dependencia_autorizada,
         m.fecha_inicio,
         m.fecha_fin,
         m.permite_acompanantes,
         (select count(*) from public.persona_memorando pm
           where pm.id_memorando = m.id_memorando and pm.estado_acceso = 'ACTIVO')
    from public.memorando_vehiculo mv
    join public.memorando m on m.id_memorando = mv.id_memorando
    left join public.empresa e on e.id_empresa = m.id_empresa
   where mv.id_vehiculo = p_id_vehiculo
     and m.estado_memorando <> 'ANULADO'
     and m.permite_vehiculo
     and public.hoy_ecuador() between m.fecha_inicio and m.fecha_fin;
$$;

comment on function public.memorandos_vigentes_de_vehiculo(uuid) is
  'Memorandos que hoy amparan a un vehículo, para que la garita vea quién entra y con qué respaldo.';

revoke all on function public.memorandos_vigentes_de_vehiculo(uuid) from public, anon;
grant execute on function public.memorandos_vigentes_de_vehiculo(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Alta atómica: memorando + vehículo + propietario + vínculo
-- ---------------------------------------------------------------------------
-- `vehiculo` tiene un CONSTRAINT TRIGGER diferido que exige propietario (RF-CA-018), así que
-- el vehículo y su persona tienen que nacer en la misma transacción. Se reutiliza
-- `crear_vehiculo_con_propietario`, que ya lo resuelve, en vez de repetir esa lógica.

create or replace function public.registrar_vehiculo_de_memorando(
  p_id_memorando uuid,
  p_id_persona uuid,
  p_tipo_vehiculo text,
  p_placa text default null,
  p_marca text default null,
  p_modelo text default null,
  p_color text default null,
  p_observacion text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_memorando record;
  v_persona record;
  v_vehiculo jsonb;
  v_id_vehiculo uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Se requiere un usuario autenticado.' using errcode = 'insufficient_privilege';
  end if;

  select id_memorando, numero_memorando, permite_vehiculo, estado_memorando, fecha_fin
    into v_memorando
    from public.memorando
   where id_memorando = p_id_memorando;

  if v_memorando.id_memorando is null then
    raise exception 'No se encontró el memorando o no tienes permiso para verlo.' using errcode = 'no_data_found';
  end if;
  if not v_memorando.permite_vehiculo then
    raise exception 'El memorando % no autoriza el ingreso en vehículo. Márcalo primero como "ingresa con vehículo".',
      v_memorando.numero_memorando using errcode = 'check_violation';
  end if;
  if v_memorando.estado_memorando = 'ANULADO' then
    raise exception 'El memorando % está anulado: no se le pueden añadir vehículos.',
      v_memorando.numero_memorando using errcode = 'check_violation';
  end if;

  select id_persona, tipo_persona, estado, nombres, apellidos into v_persona
    from public.persona
   where id_persona = p_id_persona;

  if v_persona.id_persona is null then
    raise exception 'No se encontró la persona indicada como responsable del vehículo.' using errcode = 'no_data_found';
  end if;
  -- Un memorando ampara a personal externo. Si el responsable fuera interno, su vehículo se
  -- gestiona por GPI y no necesita memorando para entrar.
  if v_persona.tipo_persona <> 'EXTERNA' then
    raise exception 'El responsable del vehículo debe ser una persona externa; % % es personal interno.',
      v_persona.nombres, v_persona.apellidos using errcode = 'check_violation';
  end if;

  -- Quien conduce tiene que estar amparado por el memorando: si no, la placa entraría con un
  -- conductor a quien el oficio no menciona.
  insert into public.persona_memorando (id_memorando, id_persona, estado_acceso)
  values (p_id_memorando, p_id_persona, 'ACTIVO')
  on conflict do nothing;

  v_vehiculo := public.crear_vehiculo_con_propietario(
    p_tipo_vehiculo := p_tipo_vehiculo,
    p_id_persona    := p_id_persona,
    p_placa         := p_placa,
    p_marca         := p_marca,
    p_modelo        := p_modelo,
    p_color         := p_color
  );
  v_id_vehiculo := (v_vehiculo ->> 'id_vehiculo')::uuid;

  insert into public.memorando_vehiculo (id_memorando, id_vehiculo, observacion, id_usuario_registro)
  values (p_id_memorando, v_id_vehiculo, p_observacion, v_uid);

  return jsonb_build_object(
    'id_vehiculo', v_id_vehiculo,
    'id_memorando', p_id_memorando,
    'numero_memorando', v_memorando.numero_memorando,
    'responsable', v_persona.nombres || ' ' || v_persona.apellidos
  );
end;
$$;

comment on function public.registrar_vehiculo_de_memorando(uuid, uuid, text, text, text, text, text, text) is
  'Registra en una transacción el vehículo de un memorando con su responsable externo (RF-CA-018).';

revoke all on function public.registrar_vehiculo_de_memorando(uuid, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.registrar_vehiculo_de_memorando(uuid, uuid, text, text, text, text, text, text) to authenticated, service_role;
