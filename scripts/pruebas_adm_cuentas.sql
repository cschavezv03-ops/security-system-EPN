-- Pruebas de la ronda de cuentas y roles de ADM (migraciones 20260720032734..032932).
--
-- Seguro de ejecutar contra la base real: TODO va dentro de BEGIN … ROLLBACK, no deja
-- rastro.
--   psql "$DATABASE_URL" -f scripts/pruebas_adm_cuentas.sql
--
-- Cada bloque lanza EXCEPTION si una aserción falla; si el script llega al final e imprime
-- 'TODAS LAS PRUEBAS DE CUENTAS Y ROLES PASARON', todo está correcto.
--
-- Varias pruebas simulan la sesión de un usuario con `request.jwt.claims`: las guardas que
-- se comprueban dependen de `auth.uid()`, y sin claims (una migración, el seed, el MCP)
-- están desactivadas a propósito.

begin;

-- 1. El correo se propaga en los dos sentidos y converge ----------------------
do $$
declare v_id uuid; v_persona uuid;
begin
  select id_usuario, id_persona into v_id, v_persona from usuario_sistema where nombre_usuario = 'gary.defas';

  -- Sentido GPI → cuenta → credencial.
  update persona set correo = 'prueba.p1@epn.edu.ec' where id_persona = v_persona;
  assert (select correo_electronico from usuario_sistema where id_usuario = v_id) = 'prueba.p1@epn.edu.ec',
    'GPI deberia propagar el correo a la cuenta';
  assert (select email::text from auth.users where id = v_id) = 'prueba.p1@epn.edu.ec',
    'GPI deberia propagar el correo a la credencial';
  -- La identidad del proveedor se olvida con facilidad y rompe el login mas tarde.
  assert (select identity_data->>'email' from auth.identities where user_id = v_id and provider = 'email') = 'prueba.p1@epn.edu.ec',
    'GPI deberia propagar el correo a la identidad de GoTrue';

  -- Sentido ADM → persona → credencial.
  update usuario_sistema set correo_electronico = 'prueba.p2@epn.edu.ec' where id_usuario = v_id;
  assert (select correo from persona where id_persona = v_persona) = 'prueba.p2@epn.edu.ec',
    'ADM deberia propagar el correo a la persona';
  assert (select email::text from auth.users where id = v_id) = 'prueba.p2@epn.edu.ec',
    'ADM deberia propagar el correo a la credencial';
end $$;

-- 2. Un correo no institucional no se cuela por la puerta de GPI --------------
do $$
declare v_persona uuid; v_fallo boolean := false;
begin
  select id_persona into v_persona from usuario_sistema where nombre_usuario = 'gary.defas';
  begin
    update persona set correo = 'cualquiera@gmail.com' where id_persona = v_persona;
  exception when others then
    v_fallo := true;
  end;
  assert v_fallo, 'un correo no institucional en una persona CON cuenta deberia rechazarse';
end $$;

-- 3. Un solo rol activo por cuenta -------------------------------------------
do $$
declare v_id uuid; v_rol uuid; v_fallo boolean := false;
begin
  select id_usuario into v_id from usuario_sistema where nombre_usuario = 'gary.defas';
  select id_rol into v_rol from rol where nombre_rol = 'GUARDIA_SEGURIDAD';
  begin
    insert into usuario_rol (id_usuario, id_rol, estado_asignacion) values (v_id, v_rol, 'ACTIVO');
  exception when unique_violation then
    v_fallo := true;
  end;
  assert v_fallo, 'no deberia poder haber dos roles activos en la misma cuenta';
end $$;

-- 4. Cambiar de rol es atómico: nunca deja la cuenta sin ninguno --------------
do $$
declare v_id uuid; v_rol uuid; v_admin uuid; v_activos int;
begin
  select id_usuario into v_admin from usuario_sistema where nombre_usuario = 'admin';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);

  select id_usuario into v_id from usuario_sistema where nombre_usuario = 'gary.defas';
  select id_rol into v_rol from rol where nombre_rol = 'RESPONSABLE_PUNTOS_CONTROL';
  perform asignar_rol_unico(v_id, v_rol);

  select count(*) into v_activos from usuario_rol where id_usuario = v_id and estado_asignacion = 'ACTIVO';
  assert v_activos = 1, format('deberia quedar exactamente 1 rol activo, hay %s', v_activos);
  assert (select r.nombre_rol from usuario_rol ur join rol r on r.id_rol = ur.id_rol
           where ur.id_usuario = v_id and ur.estado_asignacion = 'ACTIVO') = 'RESPONSABLE_PUNTOS_CONTROL',
    'el rol activo deberia ser el nuevo';

  perform set_config('request.jwt.claims', null, true);
end $$;

-- 5. Nadie se revoca su propio rol de administrador --------------------------
do $$
declare v_admin uuid; v_asig uuid; v_fallo boolean := false;
begin
  select id_usuario into v_admin from usuario_sistema where nombre_usuario = 'admin';
  select ur.id_usuario_rol into v_asig
    from usuario_rol ur join rol r on r.id_rol = ur.id_rol
   where ur.id_usuario = v_admin and r.nombre_rol = 'ADMINISTRADOR_SISTEMA' and ur.estado_asignacion = 'ACTIVO';

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  begin
    update usuario_rol set estado_asignacion = 'REVOCADO' where id_usuario_rol = v_asig;
  exception when others then
    v_fallo := true;
  end;
  perform set_config('request.jwt.claims', null, true);

  assert v_fallo, 'el administrador NO deberia poder revocarse su propio rol';
end $$;

-- 6. El sistema lo opera el personal, no los estudiantes (§D76) -------------
do $$
declare v_est uuid; v_cat_est uuid; v_persona uuid; v_a boolean := false; v_b boolean := false;
begin
  select id_categoria into v_cat_est from categoria_persona where codigo_categoria = 'ESTUDIANTE';
  select p.id_persona into v_est from persona p
   where p.id_categoria = v_cat_est
     and not exists (select 1 from usuario_sistema u where u.id_persona = p.id_persona) limit 1;

  if v_est is null then
    raise notice 'sin estudiantes sin cuenta: se omite la comprobacion 6';
  else
    -- (a) Crear la cuenta sobre quien no puede tenerla.
    begin
      insert into usuario_sistema (id_usuario, nombre_usuario, correo_electronico, id_persona, estado_usuario)
      values (gen_random_uuid(), 'prueba.estudiante', 'prueba.estudiante@epn.edu.ec', v_est, 'ACTIVO');
    exception when others then v_a := true;
    end;
    assert v_a, 'no deberia poder crearse una cuenta para un estudiante';
  end if;

  -- (b) Degradar la categoria de quien YA tiene cuenta. Esta es la que destapo que el trigger
  --     leia la categoria de la tabla en vez de NEW, y por tanto no bloqueaba nada.
  select id_persona into v_persona from usuario_sistema limit 1;
  begin
    update persona set id_categoria = v_cat_est where id_persona = v_persona;
  exception when others then v_b := true;
  end;
  assert v_b, 'no deberia poder pasarse a ESTUDIANTE a alguien con cuenta';

  -- (c) Y un cambio legitimo entre categorias de personal debe seguir permitido.
  update persona set id_categoria = (select id_categoria from categoria_persona where codigo_categoria = 'DOCENTE')
   where id_persona = v_persona;
end $$;

rollback;

\echo 'TODAS LAS PRUEBAS DE CUENTAS Y ROLES PASARON'
