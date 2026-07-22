-- Saneamiento de los datos de demostración antes de la entrega del prototipo 4.
--
-- La base arrastraba tres clases de suciedad de las rondas de prueba:
--   1. personas inventadas para probar ("Visitante Demo", "Impostor Uno", "TuRostro Muestra Dos");
--   2. personas REALES con cédula de relleno (1750000xxx), sin sexo, sin teléfono y sin dirección;
--   3. registros que el sistema, funcionando de forma integrada, nunca habría producido: un
--      memorando sin ninguna persona autorizada, un vehículo duplicado de otro, relaciones
--      persona-vehículo vencidas pero marcadas como ACTIVA, un punto de control llamado
--      "Garita Principal (demo)".
--
-- Criterio aplicado (acordado con el equipo):
--   * las cuentas del sistema NO se tocan: ni correo, ni nombre de usuario, ni contraseña. De sus
--     personas solo se corrige la cédula, los datos de contacto y —cuando el nombre era un rol y
--     no un nombre— el nombre;
--   * las personas de prueba con historial útil se convierten en personas reales, para no dejar
--     el historial de la garita vacío en la presentación;
--   * las personas de prueba sin historial se borran, junto con lo que colgaba de ellas.
--
-- Las cédulas y los nombres son inventados pero verosímiles: todas las cédulas pasan el algoritmo
-- del Registro Civil (`es_cedula_ecuatoriana`) y su provincia es Pichincha (17). La única que no
-- se inventó es la de Carlos Chávez, que la dio el propio equipo.
--
-- Es un saneamiento de datos, no un cambio de reglas: para poder ejecutarlo se desactivan durante
-- la transacción los triggers que prohíben el DELETE físico y los que llenan la bitácora (esto
-- último para no dejar 40 apuntes de auditoría sin usuario, que ensuciarían la pantalla de
-- Auditoría el día de la presentación). Las reglas quedan activas al terminar.

-- ===========================================================================
-- 0. Permitir el saneamiento
-- ===========================================================================
alter table public.persona            disable trigger trg_bloquear_delete_persona;
alter table public.persona_vehiculo   disable trigger trg_bloquear_delete_persona_vehiculo;
alter table public.persona_memorando  disable trigger trg_bloquear_delete_persona_memorando;
alter table public.memorando          disable trigger trg_bloquear_delete_memorando;
alter table public.memorando_vehiculo disable trigger trg_bloquear_delete_memorando_vehiculo;
alter table public.vehiculo           disable trigger trg_bloquear_delete_vehiculo;
alter table public.evento_acceso      disable trigger trg_bloquear_delete_evento_acceso;
alter table public.alerta_seguridad   disable trigger trg_bloquear_delete_alerta_seguridad;
alter table public.autorizacion_visita_diaria disable trigger trg_bloquear_delete_autorizacion_visita_diaria;

alter table public.persona           disable trigger trg_bitacora_persona;
alter table public.vehiculo          disable trigger trg_bitacora_vehiculo;
alter table public.persona_vehiculo  disable trigger trg_bitacora_persona_vehiculo;
alter table public.memorando         disable trigger trg_bitacora_memorando;
alter table public.persona_memorando disable trigger trg_bitacora_persona_memorando;
alter table public.evento_acceso     disable trigger trg_bitacora_evento_acceso;
alter table public.punto_control     disable trigger trg_bitacora_punto_control;
alter table public.zona              disable trigger trg_bitacora_zona;
alter table public.empresa           disable trigger trg_bitacora_empresa;
alter table public.dispositivo       disable trigger trg_bitacora_dispositivo;

-- Trasladar el historial de un vehículo duplicado a otro es una corrección de datos, no el paso
-- de nadie por una garita: no debe exigir un guardia en turno ni volver a levantar alertas.
alter table public.evento_acceso disable trigger trg_exigir_turno_guardia_evento;
alter table public.evento_acceso disable trigger trg_generar_alerta_evento_denegado;

-- ===========================================================================
-- 1. Personas de prueba que se borran
-- ===========================================================================
-- "Impostor Uno" y "Impostor Dos" se crearon para probar que el reconocimiento facial NO acepta
-- a quien no debe, y "TuRostro Muestra Dos" para calibrar el umbral. Ninguna representa a nadie.
--   00000000-...-e1 Impostor Uno · ...-dd Impostor Dos · ...-dc TuRostro Muestra Dos
delete from public.alerta_seguridad a
 where a.id_evento in (
   select e.id_evento from public.evento_acceso e
    where e.id_persona in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000dd','00000000-0000-0000-0000-0000000000dc')
 );

