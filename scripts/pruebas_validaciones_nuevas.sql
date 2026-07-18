-- Pruebas de las validaciones nuevas (reqs 9-38, migraciones 20260717030000..030300).
--
-- Seguro de ejecutar contra la base real: TODO va dentro de BEGIN … ROLLBACK, no
-- deja rastro. Requiere que las 4 migraciones ya estén aplicadas.
--   psql "$DATABASE_URL" -f scripts/pruebas_validaciones_nuevas.sql
--
-- Cada bloque lanza EXCEPTION si una aserción falla; si el script llega al final
-- e imprime 'TODAS LAS PRUEBAS PASARON', todo está correcto.

begin;

-- 1. Cédula: rechazo de relleno + conservación de lo válido -------------------
do $$
begin
  assert es_cedula_ecuatoriana('2222222222') = false, 'relleno 2222222222 deberia rechazarse';
  assert es_relleno_obvio('0123456789') = true, 'secuencia deberia ser relleno';
  assert es_cedula_ecuatoriana('1750000000') = true, 'cedula saneada deberia seguir valida';
end $$;

-- 2. RUC: estructura vs algoritmo legado -------------------------------------
do $$
begin
  assert es_ruc_estructural('0990000000001') = true, 'sociedad estructural deberia pasar';
  assert ruc_pasa_algoritmo_legado('0990000000001') = false, 'y NO pasar el modulo 11 (advertencia)';
  assert es_ruc_estructural('2222222222001') = false, 'RUC natural con cedula relleno deberia fallar';
end $$;

-- 3. Placa por tipo -----------------------------------------------------------
do $$
begin
  assert es_placa_vehiculo('AB123C','MOTOCICLETA') = true, 'placa moto historica deberia pasar';
  assert es_placa_vehiculo('AB123C','AUTOMOVIL') = false, 'esa placa NO es de automovil';
  assert es_placa_vehiculo('PDF1234','AUTOMOVIL') = true, 'placa auto ordinaria deberia pasar';
end $$;

-- 4. Máximo 2 vehículos activos (trigger, a prueba de secuencia) --------------
do $$
declare v_uid uuid; v_per uuid; v1 uuid; v2 uuid; v3 uuid; v_fallo boolean := false;
begin
  select id_usuario into v_uid from usuario_sistema limit 1;
  select p.id_persona into v_per from persona p where p.estado='ACTIVO'
    and not exists (select 1 from persona_vehiculo pv where pv.id_persona=p.id_persona
      and pv.estado_relacion='ACTIVA' and pv.tipo_relacion in ('PROPIETARIO','CONDUCTOR_AUTORIZADO')) limit 1;
  insert into vehiculo(placa,tipo_vehiculo,id_usuario_registro) values ('PZZ9001','AUTOMOVIL',v_uid) returning id_vehiculo into v1;
  insert into vehiculo(placa,tipo_vehiculo,id_usuario_registro) values ('PZZ9002','AUTOMOVIL',v_uid) returning id_vehiculo into v2;
  insert into vehiculo(placa,tipo_vehiculo,id_usuario_registro) values ('PZZ9003','AUTOMOVIL',v_uid) returning id_vehiculo into v3;
  insert into persona_vehiculo(id_persona,id_vehiculo,tipo_relacion,fecha_inicio,estado_relacion,id_usuario_registro) values (v_per,v1,'PROPIETARIO',now(),'ACTIVA',v_uid);
  insert into persona_vehiculo(id_persona,id_vehiculo,tipo_relacion,fecha_inicio,estado_relacion,id_usuario_registro) values (v_per,v2,'CONDUCTOR_AUTORIZADO',now(),'ACTIVA',v_uid);
  begin
    insert into persona_vehiculo(id_persona,id_vehiculo,tipo_relacion,fecha_inicio,estado_relacion,id_usuario_registro) values (v_per,v3,'CONDUCTOR_AUTORIZADO',now(),'ACTIVA',v_uid);
  exception when check_violation then v_fallo := true; end;
  assert v_fallo, 'el tercer vehiculo activo deberia rechazarse';
end $$;

-- 5. Turno de guardia (hora del servidor, cruce de medianoche) ----------------
do $$
declare v_uid uuid; v_pc uuid; v_in boolean; v_out boolean; v_noc boolean;
begin
  select ur.id_usuario into v_uid from usuario_rol ur join rol r on r.id_rol=ur.id_rol
    join usuario_sistema us on us.id_usuario=ur.id_usuario
   where r.nombre_rol='GUARDIA_SEGURIDAD' and ur.estado_asignacion='ACTIVO' and us.estado_usuario='ACTIVO' limit 1;
  select id_punto_control into v_pc from punto_control where estado_punto='ACTIVO' limit 1;
  update guardia_punto_control set estado_asignacion='FINALIZADA' where id_usuario=v_uid;
  insert into guardia_punto_control(id_usuario,id_punto_control,turno,fecha_inicio,estado_asignacion,id_usuario_registro)
    values (v_uid,v_pc,'MATUTINO',now()-interval '10 days','ACTIVA',v_uid);
  v_in  := esta_en_turno_guardia(v_uid,(current_date::timestamp + time '08:00') at time zone 'America/Guayaquil');
  v_out := esta_en_turno_guardia(v_uid,(current_date::timestamp + time '23:00') at time zone 'America/Guayaquil');
  update guardia_punto_control set turno='NOCTURNO' where id_usuario=v_uid and estado_asignacion='ACTIVA';
  v_noc := esta_en_turno_guardia(v_uid,(current_date::timestamp + time '23:00') at time zone 'America/Guayaquil');
  assert v_in, '08:00 deberia estar en MATUTINO';
  assert not v_out, '23:00 NO deberia estar en MATUTINO';
  assert v_noc, '23:00 deberia estar en NOCTURNO (cruce de medianoche)';
end $$;

-- 6. Revocación de sesiones ---------------------------------------------------
do $$
declare v_uid uuid; v_sid uuid; v_estado text;
begin
  select id_usuario into v_uid from usuario_sistema where estado_usuario='ACTIVO' limit 1;
  insert into sesion(id_usuario,fecha_inicio,fecha_ultima_actividad,fecha_expiracion,estado_sesion)
    values (v_uid,now(),now(),now()+interval '1 hour','ACTIVA') returning id_sesion into v_sid;
  perform revocar_sesiones_usuario(v_uid,'CAMBIO_PASSWORD',null);
  select estado_sesion into v_estado from sesion where id_sesion=v_sid;
  assert v_estado = 'CERRADA_CAMBIO_PASSWORD', 'la sesion deberia quedar CERRADA_CAMBIO_PASSWORD';
end $$;

select 'TODAS LAS PRUEBAS PASARON' as resultado;

rollback;
