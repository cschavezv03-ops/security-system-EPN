-- scripts/smoke_test.sql
--
-- Ejercita el flujo completo sin frontend: crear persona -> registrar
-- biometria -> crear memorando -> simular evento en un punto de control ->
-- verificar que el evento y la alerta se registraron y que la vista de
-- vigencia responde correctamente. Tambien cubre el escenario vehicular
-- (D21/D22/D25) y los dos triggers de bloqueo (biometria de EXTERNA, DELETE
-- fisico).
--
-- Ejecutar contra la base LOCAL (con `supabase start` corriendo):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f scripts/smoke_test.sql
--
-- Requiere que supabase/seed.sql ya se haya ejecutado (usa el usuario admin
-- sembrado en §D13 como id_usuario_registro de las filas de prueba).
--
-- Corre como postgres (fuera de RLS), igual que seed.sql: el objetivo es
-- probar la logica de negocio (triggers, vistas), no las politicas RLS en si
-- (esas requieren un cliente autenticado real; ver scripts/edge_functions.http
-- para ejercitar el flujo via las Edge Functions con JWTs reales).
--
-- Todo corre en una transaccion que termina en ROLLBACK: se puede ejecutar
-- repetidamente sin dejar datos de prueba ni chocar con UNIQUE constraints.

begin;

do $$
declare
  v_id_categoria_docente uuid;
  v_id_categoria_visitante uuid;
  v_id_persona_interna uuid;
  v_id_persona_externa uuid;
  v_id_empresa uuid;
  v_id_memorando uuid;
  v_id_zona uuid;
  v_id_punto_control uuid;
  v_id_vehiculo uuid;
  v_id_regla uuid;
  v_id_evento_autorizado uuid;
  v_id_evento_denegado uuid;
  v_alerta_count integer;
  v_via_vigencia text;
  v_horas_dentro numeric;
  v_admin_user_id uuid := '00000000-0000-0000-0000-000000000002'; -- sembrado en seed.sql (§D13)
