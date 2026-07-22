-- Poner al día el memorando que ya existía con vehículo, para que la regla nueva no deje fuera
-- a quien hoy sí puede entrar.
--
-- EPN-DL-2026-002 (DILIPA) ampara a Morty Smith, propietario de la placa PCR1234, y a Rick
-- Sanchez como pasajero del mismo vehículo. Ese es exactamente el caso que la funcionalidad
-- nueva describe —un externo que entra conduciendo, con acompañante—, pero el memorando se
-- creó antes de que existieran estas columnas, así que no declara ni el vehículo ni los
-- acompañantes. Sin este arrastre, al desplegar la validación nueva el conductor pasaría de
-- entrar a ser denegado por "su memorando no ampara este vehículo", que sería un cambio de
-- comportamiento no pedido sobre un dato correcto.

update public.memorando
   set permite_vehiculo = true,
       permite_acompanantes = true
 where numero_memorando = 'EPN-DL-2026-002';

insert into public.memorando_vehiculo (id_memorando, id_vehiculo, observacion)
select m.id_memorando,
       v.id_vehiculo,
       'Vehículo ya asociado a las personas del memorando antes de que existiera este registro.'
  from public.memorando m
  cross join public.vehiculo v
 where m.numero_memorando = 'EPN-DL-2026-002'
   and v.placa = 'PCR1234'
on conflict on constraint memorando_vehiculo_unico do nothing;
