-- Correcciones de la revisión funcional de GPI (22/07/2026).
--
-- 1. El código único empieza por el año de matrícula: 1970..año actual. El resto sigue sin
--    una longitud institucional fija, pero solo admite dígitos.
-- 2. El personal ADMINISTRATIVO pertenece únicamente a la unidad EPN, no al CEC.
--
-- La interfaz adelanta ambos criterios, pero los triggers son la barrera para REST/RPC.

create or replace function public.validar_codigo_unico_estudiante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
  v_anio integer;
begin
  if new.codigo_unico is null then
    return new;
  end if;

  select codigo_categoria into v_categoria
    from public.categoria_persona
   where id_categoria = new.id_categoria;

  if v_categoria <> 'ESTUDIANTE' then
    raise exception 'El código único es exclusivo de los estudiantes; esta persona está registrada como %.',
      lower(replace(coalesce(v_categoria, 'desconocida'), '_', ' '))
      using errcode = '23514';
  end if;

  -- No se revalida un código histórico que no cambió. Sí se comprueba la categoría de arriba:
  -- cambiar a no estudiante nunca puede dejar escondido un código único.
  if tg_op = 'UPDATE' and new.codigo_unico is not distinct from old.codigo_unico then
    return new;
  end if;

  if new.codigo_unico !~ '^[0-9]{5,}$' then
    raise exception 'El código único debe contener solo números: cuatro del año de matrícula y al menos uno adicional.'
      using errcode = '23514';
  end if;

  v_anio := left(new.codigo_unico, 4)::integer;
  if v_anio < 1970 or v_anio > extract(year from current_date)::integer then
    raise exception 'Los primeros cuatro números del código único deben ser un año de matrícula entre 1970 y %.',
      extract(year from current_date)::integer
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validar_codigo_unico_estudiante() is
  'GPI: código único exclusivo del estudiante, numérico y con año de matrícula entre 1970 y el año actual.';

create or replace function public.validar_campos_detalle_persona_interna()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
begin
  select c.codigo_categoria
    into v_categoria
    from public.persona p
    join public.categoria_persona c on c.id_categoria = p.id_categoria
   where p.id_persona = new.id_persona;

  if v_categoria is null then
    raise exception 'No se encontró la categoría de la persona interna.' using errcode = '23514';
  end if;

  if v_categoria = 'ADMINISTRATIVO'
     and new.unidad is distinct from 'EPN'
     and (tg_op = 'INSERT' or new.unidad is distinct from old.unidad) then
    raise exception 'La unidad del personal administrativo debe ser EPN.' using errcode = '23514';
  end if;

  if v_categoria = 'DOCENTE'
     and new.cargo is not null
     and (tg_op = 'INSERT' or new.cargo is distinct from old.cargo) then
    raise exception 'El campo Cargo no aplica para docentes.' using errcode = '23514';
  end if;

  if v_categoria in ('DOCENTE', 'ADMINISTRATIVO', 'TRABAJADOR', 'EMPRESA_SERVICIO')
     and new.nombramiento is not null
     and (tg_op = 'INSERT' or new.nombramiento is distinct from old.nombramiento) then
    raise exception 'El campo Nombramiento no aplica para la categoría seleccionada.' using errcode = '23514';
  end if;

  if v_categoria = 'ESTUDIANTE'
     and new.unidad = 'CEC'
     and new.carrera is not null
     and (tg_op = 'INSERT' or new.carrera is distinct from old.carrera or new.unidad is distinct from old.unidad) then
    raise exception 'Un estudiante del CEC registra Curso, no Carrera.' using errcode = '23514';
  end if;

  if v_categoria = 'ESTUDIANTE'
     and new.unidad = 'EPN'
     and new.curso is not null
     and (tg_op = 'INSERT' or new.curso is distinct from old.curso or new.unidad is distinct from old.unidad) then
    raise exception 'Un estudiante de la EPN registra Carrera, no Curso.' using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validar_campos_detalle_persona_interna() is
  'GPI: administrativos solo EPN; valida Cargo/Nombramiento por categoría y Carrera/Curso según unidad.';

revoke execute on function public.validar_codigo_unico_estudiante() from public, anon, authenticated;
revoke execute on function public.validar_campos_detalle_persona_interna() from public, anon, authenticated;
