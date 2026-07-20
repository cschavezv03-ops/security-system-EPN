-- ADM · Una cuenta del sistema pertenece al PERSONAL, nunca a un estudiante.
--
-- Salió de la revisión: `frank.jumbo` tenía categoría ESTUDIANTE y rol GUARDIA_SEGURIDAD. Un
-- estudiante haciendo de guardia de seguridad no es un caso raro: es un dato incoherente.
--
-- La auditoría de las 9 cuentas confirma que era el único fuera de norma — las otras ocho son
-- ADMINISTRATIVO o TRABAJADOR —, así que la regla no se inventa aquí: se estaba cumpliendo en
-- todas partes menos en una fila, y lo que faltaba era escribirla.
--
-- Categorías que pueden operar el sistema: DOCENTE, ADMINISTRATIVO, TRABAJADOR. Quedan fuera:
--   · ESTUDIANTE        — es sujeto del control de accesos, no operador de él.
--   · EMPRESA_SERVICIO  — personal contratado; entra al campus, no administra el sistema.
--   · Todas las EXTERNAS — ya lo impedía el flujo, pero no había nada que lo garantizara.
--
-- Se comprueba en los DOS sentidos, porque la incoherencia puede llegar por cualquiera de ellos:
-- creando la cuenta sobre una persona que no debe tenerla, o cambiándole después la categoría a
-- alguien que ya la tiene.
--
-- OJO: `validar_categoria_con_cuenta` se corrige en 20260720163339 — la versión de aquí lee la
-- categoría de la tabla, que en un BEFORE UPDATE todavía tiene el valor anterior.

-- ---------------------------------------------------------------------------
-- 1. Reparar los datos ANTES de imponer la regla.
-- ---------------------------------------------------------------------------
-- frank.jumbo opera la garita: su categoría correcta es TRABAJADOR. Al dejar de ser estudiante
-- pierde el código único, que es exclusivo de estudiantes (regla de GPI).
update public.persona p
   set id_categoria = (select id_categoria from public.categoria_persona where codigo_categoria = 'TRABAJADOR'),
       codigo_unico = null
  from public.usuario_sistema u
 where u.id_persona = p.id_persona
   and u.nombre_usuario = 'frank.jumbo';

-- §V18/§V19: Cecilia Jaramillo es DOCENTE y arrastraba dos campos de estudiante desde la carga
-- inicial. Tiene `cargo = 'Titular'` (docente) y a la vez `carrera` (estudiante), y su código
-- empieza por 2025 mientras los estudiantes reales tienen 2023xxxxx: es un error de siembra, no
-- una persona con doble matrícula. Se vacían; quedan registrados en la Auditoría por si acaso.
update public.persona
   set codigo_unico = null
 where cedula = '1750000232';

update public.persona_interna_detalle
   set carrera = null
 where id_persona = (select id_persona from public.persona where cedula = '1750000232');

-- ---------------------------------------------------------------------------
-- 2. La regla.
-- ---------------------------------------------------------------------------
create or replace function public.categoria_puede_operar(p_id_persona uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select c.ambito = 'INTERNA'
     and c.codigo_categoria = any (array['DOCENTE', 'ADMINISTRATIVO', 'TRABAJADOR'])
    from public.persona p
    join public.categoria_persona c on c.id_categoria = p.id_categoria
   where p.id_persona = p_id_persona;
$$;

comment on function public.categoria_puede_operar(uuid) is
  'Si la categoría de esa persona admite tener cuenta en el sistema. Los estudiantes y el personal de empresas de servicio no operan el sistema.';

revoke all on function public.categoria_puede_operar(uuid) from public, anon;
grant execute on function public.categoria_puede_operar(uuid) to authenticated;

-- Sentido A: al crear o reasignar una cuenta.
create or replace function public.validar_operador_de_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria text;
begin
  if public.categoria_puede_operar(new.id_persona) then
    return new;
  end if;

  select c.codigo_categoria into v_categoria
    from public.persona p
    join public.categoria_persona c on c.id_categoria = p.id_categoria
   where p.id_persona = new.id_persona;

  raise exception 'No se puede crear una cuenta para una persona de categoría %: el sistema lo operan docentes, administrativos y trabajadores.', lower(replace(coalesce(v_categoria, 'desconocida'), '_', ' '))
    using errcode = 'check_violation',
          hint = 'Si esta persona debe operar el sistema, corrige antes su categoría en Personal interno.';
end;
$$;

drop trigger if exists trg_validar_operador_de_cuenta on public.usuario_sistema;
create trigger trg_validar_operador_de_cuenta
  before insert or update of id_persona on public.usuario_sistema
  for each row execute function public.validar_operador_de_cuenta();

-- Sentido B: al cambiar la categoría de alguien que YA tiene cuenta.
-- (versión corregida en 20260720163339)
create or replace function public.validar_categoria_con_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario text;
  v_categoria text;
begin
  if new.id_categoria is not distinct from old.id_categoria then
    return new;
  end if;

  select nombre_usuario into v_usuario
    from public.usuario_sistema where id_persona = new.id_persona;

  if v_usuario is null or public.categoria_puede_operar(new.id_persona) then
    return new;
  end if;

  select codigo_categoria into v_categoria
    from public.categoria_persona where id_categoria = new.id_categoria;

  raise exception 'No se puede pasar a % a la categoría %: tiene la cuenta "%" y el sistema lo operan docentes, administrativos y trabajadores.',
    new.nombres || ' ' || new.apellidos, lower(replace(coalesce(v_categoria, 'desconocida'), '_', ' ')), v_usuario
    using errcode = 'check_violation',
          hint = 'Da de baja la cuenta antes de cambiarle la categoría.';
end;
$$;

drop trigger if exists trg_validar_categoria_con_cuenta on public.persona;
create trigger trg_validar_categoria_con_cuenta
  before update of id_categoria on public.persona
  for each row execute function public.validar_categoria_con_cuenta();