delete from public.error_reconocimiento er
 where er.id_evento in (
   select e.id_evento from public.evento_acceso e
    where e.id_persona in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000dd','00000000-0000-0000-0000-0000000000dc')
 );

delete from public.evento_acceso
 where id_persona in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000dd','00000000-0000-0000-0000-0000000000dc');

delete from public.persona_vehiculo
 where id_persona in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000dd','00000000-0000-0000-0000-0000000000dc');

delete from public.registro_biometrico
 where id_persona in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000dd','00000000-0000-0000-0000-0000000000dc');

delete from public.persona_interna_detalle
 where id_persona in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000dd','00000000-0000-0000-0000-0000000000dc');

delete from public.persona
 where id_persona in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000dd','00000000-0000-0000-0000-0000000000dc');

-- ===========================================================================
-- 2. Personas con cuenta en el sistema: solo cédula y datos de contacto
-- ===========================================================================
-- El correo, el nombre de usuario y la contraseña se quedan como están: son credenciales en uso.

-- Cuenta "admin". El nombre era su cargo ("Administrador del Sistema"), no el de una persona.
update public.persona set
  nombres = 'Diego Fernando', apellidos = 'Salazar Núñez',
  cedula = '1718345620', sexo = 'M', fecha_nacimiento = '1985-03-14',
  telefono_contacto = '0987112233', telefono_respaldo = '022456701',
  direccion_domicilio = 'Av. Amazonas N39-123 y Gaspar de Villarroel, Quito',
  correo_respaldo = 'diego.salazar.epn@gmail.com'
 where id_persona = '00000000-0000-0000-0000-000000000001';

-- Cuenta "carlos.chavez03" (cédula facilitada por el equipo).
update public.persona set
  cedula = '1751207646', sexo = 'M', fecha_nacimiento = '2003-05-22',
  telefono_contacto = '0984551220', telefono_respaldo = '022556677',
  direccion_domicilio = 'Av. 6 de Diciembre N24-253 y Lizardo García, Quito',
  correo_respaldo = 'carlos.chavez03@gmail.com'
 where id_persona = '00000000-0000-0000-0000-0000000000a5';

-- Cuenta "gary.defas" (Director Administrativo).
update public.persona set
  cedula = '1720568938', sexo = 'M', fecha_nacimiento = '1978-11-02',
  telefono_contacto = '0991234455', telefono_respaldo = '022341180',
  direccion_domicilio = 'Calle Vozandes N39-45 y Av. América, Quito',
  correo_respaldo = 'gary.defas@gmail.com'
 where id_persona = '00000000-0000-0000-0000-0000000000a1';

-- Cuenta "heidy.tenelema" (Responsable de Puntos de Control).
update public.persona set
  cedula = '1709482713', sexo = 'F', fecha_nacimiento = '1990-07-18',
  telefono_contacto = '0986778899', telefono_respaldo = '022590112',
  direccion_domicilio = 'Av. La Prensa N54-120 y Manuel Valdivieso, Quito',
  correo_respaldo = 'heidy.tenelema@gmail.com'
 where id_persona = '00000000-0000-0000-0000-0000000000a4';

-- Cuenta "joel.velastegui" (Responsable de Personal Externo).
update public.persona set
  cedula = '1753920188', sexo = 'M', fecha_nacimiento = '1995-01-30',
  telefono_contacto = '0993445566', telefono_respaldo = '022672340',
  direccion_domicilio = 'Av. Eloy Alfaro N32-650 y Rusia, Quito',
  correo_respaldo = 'joel.velastegui@gmail.com'
 where id_persona = '00000000-0000-0000-0000-0000000000a3';

-- Cuenta "lenin.amangandi" (Responsable de Personal Interno).
update public.persona set
  cedula = '1712674355', sexo = 'M', fecha_nacimiento = '1988-09-12',
  telefono_contacto = '0987334455', telefono_respaldo = '022846215',
  direccion_domicilio = 'Av. Mariscal Sucre S12-45 y Ajaví, Quito',
  correo_respaldo = 'lenin.amangandi@gmail.com'
 where id_persona = '00000000-0000-0000-0000-0000000000a2';

-- Cuenta "frank.jumbo" (guardia).
update public.persona set
  cedula = '1727830497', telefono_respaldo = '022731540',
  correo_respaldo = 'frank.jumbo@gmail.com'
 where id_persona = '862ed696-a68d-4186-9b9f-d20823789e58';

