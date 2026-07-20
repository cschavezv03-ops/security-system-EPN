-- ADM · Corrige `validar_categoria_con_cuenta`: miraba el dato viejo.
--
-- La versión de 20260720163259 preguntaba por la categoría llamando a
-- `categoria_puede_operar(new.id_persona)`, y esa función LEE la categoría de la tabla. En un
-- trigger BEFORE UPDATE la fila todavía tiene el valor ANTERIOR, así que la comprobación
-- respondía sobre la categoría que se estaba abandonando y no sobre la nueva: pasar a un
-- administrativo con cuenta a ESTUDIANTE se permitía sin más.
--
-- Lo detectó la prueba del sentido B, que es justo para lo que estaba escrita. La versión buena
-- evalúa `new.id_categoria` directamente, sin releer la tabla.

create or replace function public.validar_categoria_con_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario   text;
  v_categoria text;
  v_ambito    text;
begin
  if new.id_categoria is not distinct from old.id_categoria then
    return new;
  end if;

  select nombre_usuario into v_usuario
    from public.usuario_sistema where id_persona = new.id_persona;

  -- Sin cuenta, la categoría es asunto de GPI y aquí no se opina.
  if v_usuario is null then
    return new;
  end if;

  -- La categoría que se está PONIENDO, no la que ya estaba.
  select codigo_categoria, ambito into v_categoria, v_ambito
    from public.categoria_persona where id_categoria = new.id_categoria;

  if v_ambito = 'INTERNA'
     and v_categoria = any (array['DOCENTE', 'ADMINISTRATIVO', 'TRABAJADOR']) then
    return new;
  end if;

  raise exception 'No se puede pasar a % a la categoría %: tiene la cuenta "%" y el sistema lo operan docentes, administrativos y trabajadores.',
    new.nombres || ' ' || new.apellidos, lower(replace(coalesce(v_categoria, 'desconocida'), '_', ' ')), v_usuario
    using errcode = 'check_violation',
          hint = 'Da de baja la cuenta antes de cambiarle la categoría.';
end;
$$;
