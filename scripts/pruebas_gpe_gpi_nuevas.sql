-- Pruebas de las migraciones de la ronda GPE/GPI.
--
--   psql "$DATABASE_URL" -f scripts/pruebas_gpe_gpi_nuevas.sql
--
-- Todo ocurre dentro de una transacción que termina en ROLLBACK: no deja rastro salvo las
-- filas de auditoría que escriben los triggers. La última sentencia falla a propósito, con
-- el resumen de resultados como mensaje — es la forma de deshacer los INSERT de prueba
-- garantizando que no quedan datos sueltos si alguien interrumpe el script a medias.

begin;

-- ---------------------------------------------------------------------------
-- Parte 1: funciones de estado efectivo (GPE §2 y §8)
-- ---------------------------------------------------------------------------
-- Lo que se comprueba aquí es el bug que reportó el equipo: un memorando cuya fecha_fin ya
-- pasó tiene que leerse como VENCIDO aunque la columna almacenada siga diciendo VIGENTE.

create temp table resultado(caso text, ok boolean);

insert into resultado
select 'memorando vencido se muestra como vencido',
       public.estado_memorando_efectivo('VIGENTE', current_date - 10, current_date - 1) = 'VENCIDO'
union all
select 'fecha_fin es inclusiva: el ultimo dia sigue vigente (§D24)',
       public.estado_memorando_efectivo('VIGENTE', current_date - 5, current_date) = 'VIGENTE'
union all
select 'memorando futuro queda programado',
       public.estado_memorando_efectivo('VIGENTE', current_date + 5, current_date + 10) = 'PROGRAMADO'
union all
select 'la anulacion gana sobre las fechas',
       public.estado_memorando_efectivo('ANULADO', current_date - 1, current_date + 30) = 'ANULADO'
union all
select 'visita de hoy vigente',
       public.estado_autorizacion_efectivo('VIGENTE', current_date) = 'VIGENTE'
union all
select 'visita de ayer caducada',
       public.estado_autorizacion_efectivo('VIGENTE', current_date - 1) = 'CADUCADA'
union all
select 'visita futura programada',
       public.estado_autorizacion_efectivo('VIGENTE', current_date + 3) = 'PROGRAMADA'
union all
select 'revocada sigue revocada aunque sea de hoy',
       public.estado_autorizacion_efectivo('REVOCADA', current_date) = 'REVOCADA'
union all
select 'numero de memorando institucional valido',
       public.es_numero_memorando('EPN-DA-2026-0001-M')
union all
select 'numero de memorando sin digitos rechazado',
       not public.es_numero_memorando('MEMORANDO')
union all
select 'numero de memorando demasiado corto rechazado',
       not public.es_numero_memorando('M1')
union all
select 'numero de memorando con simbolos raros rechazado',
       not public.es_numero_memorando('MEM#2026*01');

\echo 'Parte 1 — funciones de estado efectivo:'
select caso, case when ok then 'OK' else 'FALLO' end as resultado from resultado order by ok, caso;

-- ---------------------------------------------------------------------------
-- Parte 2: los CHECK y triggers rechazan lo que tienen que rechazar
-- ---------------------------------------------------------------------------
-- Cada caso captura su propia excepción: si un INSERT que debería fallar pasa, el mensaje
-- lo dice explícitamente en vez de dejar el dato dentro.

do $$
declare
  v_cat_doc uuid;
  v_cat_est uuid;
  v_emp uuid;
  v_usr uuid;
  v_persona uuid;
  v_vehiculo uuid;
  r text := '';
