-- ADM · Categorías de persona: descripción propia.
--
-- Pedido del equipo (Requerimientos_ADM): "identificar si la categoría corresponde a la
-- parte Interna o Externa; retirar la columna Nombre e implementar una descripción de la
-- categoría."
--
-- El ámbito ya existía (`ambito`), lo que faltaba era decir QUÉ es cada categoría. Hasta
-- ahora `nombre_categoria` repetía el código en versión legible ("Docente" para DOCENTE):
-- una columna que no aportaba nada en la tabla. Se conserva en la base porque otras
-- pantallas la usan como etiqueta corta, pero la que se muestra en ADM pasa a ser esta.

alter table public.categoria_persona
  add column if not exists descripcion text;

update public.categoria_persona set descripcion = v.descripcion
from (values
  ('DOCENTE',          'Personal docente de la Politécnica con nombramiento o contrato vigente.'),
  ('ESTUDIANTE',       'Estudiante matriculado en una carrera o programa de la Politécnica.'),
  ('ADMINISTRATIVO',   'Personal administrativo de las unidades y dependencias de la Politécnica.'),
  ('TRABAJADOR',       'Personal de servicios y mantenimiento con relación laboral directa con la Politécnica.'),
  ('EMPRESA_SERVICIO', 'Personal de empresas contratadas que presta servicios de forma permanente dentro del campus. Se trata como ámbito interno por su permanencia (§D20).'),
  ('VISITANTE',        'Persona sin vínculo con la Politécnica que ingresa de forma puntual y autorizada.'),
  ('PROVEEDOR',        'Persona que ingresa a entregar bienes o insumos a una unidad de la Politécnica.'),
  ('CONTRATISTA',      'Personal de una empresa contratada para una obra o un servicio con plazo definido.'),
  ('CONDUCTOR',        'Conductor de una empresa de transporte o de servicio externo que ingresa con vehículo.')
) as v(codigo, descripcion)
where public.categoria_persona.codigo_categoria = v.codigo;

-- Ninguna categoría puede quedarse sin explicar: es la columna que sustituye a "Nombre"
-- en la pantalla, así que si viniera vacía la tabla se vería con un hueco.
alter table public.categoria_persona
  alter column descripcion set not null;

alter table public.categoria_persona
  drop constraint if exists categoria_descripcion_no_vacia;

alter table public.categoria_persona
  add constraint categoria_descripcion_no_vacia
  check (btrim(descripcion) <> '');

comment on column public.categoria_persona.descripcion is
  'Qué personas agrupa la categoría. Se muestra en ADM en lugar de nombre_categoria.';