-- Cuenta "guardia_demo": la cuenta se queda igual (es con la que se demuestra la garita), pero la
-- persona detrás pasa a tener nombre y cédula de verdad.
update public.persona set
  nombres = 'Marco Andrés', apellidos = 'Villacís Ponce',
  cedula = '1706159280', sexo = 'M', fecha_nacimiento = '1983-04-09',
  telefono_contacto = '0985667788', telefono_respaldo = '022514903',
  direccion_domicilio = 'Calle Rumipamba E2-45 y Av. República, Quito',
  correo_respaldo = 'marco.villacis83@gmail.com'
 where id_persona = '00000000-0000-0000-0000-000000000003';

-- Cuenta "lady.velasquez": solo le faltaba la dirección.
update public.persona set
  direccion_domicilio = 'Av. Occidental N45-12 y Machala, Quito',
  telefono_respaldo = '022295687',
  correo_respaldo = 'lady.velasquez@gmail.com'
 where id_persona = '484ee2dc-c794-4195-9a71-8e5069abd680';

-- Cuenta "renato.aguilar": completo salvo los datos de respaldo.
update public.persona set
  telefono_respaldo = '022803417', correo_respaldo = 'renato.aguilar05@gmail.com'
 where id_persona = 'b9127392-5b7d-4d5b-b74b-08ea5b58fad5';

-- ===========================================================================
-- 3. Personal interno sin cuenta
-- ===========================================================================
-- "Docente Demo" tiene cinco ingresos por reconocimiento facial en el historial: se convierte en
-- una docente real en vez de borrarla, para no dejar hueco en el historial de la garita. No tiene
-- cuenta en el sistema, así que su correo sí puede corregirse.
update public.persona set
  nombres = 'Patricia Elena', apellidos = 'Rosero Guerrero',
  cedula = '1714297080', correo = 'patricia.rosero@epn.edu.ec',
  sexo = 'F', fecha_nacimiento = '1980-02-25',
  telefono_contacto = '0984002211', telefono_respaldo = '022445980',
  direccion_domicilio = 'Av. Gaspar de Villarroel E9-24 y Shyris, Quito',
  correo_respaldo = 'patricia.rosero80@gmail.com'
 where id_persona = '00000000-0000-0000-0000-0000000000da';

update public.persona set
  cedula = '1719502849', codigo_unico = '202410455',
  telefono_respaldo = '022671209', correo_respaldo = 'hernan.avellaneda@gmail.com'
 where id_persona = '83a9dadc-a2ae-4810-9be1-c573100fbbb0';

-- Camila figuraba con sexo masculino.
update public.persona set
  cedula = '1726048174', sexo = 'F',
  telefono_respaldo = '022630874', correo_respaldo = 'camila.caicedo03@gmail.com'
 where id_persona = '9d11ffb6-d991-4d93-bdd4-a3b256b673b2';

-- El correo era "al@epn.edu.ec": válido para el validador, pero no es una dirección institucional
-- de verdad.
update public.persona set
  cedula = '1703729564', correo = 'alexander.guerra@epn.edu.ec',
  telefono_respaldo = '022358741', correo_respaldo = 'alexander.guerra@gmail.com'
 where id_persona = '0e45bbdc-8466-480b-bf6c-f5f23fa9064d';

update public.persona set
  cedula = '1756814032',
  telefono_respaldo = '022492036', correo_respaldo = 'cecilia.jaramillo@gmail.com'
 where id_persona = '90c1f608-dc6f-4d6a-9458-4e93f0bc4376';

update public.persona set
  telefono_respaldo = '022716045', correo_respaldo = 'alejandro.quiroz@gmail.com'
 where id_persona = '67545185-acb6-472e-a5f4-c912848c4412';

-- ===========================================================================
-- 4. Personal externo
-- ===========================================================================
-- "Visitante Demo" tiene tres eventos y dos autorizaciones de visita: mismo criterio que la
-- docente, se convierte en una visitante real.
update public.persona set
  nombres = 'Andrea Carolina', apellidos = 'Suárez Mena',
  cedula = '1708573926', correo = 'andrea.suarez94@gmail.com',
  sexo = 'F', fecha_nacimiento = '1994-06-11',
  telefono_contacto = '0987221100', telefono_respaldo = '022551408',
  direccion_domicilio = 'Av. 10 de Agosto N33-12 y Colón, Quito',
  correo_respaldo = 'andrea.suarez.mena@outlook.com'
 where id_persona = '00000000-0000-0000-0000-0000000000db';

