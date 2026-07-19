-- El guardia de demostracion estaba asignado a "Puerta - Laboratorio de Suelos", que esta en
-- MANTENIMIENTO. esta_en_turno_guardia() exige punto ACTIVO (§D60), asi que la cuenta entraba
-- al sistema pero no podia registrar un solo evento: toda la Garita quedaba imposible de
-- probar. Es el comportamiento correcto del sistema con unos datos de demo equivocados.
--
-- Se le reasigna a la "Garita Principal (demo)", que es el punto al que apuntan las reglas
-- de acceso sembradas: sin eso, cualquier prueba de RF-CA-005/006/007 devolveria "sin regla
-- aplicable" y pareceria un fallo de la validacion.
--
-- Sin DELETE fisico: la asignacion anterior se cierra como FINALIZADA, no se borra.

update public.guardia_punto_control
   set estado_asignacion = 'FINALIZADA'
 where id_usuario = (select id from auth.users where email = 'guardia.demo@epn.edu.ec')
   and estado_asignacion = 'ACTIVA';

insert into public.guardia_punto_control
  (id_usuario, id_punto_control, estado_asignacion, hora_inicio, hora_fin, id_usuario_registro)
select au.id,
       '00000000-0000-0000-0000-000000000006'::uuid,
       'ACTIVA',
       -- 12 h justas: el maximo que admite JORNADA_MAXIMA_GUARDIA_HORAS (§D59). Cubre toda la
       -- franja en la que se haran las pruebas manuales con placas reales.
       '06:00:00'::time,
       '18:00:00'::time,
       (select id from auth.users where email = 'admin@epn.edu.ec')
  from auth.users au
 where au.email = 'guardia.demo@epn.edu.ec';
