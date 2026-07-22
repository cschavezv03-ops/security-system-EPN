-- Tercera y última parte del saneamiento: reglas de acceso y fichas de vehículo.
--
-- Reglas: cuatro de las trece se llamaban "Demo DOCENTE garita principal" o duplicaban a otra
-- ("ACCESO_DOCENTE" junto a "ACCESO_DOCENTES"). Las que tienen eventos en el historial se
-- renombran —borrarlas dejaría los eventos sin la regla que los autorizó—; las que no, se borran.
-- Todas quedan además con descripción: en la pantalla de CAC es lo que explica la regla al que
-- la consulta.
--
-- Vehículos: marca, modelo y color venían en MAYÚSCULAS o en minúsculas según quién los tecleó, y
-- varias asociaciones de personal interno vencían la semana de la presentación.

alter table public.regla_acceso     disable trigger trg_bitacora_regla_acceso;
alter table public.regla_acceso     disable trigger trg_bloquear_delete_regla_acceso;
alter table public.vehiculo         disable trigger trg_bitacora_vehiculo;
alter table public.persona_vehiculo disable trigger trg_bitacora_persona_vehiculo;

-- ---------------------------------------------------------------------------
-- Reglas de acceso
-- ---------------------------------------------------------------------------
-- Las dos reglas sin restricción horaria se crearon para las primeras pruebas de la garita y
-- siguen INACTIVAS: se quedan por el historial que las cita, con un nombre que dice lo que hacen.
update public.regla_acceso set
  nombre_regla = 'ACCESO_DOCENTES_SIN_RESTRICCION_HORARIA',
  descripcion = 'Regla amplia de las primeras pruebas de la garita: cubría el día completo. Sustituida por ACCESO_DOCENTES y desactivada.'
 where id_regla_acceso = '00000000-0000-0000-0000-0000000000d2';

update public.regla_acceso set
  nombre_regla = 'ACCESO_VISITANTES_SIN_RESTRICCION_HORARIA',
  descripcion = 'Regla amplia de las primeras pruebas de la garita: cubría el día completo. Sustituida por ACCESO_VISITANTES_CON_MEMORANDO y desactivada.'
 where id_regla_acceso = '00000000-0000-0000-0000-0000000000d3';

-- Sin eventos que las citen: una regla duplicada y una de prueba.
delete from public.regla_acceso_punto_control
 where id_regla_acceso in ('2e6ca904-0a60-41ec-b5ef-7521ab398d24', '46617619-7f79-43ba-869b-cd7740ea8725');
delete from public.regla_acceso
 where id_regla_acceso in ('2e6ca904-0a60-41ec-b5ef-7521ab398d24', '46617619-7f79-43ba-869b-cd7740ea8725');

-- "MEMORANDO" no dice a quién se aplica; el resto de reglas sí.
update public.regla_acceso set
  nombre_regla = 'ACCESO_VISITANTES_CON_MEMORANDO',
  descripcion = 'Ingreso de visitantes amparados por un memorando, en la franja de la mañana en la que atienden las dependencias.'
 where id_regla_acceso = 'ef68e1c7-9a4c-4021-89d2-06272892c477';

update public.regla_acceso set
  descripcion = 'Ingreso ordinario de estudiantes, desde la primera hora de clase hasta el cierre de la jornada nocturna.'
 where id_regla_acceso = 'f34c1a81-f225-46ef-a73e-93b0883ce108';

-- ---------------------------------------------------------------------------
-- Vehículos
-- ---------------------------------------------------------------------------
update public.vehiculo set marca = 'Chevrolet', modelo = 'NLR', color = 'Blanco'
 where placa = 'PCZ1234';

update public.vehiculo set modelo = 'Soluto', color = 'Rojo'
 where placa = 'ECU593';

-- Las asociaciones del personal interno van al año lectivo completo. Antes vencían entre el 26 y
-- el 31 de julio: en plena presentación, media flota habría aparecido como caducada.
update public.persona_vehiculo pv set fecha_fin = '2026-12-31'
  from public.persona p
 where p.id_persona = pv.id_persona
   and p.tipo_persona = 'INTERNA'
   and pv.estado_relacion = 'ACTIVA'
   and pv.fecha_fin < '2026-12-31';

alter table public.regla_acceso     enable trigger trg_bitacora_regla_acceso;
alter table public.regla_acceso     enable trigger trg_bloquear_delete_regla_acceso;
alter table public.vehiculo         enable trigger trg_bitacora_vehiculo;
alter table public.persona_vehiculo enable trigger trg_bitacora_persona_vehiculo;