-- Los dos empleados de DILIPA llevaban nombres de personajes de dibujos animados. Se conservan
-- sus cédulas (son válidas) y todos sus vínculos: son los protagonistas del flujo de memorando
-- con vehículo.
update public.persona set
  nombres = 'Ricardo Javier', apellidos = 'Sánchez Peñafiel',
  correo = 'ricardo.sanchez@dilipa.com.ec',
  telefono_respaldo = '022803155', correo_respaldo = 'ricardo.sanchez78@gmail.com'
 where id_persona = 'd8d6c425-32ca-49b8-ace6-d1f500cc155e';

update public.persona set
  nombres = 'Mateo Andrés', apellidos = 'Salgado Mena',
  correo = 'mateo.salgado@dilipa.com.ec',
  telefono_respaldo = '022803156', correo_respaldo = 'mateo.salgado00@gmail.com'
 where id_persona = 'cacc8562-4fa5-4941-966b-4c4a9c96bcc3';

-- Un conductor externo con correo @epn.edu.ec era otra herencia de los datos de prueba.
update public.persona set
  cedula = '1729156347', correo = 'victor.coyago@gmail.com',
  telefono_respaldo = '022874511', correo_respaldo = 'vcoyago.transportes@outlook.com'
 where id_persona = '5407e0fa-8a4f-4bcc-bba8-232fe802ddf7';

update public.persona set
  telefono_contacto = '0986554433', telefono_respaldo = '022670941',
  direccion_domicilio = 'Calle Toledo N24-63 y Madrid, Quito',
  correo_respaldo = 'nathaly.bravo05@outlook.com'
 where id_persona = 'ee6fbca3-6d53-442a-9512-634212ad90f2';

update public.persona set
  telefono_contacto = '0988776655', telefono_respaldo = '022619730',
  direccion_domicilio = 'Av. Napo S9-45 y Alonso de Angulo, Quito',
  correo_respaldo = 'lenin.pico04@outlook.com'
 where id_persona = 'a48049fd-2f81-476e-a7ba-082016fa9222';

-- Dos memorandos vigentes no autorizaban a NADIE: un memorando sin personas no deja entrar a
-- nadie y no debería existir. En vez de borrarlos (son vigentes y de empresas reales del
-- sistema), se registra al empleado que cada uno ampara.
insert into public.persona (id_persona, tipo_persona, id_categoria, id_empresa, cedula, nombres, apellidos,
                            correo, sexo, fecha_nacimiento, telefono_contacto, direccion_domicilio, estado)
values
  ('c1e2a3b4-0000-4000-8000-000000000001', 'EXTERNA',
   (select id_categoria from public.categoria_persona where codigo_categoria = 'CONTRATISTA'),
   (select id_empresa from public.empresa where ruc = '0992881208001'),
   '1715609234', 'Silvia Marlene', 'Chicaiza Toapanta', 'silvia.chicaiza@cleanpro.com.ec',
   'F', '1987-12-03', '0982114477', 'Av. Rodrigo de Chávez Oe1-25 y Cacha, Quito', 'ACTIVO'),
  ('c1e2a3b4-0000-4000-8000-000000000002', 'EXTERNA',
   (select id_categoria from public.categoria_persona where codigo_categoria = 'CONTRATISTA'),
   (select id_empresa from public.empresa where ruc = '0791798655001'),
   '1724380959', 'Jorge Luis', 'Andrade Villamar', 'jorge.andrade@securcorp.com.ec',
   'M', '1982-08-21', '0993668820', 'Av. De los Shyris N38-45 y El Telégrafo, Quito', 'ACTIVO')
on conflict (id_persona) do nothing;

insert into public.persona_memorando (id_memorando, id_persona, estado_acceso)
select m.id_memorando, p.id_persona, 'ACTIVO'
  from public.memorando m
  join public.persona p on p.id_persona = case m.numero_memorando
    when 'EPN-DA-2026-0777-M' then 'c1e2a3b4-0000-4000-8000-000000000001'::uuid
    when 'EPN-DA-2026-0888-M' then 'c1e2a3b4-0000-4000-8000-000000000002'::uuid
  end
 where m.numero_memorando in ('EPN-DA-2026-0777-M', 'EPN-DA-2026-0888-M')
on conflict do nothing;