begin
  select id_categoria into v_cat_doc from categoria_persona where codigo_categoria = 'DOCENTE';
  select id_categoria into v_cat_est from categoria_persona where codigo_categoria = 'ESTUDIANTE';
  select id_empresa into v_emp from empresa limit 1;
  select id_usuario into v_usr from usuario_sistema limit 1;

  -- GPI: "Verificar que la fecha de nacimiento no sea mayor a la fecha actual".
  begin
    insert into persona(tipo_persona, id_categoria, cedula, nombres, apellidos, correo, fecha_nacimiento)
    values ('INTERNA', v_cat_doc, '1710034065', 'Prueba', 'Futura', 'prueba.futura@epn.edu.ec', current_date + 1);
    r := r || E'FALLO: acepto una fecha de nacimiento futura\n';
  exception when check_violation then
    r := r || E'OK: rechaza fecha de nacimiento futura\n';
  end;

  -- GPI: "el campo de Código Único solo es utilizado por los estudiantes".
  begin
    insert into persona(tipo_persona, id_categoria, cedula, nombres, apellidos, correo, codigo_unico)
    values ('INTERNA', v_cat_doc, '1710034065', 'Prueba', 'Codigo', 'prueba.codigo@epn.edu.ec', '999888777');
    r := r || E'FALLO: acepto codigo unico en un docente\n';
  exception when others then
    r := r || E'OK: rechaza codigo unico fuera de estudiante\n';
  end;

  -- GPI: contrato pasa de texto libre a catálogo. El dato sembrado decía "Si".
  begin
    insert into persona(tipo_persona, id_categoria, cedula, nombres, apellidos, correo)
    values ('INTERNA', v_cat_doc, '1710034065', 'Prueba', 'Contrato', 'prueba.contrato@epn.edu.ec')
    returning id_persona into v_persona;
    insert into persona_interna_detalle(id_persona, contrato) values (v_persona, 'Si');
    r := r || E'FALLO: acepto el contrato "Si"\n';
  exception when check_violation then
    r := r || E'OK: rechaza contrato fuera de FIJO/TEMPORAL\n';
  end;

  -- Ultimos_Cambios_GPI: el docente ya no usa Cargo ni Nombramiento.
  begin
    insert into persona(tipo_persona, id_categoria, cedula, nombres, apellidos, correo)
    values ('INTERNA', v_cat_doc, '1710034065', 'Prueba', 'Cargo', 'prueba.cargo@epn.edu.ec')
    returning id_persona into v_persona;
    insert into persona_interna_detalle(id_persona, cargo) values (v_persona, 'Docente titular');
    r := r || E'FALLO: acepto Cargo para un docente\n';
  exception when check_violation then
    r := r || E'OK: rechaza Cargo para un docente\n';
  end;

  begin
    insert into persona(tipo_persona, id_categoria, cedula, nombres, apellidos, correo)
    values ('INTERNA', v_cat_doc, '1710034065', 'Prueba', 'Nombramiento', 'prueba.nombramiento@epn.edu.ec')
    returning id_persona into v_persona;
    insert into persona_interna_detalle(id_persona, nombramiento) values (v_persona, 'Definitivo');
    r := r || E'FALLO: acepto Nombramiento para un docente\n';
  exception when check_violation then
    r := r || E'OK: rechaza Nombramiento para un docente\n';
  end;

  -- Estudiante CEC = Curso; estudiante EPN = Carrera.
  begin
    insert into persona(tipo_persona, id_categoria, cedula, nombres, apellidos, correo, codigo_unico)
    values ('INTERNA', v_cat_est, '1710034065', 'Prueba', 'CEC', 'prueba.cec@cec.edu.ec', 'GPI-TEST-CEC')
    returning id_persona into v_persona;
    insert into persona_interna_detalle(id_persona, unidad, carrera)
    values (v_persona, 'CEC', 'Sistemas');
    r := r || E'FALLO: acepto Carrera para un estudiante CEC\n';
  exception when check_violation then
    r := r || E'OK: rechaza Carrera para un estudiante CEC\n';
  end;

  begin
    insert into persona(tipo_persona, id_categoria, cedula, nombres, apellidos, correo, codigo_unico)
    values ('INTERNA', v_cat_est, '1710034065', 'Prueba', 'EPN', 'prueba.epn@epn.edu.ec', 'GPI-TEST-EPN')
    returning id_persona into v_persona;
    insert into persona_interna_detalle(id_persona, unidad, curso)
    values (v_persona, 'EPN', 'Robotica');
    r := r || E'FALLO: acepto Curso para un estudiante EPN\n';
  exception when check_violation then
    r := r || E'OK: rechaza Curso para un estudiante EPN\n';
  end;

  -- Toda nueva relacion persona-vehiculo debe tener fecha_fin.
  begin
    insert into persona(tipo_persona, id_categoria, cedula, nombres, apellidos, correo)
    values ('INTERNA', v_cat_doc, '1710034065', 'Prueba', 'Vehiculo', 'prueba.vehiculo@epn.edu.ec')
    returning id_persona into v_persona;
    insert into vehiculo(placa, tipo_vehiculo, id_usuario_registro)
    values ('TST9090', 'AUTOMOVIL', v_usr)
    returning id_vehiculo into v_vehiculo;
    insert into persona_vehiculo(
      id_persona, id_vehiculo, tipo_relacion, fecha_inicio, id_usuario_registro
    ) values (
      v_persona, v_vehiculo, 'PROPIETARIO', current_date, v_usr
    );
    r := r || E'FALLO: acepto una relacion vehicular sin fecha_fin\n';
  exception when not_null_violation then
    r := r || E'OK: exige fecha_fin en una relacion vehicular nueva\n';
  end;

  -- GPE §3: el número lo teclea una persona, así que la base tiene que validarlo.
  begin
    insert into memorando(numero_memorando, id_empresa, fecha_inicio, fecha_fin, id_usuario_registro)
    values ('MEMORANDO', v_emp, current_date, current_date + 5, v_usr);
    r := r || E'FALLO: acepto un numero de memorando sin digitos\n';
  exception when check_violation then
    r := r || E'OK: rechaza numero de memorando sin digitos\n';
  end;

  -- Anular es una decisión: sin motivo no queda constancia de por qué se retiró el acceso.
  begin
    insert into memorando(numero_memorando, id_empresa, fecha_inicio, fecha_fin, id_usuario_registro, estado_memorando)
    values ('EPN-TEST-2026-0001', v_emp, current_date, current_date + 5, v_usr, 'ANULADO');
    r := r || E'FALLO: acepto una anulacion sin motivo\n';
  exception when check_violation then
    r := r || E'OK: exige motivo al anular\n';
  end;

  -- Dos memorandos con el mismo número serían indistinguibles para el guardia.
  begin
    insert into memorando(numero_memorando, id_empresa, fecha_inicio, fecha_fin, id_usuario_registro)
    values ('EPN-DA-2026-0001-M', v_emp, current_date, current_date + 5, v_usr);
    r := r || E'FALLO: acepto un numero de memorando repetido\n';
  exception when unique_violation then
    r := r || E'OK: rechaza numero de memorando repetido\n';
  end;

  raise notice E'\nParte 2 — restricciones:\n%', r;
end $$;

rollback;
