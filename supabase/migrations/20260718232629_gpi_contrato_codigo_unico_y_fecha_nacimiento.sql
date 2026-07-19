-- Requerimientos GPI. Tres reglas que el documento pide y que la base no garantizaba:
--
--  §"Verificar que la fecha de nacimiento no sea mayor a la fecha actual": la función
--    `es_fecha_nacimiento_valida` existía desde la ronda de validaciones, pero NUNCA se
--    aplicó como CHECK sobre `persona`. Solo el formulario la comprobaba, así que cualquier
--    escritura por la API REST podía registrar a alguien que nace en 2030.
--
--  §"Ahora el campo de Código Único solo es utilizado por los estudiantes."
--
--  §"debemos agregar un campo el cual es contrato ... Fijo o Temporal": `contrato` ya
--    existía como texto libre, y lo demuestra el dato sembrado: un docente con contrato
--    "Si". Pasa a ser catálogo.

-- ---------------------------------------------------------------------------
-- 1. Fecha de nacimiento no futura (GPI)
-- ---------------------------------------------------------------------------

alter table public.persona
  add constraint persona_fecha_nacimiento_valida
  check (public.es_fecha_nacimiento_valida(fecha_nacimiento));

-- ---------------------------------------------------------------------------
-- 2. Contrato como catálogo FIJO / TEMPORAL
-- ---------------------------------------------------------------------------

-- "Si" no es un tipo de contrato: era texto libre y alguien respondió a la etiqueta como si
-- fuera una casilla de sí/no. Se descarta (no sabemos qué quiso decir); "Temporal" sí tiene
-- lectura directa y se normaliza a la convención de catálogos (MAYÚSCULAS sin tildes).
update public.persona_interna_detalle
   set contrato = case upper(btrim(contrato))
                    when 'TEMPORAL' then 'TEMPORAL'
                    when 'FIJO' then 'FIJO'
                    else null
                  end
 where contrato is not null;

alter table public.persona_interna_detalle
  add constraint persona_interna_detalle_contrato_check
  check (contrato is null or contrato in ('FIJO', 'TEMPORAL'));

-- ---------------------------------------------------------------------------
-- 3. El código único es solo del estudiante
-- ---------------------------------------------------------------------------
-- No cabe en un CHECK: la categoría vive en otra tabla. Se valida con trigger, y solo cuando
-- el valor CAMBIA — hay un docente sembrado que ya tiene código único (§V18), y bloquear
-- cualquier edición de esa ficha por un dato heredado sería peor que el problema.

create or replace function public.validar_codigo_unico_estudiante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categoria text;
begin
  if new.codigo_unico is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.codigo_unico is not distinct from old.codigo_unico then
    return new;
  end if;

  select codigo_categoria into v_categoria
    from public.categoria_persona
   where id_categoria = new.id_categoria;

  if v_categoria <> 'ESTUDIANTE' then
    raise exception 'El código único es exclusivo de los estudiantes; esta persona está registrada como %.',
      lower(replace(v_categoria, '_', ' '))
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validar_codigo_unico_estudiante() is
  'GPI: el código único solo lo usan los estudiantes. Valida en el alta y cuando el valor cambia.';

drop trigger if exists trg_validar_codigo_unico_estudiante on public.persona;
create trigger trg_validar_codigo_unico_estudiante
  before insert or update of codigo_unico, id_categoria on public.persona
  for each row execute function public.validar_codigo_unico_estudiante();

-- Dos estudiantes no pueden compartir código único: identifica la matrícula.
create unique index if not exists persona_codigo_unico_unico
  on public.persona (codigo_unico)
  where codigo_unico is not null;