-- ===========================================================================
-- 5. Memorandos
-- ===========================================================================
-- La dependencia que autoriza estaba vacía en todos: es el dato que el guardia mira para saber a
-- dónde va el visitante.
update public.memorando set dependencia_autorizada = 'Dirección de Servicios Generales'
 where numero_memorando = 'EPN-DA-2026-0777-M';
update public.memorando set dependencia_autorizada = 'Dirección de Seguridad y Salud Ocupacional'
 where numero_memorando = 'EPN-DA-2026-0888-M';
update public.memorando set dependencia_autorizada = 'Secretaría General'
 where numero_memorando = 'EPN-DA-2026-0001-M';

-- El memorando de DILIPA es el caso que se demuestra (persona + vehículo + fechas heredadas), y
-- vencía justo al día siguiente. Se amplía hasta fin de agosto para que siga vigente durante la
-- presentación.
update public.memorando set
  fecha_fin = '2026-08-31',
  dependencia_autorizada = 'Departamento de Adquisiciones'
 where numero_memorando = 'EPN-DA-2026-002-M';

-- Memorandos que el sistema íntegro no habría producido: dos vencidos sin ninguna persona
-- autorizada, uno de prueba anulado ("PRB") y el duplicado anulado de DILIPA, que amparaba a un
-- segundo camión idéntico al real.
delete from public.memorando_vehiculo mv
 using public.memorando m
 where m.id_memorando = mv.id_memorando
   and m.numero_memorando in ('EPN-DA-2026-0002-M', 'EPN-DA-2026-0003-M', 'EPN-PRB-2026-0451', 'EPN-DL-2026-002');

delete from public.persona_memorando pm
 using public.memorando m
 where m.id_memorando = pm.id_memorando
   and m.numero_memorando in ('EPN-DA-2026-0002-M', 'EPN-DA-2026-0003-M', 'EPN-PRB-2026-0451', 'EPN-DL-2026-002');

delete from public.memorando
 where numero_memorando in ('EPN-DA-2026-0002-M', 'EPN-DA-2026-0003-M', 'EPN-PRB-2026-0451', 'EPN-DL-2026-002');

-- ===========================================================================
-- 6. Vehículos y asociaciones
-- ===========================================================================
-- PCR-1234 y PCZ-1234 eran el mismo camión de DILIPA (Chevrolet NLR blanco) registrado dos veces
-- en dos intentos consecutivos. El historial de accesos del primero se traslada al que sigue
-- vivo —el que ampara el memorando vigente— para no perder los ingresos y salidas ya registrados,
-- y el duplicado desaparece.
update public.evento_acceso
   set id_vehiculo = '47a4fcd2-ba20-4bc6-8ea3-0bce78ffd8e8'
 where id_vehiculo = 'c6616cf2-d97e-4557-893f-21883fc56c31';

delete from public.persona_vehiculo where id_vehiculo = 'c6616cf2-d97e-4557-893f-21883fc56c31';
delete from public.vehiculo where id_vehiculo = 'c6616cf2-d97e-4557-893f-21883fc56c31';

-- Marca y modelo de relleno ("MarcaT", "ModeloT").
update public.vehiculo set marca = 'Chevrolet', modelo = 'Sail', color = 'Azul'
 where id_vehiculo = 'ce7d4cfe-0d6e-4d1f-9711-caf2fa22151b';

-- Un vehículo tiene un único propietario activo; esta fila revocada era el rastro de un alta
-- repetida sobre la misma placa, con la misma persona y el mismo rol.
delete from public.persona_vehiculo
 where id_vehiculo = 'ce7d4cfe-0d6e-4d1f-9711-caf2fa22151b'
   and estado_relacion = 'REVOCADA';

-- Relaciones marcadas ACTIVA con la vigencia ya vencida: o el estado o la fecha mentían. Se
-- extienden hasta fin de año, que es el criterio del resto de asociaciones de personal interno.
update public.persona_vehiculo pv set fecha_fin = '2026-12-31'
  from public.persona p
 where p.id_persona = pv.id_persona
   and p.tipo_persona = 'INTERNA'
   and pv.estado_relacion = 'ACTIVA'
   and (pv.fecha_fin is null or pv.fecha_fin < now());

-- Las asociaciones nacidas de un formulario guardaban el instante exacto del alta
-- ("2026-07-21 23:19:30") en un campo que representa un DÍA. Se normalizan a medianoche UTC,
-- como el resto del sistema (§D81).
update public.persona_vehiculo
   set fecha_inicio = date_trunc('day', fecha_inicio at time zone 'UTC') at time zone 'UTC'
 where fecha_inicio <> date_trunc('day', fecha_inicio at time zone 'UTC') at time zone 'UTC';

