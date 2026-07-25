-- Hardening: fijar search_path en la función-trigger validar_coordenadas_zona
-- (advisor 0011_function_search_path_mutable), igual que el resto de funciones-trigger del
-- proyecto (§V7). El cuerpo solo usa new/old, así que un search_path vacío es seguro.
create or replace function public.validar_coordenadas_zona()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.pos_x is not distinct from old.pos_x
     and new.pos_y is not distinct from old.pos_y then
    return new;
  end if;

  if (new.pos_x is null) <> (new.pos_y is null) then
    raise exception 'Para ubicar una zona en el mapa hacen falta pos_x y pos_y juntas (o dejar ambas vacías).'
      using errcode = '23514';
  end if;

  if new.pos_x is not null
     and (new.pos_x < 0 or new.pos_x > 1 or new.pos_y < 0 or new.pos_y > 1) then
    raise exception 'Las coordenadas del mapa son fracciones entre 0 y 1 (posición relativa a la imagen del campus).'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.validar_coordenadas_zona() from public, anon, authenticated;
