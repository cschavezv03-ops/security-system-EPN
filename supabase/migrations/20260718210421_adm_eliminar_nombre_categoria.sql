-- ADM · Se elimina categoria_persona.nombre_categoria.
--
-- Decisión del equipo tras revisar la ronda: la columna se va del todo, no solo de la
-- tabla de Categorías. Repetía el código en versión legible ("Docente" para DOCENTE), de
-- modo que era un dato mantenido a mano que podía desincronizarse del código al que
-- describía. Donde hacía de etiqueta corta, la interfaz usa ahora
-- `humanizar(codigo_categoria)`, que produce el mismo texto desde el catálogo que ya
-- existe (web/src/lib/catalogos.ts).
--
-- ORDEN IMPORTANTE: esta migración se aplica DESPUÉS de que producción sirva el frontend
-- que dejó de pedir la columna (commit 1f7c2c5, desplegado y comprobado por contenido en
-- el bundle). Al revés, la aplicación en vivo habría pedido una columna inexistente y las
-- pantallas de personas habrían roto: PostgREST responde 400 a un embed sobre una columna
-- que no existe.
--
-- El CHECK `categoria_nombre_no_vacio` (20260717020325) cae con la columna, que es lo
-- correcto: validaba justamente este campo. El DROP se hizo sin CASCADE a propósito: si
-- alguna vista hubiera dependido de la columna, habría fallado en vez de arrastrarla.

alter table public.categoria_persona
  drop column if exists nombre_categoria;

comment on column public.categoria_persona.codigo_categoria is
  'Código del catálogo. La interfaz lo muestra humanizado ("DOCENTE" → "Docente"); no existe una columna con el nombre legible, se deriva.';
