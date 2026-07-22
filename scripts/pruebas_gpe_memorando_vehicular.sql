-- Ingreso vehicular del personal externo con memorando (GPE + CAC).
--
--   psql "$DATABASE_URL" -f scripts/pruebas_gpe_memorando_vehicular.sql
--
-- Todo ocurre dentro de una transacción que termina en ROLLBACK. La última sentencia falla a
-- propósito, con el resumen como mensaje: es la forma de deshacer los INSERT garantizando que
-- no queda nada si alguien interrumpe el script a medias.
--
-- Se simula la sesión del responsable de Personal Externo porque las RPC son SECURITY INVOKER:
-- ejecutarlas como superusuario probaría algo distinto de lo que hace la aplicación.

begin;

do $$
declare
  v_uid uuid;
  v_emp uuid;
  v_persona uuid;
  v_otra uuid;
  v_res jsonb;
  v_veh uuid;
  v_mem uuid;
  r text := '';
begin
  select id into v_uid from auth.users where email = 'joel.velastegui@epn.edu.ec';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select id_empresa into v_emp from public.empresa where estado = 'ACTIVO' limit 1;
  select id_persona into v_persona from public.persona
   where tipo_persona = 'EXTERNA' and estado = 'ACTIVO' limit 1;
  select id_persona into v_otra from public.persona
   where tipo_persona = 'EXTERNA' and estado = 'ACTIVO' and id_persona <> v_persona limit 1;

  -- 1. El alta crea memorando, vehículo y responsable de una vez -----------------------
  v_res := public.crear_memorando_con_vehiculo(
    p_numero_memorando := 'EPN-PRUEBA-2026-9001',
    p_id_empresa := v_emp,
    p_fecha_inicio := public.hoy_ecuador(),
    p_fecha_fin := public.hoy_ecuador() + 10,
    p_permite_vehiculo := true,
    p_permite_acompanantes := true,
    p_id_persona_responsable := v_persona,
    p_tipo_vehiculo := 'CAMIONETA',
    p_placa := 'TBX-9087',
    p_marca := 'Mazda', p_modelo := 'BT-50', p_color := 'Rojo');
  v_veh := (v_res -> 'vehiculo' ->> 'id_vehiculo')::uuid;
  v_mem := (v_res ->> 'id_memorando')::uuid;
  r := r || E'OK: memorando + vehiculo + responsable en una transaccion\n';

  -- El vehículo no puede quedar sin propietario (RF-CA-018): el trigger diferido lo habría
  -- impedido al cerrar la transacción, así que llegar hasta aquí ya lo demuestra.
  if exists (select 1 from public.persona_vehiculo
              where id_vehiculo = v_veh and tipo_relacion = 'PROPIETARIO' and estado_relacion = 'ACTIVA')
    then r := r || E'OK: el vehiculo nace con propietario\n';
    else r := r || E'FALLO: vehiculo sin propietario\n'; end if;

  -- Y quien conduce queda amparado por el memorando sin tener que vincularlo aparte.
  if exists (select 1 from public.persona_memorando
              where id_memorando = v_mem and id_persona = v_persona and estado_acceso = 'ACTIVO')
    then r := r || E'OK: el responsable queda vinculado al memorando\n';
    else r := r || E'FALLO: el responsable no quedo vinculado\n'; end if;

  -- 2. El segundo factor del externo ---------------------------------------------------
  if public.vehiculo_amparado_por_memorando(v_persona, v_veh)
    then r := r || E'OK: el memorando ampara a su responsable con ese vehiculo\n';
    else r := r || E'FALLO: no reconocio el amparo\n'; end if;

  -- Un tercero, aunque tenga su propio memorando, no entra con ESTE coche.
  if not public.vehiculo_amparado_por_memorando(v_otra, v_veh)
    then r := r || E'OK: no ampara a quien no esta en el memorando\n';
    else r := r || E'FALLO: amparo a un tercero\n'; end if;

  -- 3. Lo que ve la garita al leer la placa --------------------------------------------
  if (select count(*) from public.memorandos_vigentes_de_vehiculo(v_veh)) = 1
    then r := r || E'OK: la garita ve el memorando desde la placa\n';
    else r := r || E'FALLO: la garita no ve el memorando\n'; end if;

  -- 4. El permiso del vehículo caduca con el memorando ---------------------------------
  -- Esto es lo que justifica colgar el vehículo del memorando y no de la persona: nadie
  -- tiene que acordarse de revocar nada.
  update public.memorando
     set fecha_inicio = public.hoy_ecuador() - 5, fecha_fin = public.hoy_ecuador() - 1
   where id_memorando = v_mem;

  if not public.vehiculo_amparado_por_memorando(v_persona, v_veh)
    then r := r || E'OK: al vencer el memorando cae el permiso del vehiculo\n';
    else r := r || E'FALLO: seguia amparando con el memorando vencido\n'; end if;

  if (select count(*) from public.memorandos_vigentes_de_vehiculo(v_veh)) = 0
    then r := r || E'OK: la garita deja de verlo cuando vence\n';
    else r := r || E'FALLO: la garita seguia viendolo vencido\n'; end if;

  -- Y al anularlo, igual, aunque las fechas sigan corriendo.
  update public.memorando
     set fecha_inicio = public.hoy_ecuador(), fecha_fin = public.hoy_ecuador() + 10,
         estado_memorando = 'ANULADO', motivo_anulacion = 'Prueba automatica',
         fecha_anulacion = now()
   where id_memorando = v_mem;

  if not public.vehiculo_amparado_por_memorando(v_persona, v_veh)
    then r := r || E'OK: un memorando anulado no ampara el vehiculo\n';
    else r := r || E'FALLO: el memorando anulado seguia amparando\n'; end if;

  raise notice E'\n%', r;
  raise exception 'ROLLBACK intencionado: %', r;
end $$;

rollback;
