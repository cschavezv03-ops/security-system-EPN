-- Un vehículo no puede quedar registrado sin una persona propietaria (RF-CA-018, feedback ADM).
--
-- El alta atómica vehículo+propietario ya existía (RPC `crear_vehiculo_con_propietario`, req 35,
-- migraciones 20260717030100/030500) y la usa `VehiculoPropietarioPage`. Lo que faltaba era
-- CERRAR la puerta de atrás: el formulario genérico de vehículo (ResourceScreen) creaba la fila
-- de `vehiculo` sola, sin propietario, y así aparecían vehículos huérfanos (p. ej. TDH-398).
--
-- Esta migración pone la garantía en la base para que valga en TODOS los módulos (ADM/GPI/GPE) y
-- también ante la API directa: una restricción diferida rechaza cualquier vehículo activo que al
-- cerrar la transacción no tenga un propietario activo. Es DEFERRABLE INITIALLY DEFERRED para que
-- el alta atómica del RPC (dos INSERT en una transacción) la vea completa y la acepte; un INSERT
-- de vehículo suelto —cualquier vía— falla al hacer commit. Solo se dispara en el INSERT: no
-- estorba a las ediciones ni a la baja de vehículos, ni a los scripts de prueba (que hacen rollback).
--
-- (El frontend deja de ofrecer el alta genérica de vehículo y manda a `/vehiculos/nuevo`, la
-- pantalla que crea el par de forma atómica.)

create or replace function public.exigir_propietario_vehiculo() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if NEW.estado_vehiculo = 'DADO_DE_BAJA' then
    return NEW;
  end if;
  if not exists (
    select 1 from public.persona_vehiculo pv
     where pv.id_vehiculo = NEW.id_vehiculo
       and pv.estado_relacion = 'ACTIVA'
       and pv.tipo_relacion = 'PROPIETARIO'
  ) then
    raise exception 'Un vehículo no puede quedar registrado sin una persona propietaria (RF-CA-018).'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_vehiculo_requiere_propietario on public.vehiculo;
create constraint trigger trg_vehiculo_requiere_propietario
  after insert on public.vehiculo
  deferrable initially deferred
  for each row execute function public.exigir_propietario_vehiculo();
