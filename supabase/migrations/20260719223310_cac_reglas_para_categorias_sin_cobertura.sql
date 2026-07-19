-- RF-CA-004: "Cada categoria utiliza la regla de acceso que le ha sido asignada", y los
-- ejemplos que da el requisito son Docente, Administrativo, Estudiante, Contratista y
-- Visitante. RF-CA-005 remata: sin regla, el ingreso se rechaza.
--
-- Estado real antes de esta migracion: de las 9 categorias, solo ESTUDIANTE, TRABAJADOR,
-- VISITANTE y CONTRATISTA tenian regla activa. DOCENTE (6 personas) y ADMINISTRATIVO (6)
-- estaban descubiertas, y las unicas reglas que las nombraban estaban INACTIVAS. Con la
-- cadena de validacion aplicada como manda RF-CA-019, ningun docente ni ningun
-- administrativo podia entrar al campus. No se noto antes porque la validacion antigua
-- mezclaba las tres condiciones en una consulta y devolvia siempre "fuera de horario": el
-- hueco de datos se leia como un problema de horarios.
--
-- Las reglas nuevas NO se atan a ninguna garita (sin filas en regla_acceso_punto_control),
-- asi que aplican en todos los puntos de control. Es lo correcto para una categoria general:
-- restringir garitas es la excepcion, no la norma.

insert into public.regla_acceso
  (nombre_regla, id_categoria, horario_inicio, horario_fin, requiere_memorando, estado_regla, descripcion)
select v.nombre, c.id_categoria, v.inicio::time, v.fin::time, v.memorando, 'ACTIVA', v.descripcion
  from (values
    ('ACCESO_DOCENTES',
     'DOCENTE', '05:30', '23:00', false,
     'Ingreso ordinario del personal docente. La franja cubre desde la preparacion de la primera clase hasta el cierre de la jornada nocturna.'),
    ('ACCESO_ADMINISTRATIVOS',
     'ADMINISTRATIVO', '06:00', '20:00', false,
     'Ingreso ordinario del personal administrativo, en horario de oficina ampliado.'),
    ('ACCESO_EMPRESAS_DE_SERVICIO',
     'EMPRESA_SERVICIO', '06:00', '18:00', false,
     'Ingreso del personal de empresas de servicio contratadas (limpieza, mantenimiento, alimentacion).'),
    ('ACCESO_CONDUCTORES_EXTERNOS',
     'CONDUCTOR', '06:00', '20:00', true,
     'Ingreso de conductores externos que entregan o retiran material. Exige memorando: es personal ajeno a la institucion.'),
    ('ACCESO_PROVEEDORES',
     'PROVEEDOR', '08:00', '17:00', true,
     'Ingreso de proveedores en horario de recepcion de bodega. Exige memorando de la dependencia que los convoca.')
  ) as v(nombre, categoria, inicio, fin, memorando, descripcion)
  join public.categoria_persona c on c.codigo_categoria = v.categoria
 where not exists (
   select 1 from public.regla_acceso r
    where r.id_categoria = c.id_categoria
      and r.estado_regla = 'ACTIVA'
 );

-- ---------------------------------------------------------------------------
-- Para que este agujero se vea antes de que alguien se quede fuera de la garita
-- ---------------------------------------------------------------------------
-- Una categoria sin regla activa no da ningun error hasta que una persona de esa categoria
-- llega a la puerta y se le deniega el paso. La vista lo pone delante de CAC, que es quien
-- puede arreglarlo, en vez de dejarlo para que lo descubra un guardia a las siete de la
-- mañana.
create or replace view public.vista_categoria_sin_regla as
  select c.id_categoria,
         c.codigo_categoria,
         c.ambito,
         count(p.id_persona) as personas_afectadas
    from public.categoria_persona c
    left join public.persona p
      on p.id_categoria = c.id_categoria
     and p.estado = 'ACTIVO'
   where not exists (
     select 1 from public.regla_acceso r
      where r.id_categoria = c.id_categoria
        and r.estado_regla = 'ACTIVA'
   )
   group by c.id_categoria, c.codigo_categoria, c.ambito;

comment on view public.vista_categoria_sin_regla is
  'RF-CA-004/005: categorias sin ninguna regla de acceso activa. Sus personas seran rechazadas en la garita.';

alter view public.vista_categoria_sin_regla set (security_invoker = true);
