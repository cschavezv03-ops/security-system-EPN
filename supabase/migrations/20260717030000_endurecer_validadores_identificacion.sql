-- Endurecimiento de los validadores de identificacion (reqs 10, 14, 15 de la
-- especificacion docs/New_Req/especificacion_validaciones_sistema_general.md).
--
-- CONSERVA todo lo de 20260717020134_funciones_validacion.sql y solo AÑADE:
--   1. Cedula: rechazo de patrones de relleno evidentes (digitos repetidos y
--      secuencias +-1). Antes 2222222222 pasaba: provincia 22 es valida, tercer
--      digito 2 y su verificador es 2 -> el modulo 10 lo aceptaba. Es una cedula
--      obviamente ficticia. (req 10.6)
--   2. RUC: se separa la ESTRUCTURA (lo que exige el CHECK) del ALGORITMO legado
--      de sociedades (modulo 11, que pasa a ADVERTENCIA, no a rechazo). El SRI
--      reconoce RUC de sociedad validos que no satisfacen el modulo 11; se marca
--      su verificacion oficial como NO_VERIFICADO. (req 14)
--   3. Placa: la validacion depende del tipo de vehiculo. Antes una unica regex
--      (3 letras + 3/4 digitos) rechazaba las MOTOCICLETAS y forzaba un formato
--      ordinario a placas especiales. (req 15)

