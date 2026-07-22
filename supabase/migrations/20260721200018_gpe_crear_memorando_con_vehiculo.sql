-- Alta del memorando y su vehículo en una sola transacción.
--
-- El equipo pidió que las preguntas "¿entra con vehículo?" y "¿con acompañantes?" formen parte
-- de la CREACIÓN del memorando. Hacerlo en dos llamadas desde el navegador —primero el
-- memorando, luego el vehículo— deja un hueco feo: si la segunda falla (placa repetida, la
-- persona ya tiene dos vehículos, RLS), queda un memorando creado a medias y el usuario que
-- reintenta se choca con "ese número de memorando ya existe", sin entender por qué.
--
-- Con una sola transacción, o queda todo o no queda nada, y el número sigue libre para
-- reintentar.

create or replace function public.crear_memorando_con_vehiculo(
  p_numero_memorando text,
  p_id_empresa uuid,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_dependencia_autorizada text default null,
  p_permite_vehiculo boolean default false,
  p_permite_acompanantes boolean default false,
  -- Datos del vehículo. Solo se miran si p_permite_vehiculo es cierto.
  p_id_persona_responsable uuid default null,
  p_tipo_vehiculo text default null,
  p_placa text default null,
  p_marca text default null,
  p_modelo text default null,
  p_color text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id_memorando uuid;
  v_uid uuid := auth.uid();
  v_vehiculo jsonb := null;
begin
  if v_uid is null then
    raise exception 'Se requiere un usuario autenticado.' using errcode = 'insufficient_privilege';
  end if;

  if p_permite_vehiculo and p_id_persona_responsable is null then
    raise exception 'Si el memorando autoriza el ingreso en vehículo, indica quién lo conduce.'
      using errcode = 'check_violation';
  end if;

  insert into public.memorando (
    numero_memorando, id_empresa, fecha_inicio, fecha_fin, dependencia_autorizada,
    permite_vehiculo, permite_acompanantes, id_usuario_registro
  )
  values (
    p_numero_memorando, p_id_empresa, p_fecha_inicio, p_fecha_fin, p_dependencia_autorizada,
    coalesce(p_permite_vehiculo, false), coalesce(p_permite_acompanantes, false), v_uid
  )
  returning id_memorando into v_id_memorando;

  if p_permite_vehiculo then
    v_vehiculo := public.registrar_vehiculo_de_memorando(
      p_id_memorando  := v_id_memorando,
      p_id_persona    := p_id_persona_responsable,
      p_tipo_vehiculo := p_tipo_vehiculo,
      p_placa         := p_placa,
      p_marca         := p_marca,
      p_modelo        := p_modelo,
      p_color         := p_color
    );
  end if;

  return jsonb_build_object(
    'id_memorando', v_id_memorando,
    'numero_memorando', p_numero_memorando,
    'vehiculo', v_vehiculo
  );
end;
$$;

comment on function public.crear_memorando_con_vehiculo(text, uuid, date, date, text, boolean, boolean, uuid, text, text, text, text, text) is
  'Crea el memorando y, si autoriza vehículo, también el vehículo con su responsable, en una sola transacción.';

revoke all on function public.crear_memorando_con_vehiculo(text, uuid, date, date, text, boolean, boolean, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.crear_memorando_con_vehiculo(text, uuid, date, date, text, boolean, boolean, uuid, text, text, text, text, text) to authenticated, service_role;