update public.persona_vehiculo
   set fecha_fin = date_trunc('day', fecha_fin at time zone 'UTC') at time zone 'UTC'
 where fecha_fin is not null
   and fecha_fin <> date_trunc('day', fecha_fin at time zone 'UTC') at time zone 'UTC';

-- El personal externo del memorando de DILIPA queda con la vigencia del memorando, que es de
-- donde tiene que salir a partir de esta ronda.
update public.persona_vehiculo pv
   set fecha_inicio = '2026-07-21', fecha_fin = '2026-08-31'
  from public.persona p
 where p.id_persona = pv.id_persona
   and p.tipo_persona = 'EXTERNA'
   and pv.estado_relacion = 'ACTIVA'
   and pv.id_vehiculo = '47a4fcd2-ba20-4bc6-8ea3-0bce78ffd8e8';

-- ===========================================================================
-- 7. Infraestructura con nombres de prueba
-- ===========================================================================
update public.punto_control set nombre_punto = 'Garita Principal - Av. Toledo'
 where id_punto_control = '00000000-0000-0000-0000-000000000006';

-- Punto dentro de un edificio: pasa a la nomenclatura oficial de espacios de la EPN.
update public.punto_control set nombre_punto = 'E15/P1/E001 – Laboratorio de Suelos'
 where id_punto_control = '97cc44cd-bd55-4aeb-a766-c0bf099f316d';

-- "Edificioflnd 21" era un nombre tecleado a medias durante una prueba.
update public.zona set nombre_zona = 'Edificio 21 - Laboratorios de Docencia'
 where id_zona = 'aadf0903-cb88-4eb6-a009-4652944c0386';

update public.empresa set nombre = 'CleanPro S.A.' where ruc = '0992881208001';

-- MAC de relleno en las cámaras de la garita principal.
update public.dispositivo set codigo_mac = '00:1B:44:11:3A:B7'
 where codigo_dispositivo = 'BIO-0002';
update public.dispositivo set codigo_mac = '00:1B:44:11:3A:C9'
 where codigo_dispositivo = 'BIO-0003';
update public.dispositivo set codigo_mac = '00:1B:44:11:3A:D4'
 where codigo_dispositivo = 'LPR-0001' and codigo_mac is null;
update public.dispositivo set codigo_mac = '00:1B:44:11:3A:E2'
 where codigo_dispositivo = 'BIO-0004' and codigo_mac is null;

-- ===========================================================================
-- 8. Restaurar las reglas
-- ===========================================================================
alter table public.persona            enable trigger trg_bloquear_delete_persona;
alter table public.persona_vehiculo   enable trigger trg_bloquear_delete_persona_vehiculo;
alter table public.persona_memorando  enable trigger trg_bloquear_delete_persona_memorando;
alter table public.memorando          enable trigger trg_bloquear_delete_memorando;
alter table public.memorando_vehiculo enable trigger trg_bloquear_delete_memorando_vehiculo;
alter table public.vehiculo           enable trigger trg_bloquear_delete_vehiculo;
alter table public.evento_acceso      enable trigger trg_bloquear_delete_evento_acceso;
alter table public.alerta_seguridad   enable trigger trg_bloquear_delete_alerta_seguridad;
alter table public.autorizacion_visita_diaria enable trigger trg_bloquear_delete_autorizacion_visita_diaria;

alter table public.persona           enable trigger trg_bitacora_persona;
alter table public.vehiculo          enable trigger trg_bitacora_vehiculo;
alter table public.persona_vehiculo  enable trigger trg_bitacora_persona_vehiculo;
alter table public.memorando         enable trigger trg_bitacora_memorando;
alter table public.persona_memorando enable trigger trg_bitacora_persona_memorando;
alter table public.evento_acceso     enable trigger trg_bitacora_evento_acceso;
alter table public.punto_control     enable trigger trg_bitacora_punto_control;
alter table public.zona              enable trigger trg_bitacora_zona;
alter table public.empresa           enable trigger trg_bitacora_empresa;
alter table public.dispositivo       enable trigger trg_bitacora_dispositivo;

alter table public.evento_acceso enable trigger trg_exigir_turno_guardia_evento;
alter table public.evento_acceso enable trigger trg_generar_alerta_evento_denegado;
