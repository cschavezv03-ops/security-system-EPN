-- Mapa interactivo (CAC) — parte 1 de N: georreferencia de zonas.
--
-- Objetivo: poder pintar cada zona sobre la ilustración oficial del campus EPN. En vez de
-- guardar latitud/longitud (que no se parecería al plano dibujado y ataría el sistema a una
-- API externa tipo Google Maps), se guardan DOS FRACCIONES relativas a la imagen del mapa:
--   pos_x = distancia horizontal desde el borde izquierdo, 0 (izquierda) .. 1 (derecha)
--   pos_y = distancia vertical  desde el borde superior,  0 (arriba)    .. 1 (abajo)
-- Así el marcador se posiciona con `left: pos_x*100%`, `top: pos_y*100%` sobre la imagen,
-- independientemente de su tamaño en pantalla. Si en el futuro se quiere navegación geográfica
-- real (calles, satélite), se añaden lat/lng SIN tocar estas columnas ni el modelo.
--
-- Decisión de alcance (POC): las coordenadas son OPCIONALES por ahora. Una zona sin coordenadas
-- simplemente no se dibuja (aparece en la bandeja "zonas sin ubicar" del mapa). Hacerlas
-- obligatorias para EDIFICIO/PARQUEADERO se difiere hasta que el formulario de PCO tenga un
-- selector de posición sobre el mapa; forzarlas ahora rompería el alta de zonas actual. Ver
-- docs/08_MAPA_INTERACTIVO.md y docs/99_DUDAS_PARA_EL_EQUIPO.md.

alter table public.zona
  add column if not exists pos_x numeric(6,5),
  add column if not exists pos_y numeric(6,5);

comment on column public.zona.pos_x is
  'Posición horizontal en el mapa como fracción 0..1 relativa a la imagen (no es longitud geográfica). NULL = zona sin ubicar.';
comment on column public.zona.pos_y is
  'Posición vertical en el mapa como fracción 0..1 relativa a la imagen (no es latitud geográfica). NULL = zona sin ubicar.';

-- CHECK duro de rango (defensa de datos). El trigger de abajo da un mensaje legible al formulario.
alter table public.zona
  drop constraint if exists zona_pos_x_rango;
alter table public.zona
  add constraint zona_pos_x_rango check (pos_x is null or (pos_x >= 0 and pos_x <= 1));
alter table public.zona
  drop constraint if exists zona_pos_y_rango;
alter table public.zona
  add constraint zona_pos_y_rango check (pos_y is null or (pos_y >= 0 and pos_y <= 1));

-- Trigger de coherencia física de las coordenadas. Mismo patrón que validar_numero_edificio /
-- validar_jerarquia_zona: no revalida ediciones que no tocan las coordenadas, para no bloquear
-- filas anteriores a esta regla.
create or replace function public.validar_coordenadas_zona()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.pos_x is not distinct from old.pos_x
     and new.pos_y is not distinct from old.pos_y then
    return new;
  end if;

  -- Ambas o ninguna: una zona a medio ubicar (solo X o solo Y) no se puede pintar.
  if (new.pos_x is null) <> (new.pos_y is null) then
    raise exception 'Para ubicar una zona en el mapa hacen falta pos_x y pos_y juntas (o dejar ambas vacías).'
      using errcode = '23514';
  end if;

  -- Fracciones relativas a la imagen: 0..1. (El CHECK ya lo garantiza; aquí el mensaje es humano.)
  if new.pos_x is not null
     and (new.pos_x < 0 or new.pos_x > 1 or new.pos_y < 0 or new.pos_y > 1) then
    raise exception 'Las coordenadas del mapa son fracciones entre 0 y 1 (posición relativa a la imagen del campus).'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.validar_coordenadas_zona() is
  'Coherencia de la georreferencia de una zona: pos_x/pos_y van juntas y en rango 0..1. No revalida ediciones que no tocan las coordenadas.';

drop trigger if exists trg_validar_coordenadas_zona on public.zona;
create trigger trg_validar_coordenadas_zona
  before insert or update on public.zona
  for each row execute function public.validar_coordenadas_zona();

-- Endurecimiento igual que el resto de funciones-trigger del proyecto: nadie la ejecuta a mano.
revoke execute on function public.validar_coordenadas_zona() from public, anon, authenticated;