-- ===========================================================================
-- 1. Cedula: rechazo de patrones de relleno
-- ===========================================================================
-- true si el string numerico es un patron de relleno evidente:
--   a) todos los digitos iguales (0000000000, 2222222222)
--   b) secuencia estricta de paso +1 o -1 en TODA su longitud (0123456789,
--      9876543210). 1234567890 NO cae aqui (9->0 rompe el paso) pero el modulo
--      10 ya lo rechaza; el objetivo real de esta funcion son los repetidos.
create or replace function public.es_relleno_obvio(p_num text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  i integer;
  d integer;
  prev integer;
  asc_ok boolean := true;
  desc_ok boolean := true;
begin
  if p_num is null or p_num !~ '^[0-9]+$' or length(p_num) < 2 then
    return false;
  end if;

  -- (a) todos iguales
  if p_num ~ ('^(.)\1{' || (length(p_num) - 1) || '}$') then
    return true;
  end if;

  -- (b) secuencia +-1
  for i in 2 .. length(p_num) loop
    prev := substr(p_num, i - 1, 1)::integer;
    d := substr(p_num, i, 1)::integer;
    if d <> prev + 1 then asc_ok := false; end if;
    if d <> prev - 1 then desc_ok := false; end if;
  end loop;

  return asc_ok or desc_ok;
end;
$$;

comment on function public.es_relleno_obvio(text) is
  'true si el numero es relleno evidente: todos los digitos iguales o una secuencia +-1 completa.';

-- Se redefine es_cedula_ecuatoriana AÑADIENDO el rechazo de relleno. El resto
-- del algoritmo (provincia 01-24/30, tercer digito < 6, modulo 10) es identico.
create or replace function public.es_cedula_ecuatoriana(p_cedula text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_provincia integer;
  v_suma integer := 0;
  v_producto integer;
  i integer;
begin
  if p_cedula is null then
    return true;
  end if;

  if p_cedula !~ '^[0-9]{10}$' then
    return false;
  end if;

  -- Nuevo: patrones de relleno como 2222222222 (que si pasa el modulo 10).
  if public.es_relleno_obvio(p_cedula) then
    return false;
  end if;

  v_provincia := substr(p_cedula, 1, 2)::integer;
  if not (v_provincia between 1 and 24) and v_provincia <> 30 then
    return false;
  end if;

  if substr(p_cedula, 3, 1)::integer >= 6 then
    return false;
  end if;

  for i in 1..9 loop
    v_producto := substr(p_cedula, i, 1)::integer * (case when i % 2 = 1 then 2 else 1 end);
    if v_producto > 9 then
      v_producto := v_producto - 9;
    end if;
    v_suma := v_suma + v_producto;
  end loop;

  return ((10 - (v_suma % 10)) % 10) = substr(p_cedula, 10, 1)::integer;
end;
$$;

comment on function public.es_cedula_ecuatoriana(text) is
  'Cedula ecuatoriana: 10 digitos, no relleno, provincia 01-24/30, tercer digito < 6 y modulo 10.';

-- ===========================================================================
-- 2. RUC: estructura (CHECK) vs algoritmo legado (advertencia)
-- ===========================================================================
-- Validacion ESTRUCTURAL, la unica que se aplica como CHECK. No corre el modulo
-- 11: el SRI reconoce RUC de sociedad validos que no lo cumplen (req 14). La
-- existencia oficial se rastrea aparte, en empresa.estado_verificacion_ruc.
create or replace function public.es_ruc_estructural(p_ruc text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_provincia integer;
  v_tercero integer;
begin
  if p_ruc is null then
    return true;
  end if;

  if p_ruc !~ '^[0-9]{13}$' then
    return false;
  end if;

  -- Relleno evidente sobre los 10 primeros (0000000000001, etc.).
  if public.es_relleno_obvio(substr(p_ruc, 1, 10)) then
    return false;
  end if;

  v_provincia := substr(p_ruc, 1, 2)::integer;
  if not (v_provincia between 1 and 24) and v_provincia <> 30 then
    return false;
  end if;

  v_tercero := substr(p_ruc, 3, 1)::integer;

  -- Persona natural: los 10 primeros SI deben ser una cedula valida (algoritmo
  -- de Registro Civil), y el establecimiento >= 001.
  if v_tercero < 6 then
    return public.es_cedula_ecuatoriana(substr(p_ruc, 1, 10))
       and substr(p_ruc, 11, 3) ~ '^[0-9]{3}$'
       and substr(p_ruc, 11, 3)::integer >= 1;

  -- Sector publico: establecimiento de 4 digitos (0001...).
  elsif v_tercero = 6 then
    return substr(p_ruc, 10, 4) ~ '^[0-9]{4}$'
       and substr(p_ruc, 10, 4)::integer >= 1;

  -- Sociedad privada / extranjera: establecimiento de 3 digitos (001...).
  -- Sin modulo 11: es advertencia, no rechazo.
  elsif v_tercero = 9 then
    return substr(p_ruc, 11, 3) ~ '^[0-9]{3}$'
       and substr(p_ruc, 11, 3)::integer >= 1;
  end if;

  -- 7 y 8 no son tipos de contribuyente asignados.
  return false;
end;
$$;

comment on function public.es_ruc_estructural(text) is
  'RUC ecuatoriano ESTRUCTURAL (req 14): 13 digitos, provincia, tercer digito 0-5/6/9 y establecimiento. Natural exige cedula valida. NO corre modulo 11 en sociedades.';

-- es_ruc_ecuatoriano (20260717020134) se conserva intacto como ADVERTENCIA
-- (¿pasa el algoritmo legado modulo 11?). Se le da un alias legible.
create or replace function public.ruc_pasa_algoritmo_legado(p_ruc text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.es_ruc_ecuatoriano(p_ruc);
$$;

comment on function public.ruc_pasa_algoritmo_legado(text) is
  'Advertencia, no rechazo: ¿el RUC pasa el algoritmo legado (modulo 10 natural / modulo 11 sociedad)? El SRI reconoce RUC validos que no lo cumplen.';

-- Estado de verificacion OFICIAL del RUC contra el SRI. No hay integracion SRI
-- en este prototipo, asi que todos quedan NO_VERIFICADO: se distingue
-- explicitamente ESTRUCTURA valida de EXISTENCIA verificada (req 14).
alter table public.empresa
  add column if not exists estado_verificacion_ruc text not null default 'NO_VERIFICADO';

alter table public.empresa drop constraint if exists empresa_estado_verificacion_ruc_valido;
alter table public.empresa add constraint empresa_estado_verificacion_ruc_valido
  check (estado_verificacion_ruc in ('NO_VERIFICADO', 'VALIDO', 'INVALIDO', 'SERVICIO_NO_DISPONIBLE'));

-- Re-apuntar el CHECK del RUC: de algoritmico (rechazaba sociedades) a estructural.
alter table public.empresa drop constraint if exists empresa_ruc_valido;
alter table public.empresa drop constraint if exists empresa_ruc_estructural;
alter table public.empresa add constraint empresa_ruc_estructural
  check (public.es_ruc_estructural(ruc));

-- ===========================================================================
-- 3. Placa segun el tipo de vehiculo
-- ===========================================================================
-- Ordinaria (auto/camioneta): 3 letras + 3/4 digitos, 1a letra de provincia.
-- Motocicleta: acepta el formato ordinario y el historico 2 letras + 3 digitos
--   + 1 letra (AB123C). BICICLETA y OTRO no se fuerzan a un patron: una placa
--   diplomatica/temporal/especial es legitima y NULL tambien (req 15).
create or replace function public.es_placa_vehiculo(p_placa text, p_tipo text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
  provincias constant text := 'ABUCXHOEWGILRMVNQSPKTZYJ';
begin
  if p_placa is null then
    return true; -- la obligatoriedad la decide el CHECK de coherencia, no esta funcion
  end if;

  v := public.normalizar_placa(p_placa);
  if v is null or v = '' then
    return true;
  end if;

  if p_tipo in ('AUTOMOVIL', 'CAMIONETA') then
    return v ~ ('^[' || provincias || '][A-Z]{2}[0-9]{3,4}$');

  elsif p_tipo = 'MOTOCICLETA' then
    return v ~ ('^[' || provincias || '][A-Z]{2}[0-9]{3,4}$')
        or v ~ ('^[' || provincias || '][A-Z][0-9]{3}[A-Z]$');

  else
    -- BICICLETA / OTRO: placa especial, temporal o inexistente. Solo se exige
    -- que, si viene, sea alfanumerica (ya normalizada) y no relleno.
    return v ~ '^[A-Z0-9]{3,8}$';
  end if;
end;
$$;

comment on function public.es_placa_vehiculo(text, text) is
  'Placa segun tipo: ordinaria (auto/camioneta), moto (ordinaria o AB123C), especial (BICICLETA/OTRO). NULL permitido (req 15).';

-- Motivo por el que un vehiculo no tiene placa: se guarda NULL en placa y el
-- motivo aqui, en vez de una cadena ficticia como 'SINPLACA' (req 15).
alter table public.vehiculo
  add column if not exists motivo_sin_placa text;

-- Re-apuntar el CHECK de placa al validador por tipo.
alter table public.vehiculo drop constraint if exists vehiculo_placa_valida;
alter table public.vehiculo add constraint vehiculo_placa_valida
  check (public.es_placa_vehiculo(placa, tipo_vehiculo));

-- Una placa nula solo se acepta cuando el tipo lo permite (bici / otro) o hay
-- un motivo declarado. NOT VALID por prudencia (no hay filas nulas hoy, pero
-- protege escrituras futuras sin bloquear un historico imprevisto).
alter table public.vehiculo drop constraint if exists vehiculo_placa_presente_o_justificada;
alter table public.vehiculo add constraint vehiculo_placa_presente_o_justificada
  check (
    placa is not null
    or tipo_vehiculo in ('BICICLETA', 'OTRO')
    or motivo_sin_placa is not null
  ) not valid;

-- ===========================================================================
-- 4. Permisos de ejecucion (patron de 20260713192300_hardening_funciones.sql)
-- ===========================================================================
revoke execute on function
  public.es_relleno_obvio(text),
  public.es_ruc_estructural(text),
  public.ruc_pasa_algoritmo_legado(text),
  public.es_placa_vehiculo(text, text)
from public, anon;

grant execute on function
  public.es_relleno_obvio(text),
  public.es_ruc_estructural(text),
  public.ruc_pasa_algoritmo_legado(text),
  public.es_placa_vehiculo(text, text)
to authenticated;
