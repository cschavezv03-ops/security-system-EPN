-- GPE: la vigencia de una asociacion persona-vehiculo no puede contradecir al memorando.
--
-- Un externo entra al campus porque un memorando lo ampara, y entra CON un vehiculo porque ese
-- mismo memorando ampara la placa (`memorando_vehiculo`, permite_vehiculo). Sin embargo, al
-- vincular a la persona con el vehiculo desde la ficha, las fechas de la relacion se tecleaban
-- a mano y sin relacion alguna con el oficio: se podia dejar a un proveedor asociado al camion
-- hasta 2027 cuando su memorando terminaba pasado manana, o empezar la relacion antes de que el
-- memorando existiera. Dos fuentes de verdad para lo mismo.
--
-- A partir de aqui el memorando manda: sus fechas rellenan la relacion y ninguna asociacion
-- puede salirse de su vigencia. La interfaz muestra los campos ya rellenos y bloqueados; esta
-- migracion es la que lo garantiza para la API y para cualquier otra via.

-- ---------------------------------------------------------------------------
-- Memorandos que amparan a esta persona CON este vehiculo
-- ---------------------------------------------------------------------------
-- Las tres condiciones van juntas, como en `vehiculo_amparado_por_memorando`: el memorando
-- menciona el vehiculo, menciona a la persona y autoriza el ingreso en vehiculo. Se incluyen los
-- que aun no han empezado (una asociacion puede prepararse por adelantado) y se excluyen los
-- vencidos y los anulados, que ya no amparan nada.
create or replace function public.memorandos_de_persona_y_vehiculo(
  p_id_persona uuid,
  p_id_vehiculo uuid
)
returns table (
  id_memorando uuid,
  numero_memorando character varying,
  fecha_inicio date,
  fecha_fin date
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id_memorando, m.numero_memorando, m.fecha_inicio, m.fecha_fin
    from public.persona_memorando pm
    join public.memorando m on m.id_memorando = pm.id_memorando
    join public.memorando_vehiculo mv on mv.id_memorando = m.id_memorando
   where pm.id_persona = p_id_persona
     and pm.estado_acceso = 'ACTIVO'
     and mv.id_vehiculo = p_id_vehiculo
     and m.estado_memorando <> 'ANULADO'
     and m.permite_vehiculo
     and m.fecha_fin >= public.hoy_ecuador()
   -- El de vigencia mas larga primero: es el que la interfaz propone cuando hay varios.
   order by m.fecha_fin desc, m.fecha_inicio asc;
$$;

comment on function public.memorandos_de_persona_y_vehiculo(uuid, uuid) is
  'Memorandos en vigor (o futuros) que amparan a esa persona con ese vehiculo. Fuente de las fechas de la asociacion persona-vehiculo en GPE.';

revoke all on function public.memorandos_de_persona_y_vehiculo(uuid, uuid) from public;
grant execute on function public.memorandos_de_persona_y_vehiculo(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Las fechas de la relacion se alinean con el memorando
-- ---------------------------------------------------------------------------
create or replace function public.alinear_persona_vehiculo_con_memorando()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
  v_memo record;
  v_dia_inicio date;
  v_dia_fin date;
  v_cabe boolean;
begin
  if new.estado_relacion <> 'ACTIVA' then
    return new;
  end if;

  select p.tipo_persona into v_tipo
    from public.persona p
   where p.id_persona = new.id_persona;

  -- El personal interno no se rige por memorandos: sus fechas son las que decida GPI.
  if v_tipo is distinct from 'EXTERNA' then
    return new;
  end if;

  select * into v_memo
    from public.memorandos_de_persona_y_vehiculo(new.id_persona, new.id_vehiculo)
   limit 1;

  -- Vehiculo de un externo sin memorando que lo ampare (p. ej. una visita de un solo dia):
  -- no hay nada con lo que sincronizar y las fechas se respetan tal cual llegan.
  if v_memo.id_memorando is null then
    return new;
  end if;

  -- Los dias se guardan a medianoche UTC (§D81): asi se recupera el dia que se escribio, sin
  -- que la zona horaria lo corra al anterior.
  if new.fecha_inicio is null then
    new.fecha_inicio := (v_memo.fecha_inicio::timestamp at time zone 'UTC');
  end if;
  if new.fecha_fin is null then
    new.fecha_fin := (v_memo.fecha_fin::timestamp at time zone 'UTC');
  end if;

  v_dia_inicio := (new.fecha_inicio at time zone 'UTC')::date;
  v_dia_fin := (new.fecha_fin at time zone 'UTC')::date;

  -- Puede haber mas de un memorando amparando el mismo par persona-vehiculo: basta con que la
  -- vigencia quepa dentro de uno de ellos.
  select exists (
    select 1
      from public.memorandos_de_persona_y_vehiculo(new.id_persona, new.id_vehiculo) m
     where v_dia_inicio >= m.fecha_inicio
       and v_dia_fin <= m.fecha_fin
  ) into v_cabe;

  if not v_cabe then
    raise exception 'La asociacion (% a %) se sale de la vigencia del memorando % (% a %).',
      to_char(v_dia_inicio, 'DD/MM/YYYY'), to_char(v_dia_fin, 'DD/MM/YYYY'),
      v_memo.numero_memorando,
      to_char(v_memo.fecha_inicio, 'DD/MM/YYYY'), to_char(v_memo.fecha_fin, 'DD/MM/YYYY')
      using errcode = 'check_violation',
            hint = 'El permiso del vehiculo caduca con el memorando: amplia primero la vigencia del memorando.';
  end if;

  return new;
end;
$$;

comment on function public.alinear_persona_vehiculo_con_memorando() is
  'GPE: rellena y acota las fechas de una asociacion persona-vehiculo con la vigencia del memorando que la ampara.';

revoke all on function public.alinear_persona_vehiculo_con_memorando() from public;

-- El nombre importa: los triggers BEFORE corren en orden alfabetico y este tiene que rellenar
-- las fechas antes de que `trg_exigir_fecha_fin_persona_vehiculo` las exija.
drop trigger if exists trg_alinear_persona_vehiculo_con_memorando on public.persona_vehiculo;
create trigger trg_alinear_persona_vehiculo_con_memorando
  before insert or update of id_persona, id_vehiculo, fecha_inicio, fecha_fin, estado_relacion
  on public.persona_vehiculo
  for each row
  execute function public.alinear_persona_vehiculo_con_memorando();

-- ---------------------------------------------------------------------------
-- Una vigencia de un solo dia es legitima
-- ---------------------------------------------------------------------------
-- La RPC de alta exigia que la fecha de fin fuese ESTRICTAMENTE posterior a la de inicio. Con las
-- fechas heredadas del memorando eso deja fuera un caso normal en GPE: el oficio que autoriza una
-- entrega para un unico dia (fecha_inicio = fecha_fin). El CHECK de la tabla siempre admitio la
-- igualdad; era la RPC la que iba mas lejos que la regla. Se alinea con la tabla.
create or replace function public.crear_vehiculo_con_propietario(
  p_tipo_vehiculo text,
  p_id_persona uuid,
  p_fecha_fin timestamptz,
  p_placa text default null,
  p_marca text default null,
  p_modelo text default null,
  p_color text default null,
  p_tipo_relacion text default 'PROPIETARIO',
  p_fecha_inicio timestamptz default now(),
  p_motivo_sin_placa text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id_vehiculo uuid;
  v_id_relacion uuid;
  v_uid uuid := auth.uid();
  v_persona record;
begin
  if v_uid is null then
    raise exception 'Se requiere un usuario autenticado.' using errcode = 'insufficient_privilege';
  end if;

  if p_id_persona is null then
    raise exception 'Debe indicar la persona propietaria (busquela por cedula).'
      using errcode = 'check_violation';
  end if;

  if p_fecha_fin is null then
    raise exception 'La fecha de fin de la relacion es obligatoria.'
      using errcode = 'not_null_violation';
  end if;

  if p_fecha_fin < coalesce(p_fecha_inicio, now()) then
    raise exception 'La fecha de fin no puede ser anterior a la fecha de inicio.'
      using errcode = 'check_violation';
  end if;

  select id_persona, estado, nombres, apellidos
    into v_persona
    from public.persona
   where id_persona = p_id_persona;

  if v_persona.id_persona is null then
    raise exception 'No se encontro la persona o no tienes permiso para verla.'
      using errcode = 'no_data_found';
  end if;

  if v_persona.estado <> 'ACTIVO' then
    raise exception 'La persona esta % : no se le puede asociar un vehiculo.', v_persona.estado
      using errcode = 'check_violation';
  end if;

  insert into public.vehiculo
    (placa, tipo_vehiculo, marca, modelo, color, motivo_sin_placa, id_usuario_registro)
  values
    (p_placa, p_tipo_vehiculo, p_marca, p_modelo, p_color, p_motivo_sin_placa, v_uid)
  returning id_vehiculo into v_id_vehiculo;

  insert into public.persona_vehiculo
    (id_persona, id_vehiculo, tipo_relacion, fecha_inicio, fecha_fin,
     estado_relacion, id_usuario_registro)
  values
    (p_id_persona, v_id_vehiculo, coalesce(p_tipo_relacion, 'PROPIETARIO'),
     coalesce(p_fecha_inicio, now()), p_fecha_fin, 'ACTIVA', v_uid)
  returning id_persona_vehiculo into v_id_relacion;

  return jsonb_build_object(
    'id_vehiculo', v_id_vehiculo,
    'id_persona_vehiculo', v_id_relacion,
    'persona', v_persona.nombres || ' ' || v_persona.apellidos
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- El vehiculo que nace dentro de un memorando hereda sus fechas
-- ---------------------------------------------------------------------------
-- `registrar_vehiculo_de_memorando` creaba la relacion con `now()` y sin fecha de fin, asi que el
-- caso mas comun de GPE —dar de alta el vehiculo desde el propio memorando— era justamente el que
-- nacia desincronizado. Ademas, la RPC de alta pasa a exigir fecha de fin (migracion
-- `gpi_ultimos_cambios`), de modo que esta llamada tenia que actualizarse igualmente.
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

  select id_memorando, numero_memorando, permite_vehiculo, estado_memorando, fecha_inicio, fecha_fin
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

  -- La relación con el vehículo dura exactamente lo que dura el memorando.
  v_vehiculo := public.crear_vehiculo_con_propietario(
    p_tipo_vehiculo := p_tipo_vehiculo,
    p_id_persona    := p_id_persona,
    p_fecha_inicio  := (v_memorando.fecha_inicio::timestamp at time zone 'UTC'),
    p_fecha_fin     := (v_memorando.fecha_fin::timestamp at time zone 'UTC'),
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
  'GPE: registra el vehículo de un memorando y asocia a su responsable con la vigencia del propio memorando.';

revoke execute on function public.registrar_vehiculo_de_memorando(uuid, uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.registrar_vehiculo_de_memorando(uuid, uuid, text, text, text, text, text, text)
  to authenticated;