begin
  raise notice '=== Smoke test: Sistema de Seguridad EPN ===';

  select id_categoria into v_id_categoria_docente from public.categoria_persona where codigo_categoria = 'DOCENTE';
  select id_categoria into v_id_categoria_visitante from public.categoria_persona where codigo_categoria = 'VISITANTE';
  if v_id_categoria_docente is null or v_id_categoria_visitante is null then
    raise exception 'Categorias base no encontradas: ejecutar seed.sql primero';
  end if;
  if not exists (select 1 from public.usuario_sistema where id_usuario = v_admin_user_id) then
    raise exception 'Usuario administrador sembrado (§D13) no encontrado: ejecutar seed.sql primero';
  end if;

  -- 1. Zona / punto de control / regla de prueba (independientes del seed
  -- demo, para no interferir con guardia_punto_control ya sembrado).
  insert into public.zona (nombre_zona, tipo_zona, estado_zona)
  values ('Campus Smoke Test', 'CAMPUS', 'ACTIVA')
  returning id_zona into v_id_zona;

  insert into public.punto_control (id_zona, nombre_punto, estado_punto)
  values (v_id_zona, 'Garita Smoke Test', 'ACTIVO')
  returning id_punto_control into v_id_punto_control;

  -- Regla que cubre todo el dia, para no depender de la hora de ejecucion.
  insert into public.regla_acceso (
    nombre_regla, id_punto_control, id_categoria, requiere_memorando,
    horario_inicio, horario_fin, estado_regla
  ) values (
    'Regla smoke test - docente', v_id_punto_control, v_id_categoria_docente, false,
    '00:00:00', '23:59:59', 'ACTIVA'
  ) returning id_regla_acceso into v_id_regla;

  -- 2. Persona INTERNA (docente) + biometria vigente.
  insert into public.persona (tipo_persona, id_categoria, cedula, nombres, apellidos, correo, estado)
  values ('INTERNA', v_id_categoria_docente, '1700000001', 'Ana', 'Smoke Test', 'ana.smoke@epn.edu.ec', 'ACTIVO')
  returning id_persona into v_id_persona_interna;

  insert into public.registro_biometrico (id_persona, tipo_dato, path_storage, vigente)
  values (v_id_persona_interna, 'FACIAL', 'registro-biometrico/smoke-test/ana.jpg', true);

  -- 3. Persona EXTERNA + verificar que el trigger D20 bloquea su biometria.
  insert into public.persona (tipo_persona, id_categoria, cedula, nombres, apellidos, correo, estado)
  values ('EXTERNA', v_id_categoria_visitante, '1700000099', 'Externo', 'Prueba Trigger', 'externo.trigger@example.com', 'ACTIVO')
  returning id_persona into v_id_persona_externa;

  begin
    insert into public.registro_biometrico (id_persona, tipo_dato, path_storage, vigente)
    values (v_id_persona_externa, 'FACIAL', 'registro-biometrico/smoke-test/no-deberia-existir.jpg', true);
    raise exception 'FALLO: se permitio registrar biometria de una persona EXTERNA';
  exception
    when others then
      if sqlerrm not like '%No se puede registrar biometria%' then
        raise;
      end if;
      raise notice 'OK: trigger bloquea biometria de EXTERNA (%).', sqlerrm;
  end;

  -- 4. Empresa + memorando vigente para la persona EXTERNA.
  insert into public.empresa (nombre, estado)
  values ('Empresa Smoke Test S.A.', 'ACTIVO')
  returning id_empresa into v_id_empresa;

  insert into public.memorando (
    numero_memorando, id_empresa, fecha_inicio, fecha_fin, dependencia_autorizada,
    estado_memorando, id_usuario_registro
  ) values (
    'MEMO-SMOKE-0001', v_id_empresa, current_date - 1, current_date + 1, 'Direccion Administrativa',
    'VIGENTE', v_admin_user_id
  ) returning id_memorando into v_id_memorando;

  insert into public.persona_memorando (id_memorando, id_persona, estado_acceso)
  values (v_id_memorando, v_id_persona_externa, 'ACTIVO');

  -- 5. vista_vigencia_acceso debe responder correctamente para ambas.
  select via_vigencia into v_via_vigencia
    from public.vista_vigencia_acceso where id_persona = v_id_persona_interna;
  if v_via_vigencia is distinct from 'INTERNA_ACTIVA' then
    raise exception 'FALLO: vista_vigencia_acceso no marco INTERNA_ACTIVA para la persona interna (obtuvo %)', v_via_vigencia;
  end if;
  raise notice 'OK: vista_vigencia_acceso = INTERNA_ACTIVA para persona interna.';

  select via_vigencia into v_via_vigencia
    from public.vista_vigencia_acceso where id_persona = v_id_persona_externa;
  if v_via_vigencia is distinct from 'MEMORANDO' then
    raise exception 'FALLO: vista_vigencia_acceso no marco MEMORANDO para la persona externa (obtuvo %)', v_via_vigencia;
  end if;
  raise notice 'OK: vista_vigencia_acceso = MEMORANDO para persona externa.';

  -- 6. evento_acceso AUTORIZADO (interna, via biometria) -> sin alerta (D4:
  -- solo los eventos DENEGADO generan alerta automatica).
  insert into public.evento_acceso (
    id_persona, id_punto_control, tipo_movimiento, resultado, origen_registro, id_regla_acceso
  ) values (
    v_id_persona_interna, v_id_punto_control, 'INGRESO', 'AUTORIZADO', 'AUTOMATICA', v_id_regla
  ) returning id_evento into v_id_evento_autorizado;

  select count(*) into v_alerta_count from public.alerta_seguridad where id_evento = v_id_evento_autorizado;
  if v_alerta_count <> 0 then
    raise exception 'FALLO: un evento AUTORIZADO genero % alerta(s), deberia generar 0', v_alerta_count;
  end if;
  raise notice 'OK: evento AUTORIZADO no genero alerta.';

  -- 7. evento_acceso DENEGADO -> SI debe generar alerta automatica (trigger).
  insert into public.evento_acceso (
    id_persona, id_punto_control, tipo_movimiento, resultado, motivo_resultado, origen_registro
  ) values (
    v_id_persona_externa, v_id_punto_control, 'INGRESO', 'DENEGADO', 'Memorando vencido para esta prueba', 'MANUAL'
  ) returning id_evento into v_id_evento_denegado;

  select count(*) into v_alerta_count from public.alerta_seguridad where id_evento = v_id_evento_denegado;
  if v_alerta_count <> 1 then
    raise exception 'FALLO: un evento DENEGADO genero % alerta(s), deberia generar exactamente 1', v_alerta_count;
  end if;
  raise notice 'OK: evento DENEGADO genero % alerta(s) automaticamente.', v_alerta_count;

  -- 8. Escenario vehicular (D21/D22/D25): conductor interno ingresa con
  -- vehiculo -> debe aparecer en vista_vehiculos_dentro hasta que salga.
  insert into public.vehiculo (placa, tipo_vehiculo, estado_vehiculo, id_usuario_registro)
  values ('SMK-0001', 'AUTOMOVIL', 'ACTIVO', v_admin_user_id)
  returning id_vehiculo into v_id_vehiculo;

  insert into public.evento_acceso (
    id_persona, id_vehiculo, id_punto_control, tipo_movimiento, resultado, origen_registro,
    id_regla_acceso, es_conductor
  ) values (
    v_id_persona_interna, v_id_vehiculo, v_id_punto_control, 'INGRESO', 'AUTORIZADO', 'AUTOMATICA',
    v_id_regla, true
  );

  select horas_dentro into v_horas_dentro from public.vista_vehiculos_dentro where id_vehiculo = v_id_vehiculo;
  if v_horas_dentro is null then
    raise exception 'FALLO: vista_vehiculos_dentro no encontro el vehiculo recien ingresado';
  end if;
  raise notice 'OK: vista_vehiculos_dentro reporta % horas dentro para el vehiculo de prueba.', v_horas_dentro;

  insert into public.evento_acceso (
    id_persona, id_vehiculo, id_punto_control, tipo_movimiento, resultado, origen_registro, es_conductor
  ) values (
    v_id_persona_interna, v_id_vehiculo, v_id_punto_control, 'SALIDA', 'AUTORIZADO', 'AUTOMATICA', true
  );

  if exists (select 1 from public.vista_vehiculos_dentro where id_vehiculo = v_id_vehiculo) then
    raise exception 'FALLO: el vehiculo sigue apareciendo en vista_vehiculos_dentro despues de la SALIDA';
  end if;
  raise notice 'OK: vista_vehiculos_dentro ya no incluye el vehiculo tras la SALIDA.';

  -- 9. Bloqueo de DELETE fisico (bloque 5): debe fallar siempre.
  begin
    delete from public.persona where id_persona = v_id_persona_interna;
    raise exception 'FALLO: se permitio un DELETE fisico sobre persona';
  exception
    when others then
      if sqlerrm not like '%DELETE fisico prohibido%' then
        raise;
      end if;
      raise notice 'OK: DELETE fisico bloqueado (%).', sqlerrm;
  end;

  raise notice '=== Smoke test OK: todas las verificaciones pasaron ===';
end $$;

rollback;
