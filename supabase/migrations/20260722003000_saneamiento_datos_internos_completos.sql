-- Segunda parte del saneamiento: los datos internos de cada persona (cargo, unidad, contrato).
--
-- De las 19 personas internas, solo 5 tenían ficha en `persona_interna_detalle`: la pantalla
-- "Datos internos" de GPI mostraba cinco filas y el resto del personal aparecía sin cargo ni
-- unidad, incluidos los responsables de los módulos y los guardias. Se completa la ficha de todos,
-- con cargos coherentes con el rol que cada uno tiene en el sistema.
--
-- De paso se corrigen dos fichas que contradicen la regla que GPI pidió en su última ronda
-- (`validar_campos_detalle_persona_interna`): un docente se describe con su categoría de
-- escalafón, no con un cargo, y dos docentes tenían "Titular" escrito en Cargo.

-- Los datos internos no se auditan como una acción de usuario: es la misma corrección masiva.
alter table public.persona_interna_detalle disable trigger trg_bitacora_persona_interna_detalle;

-- ---------------------------------------------------------------------------
-- Fichas que faltaban
-- ---------------------------------------------------------------------------
insert into public.persona_interna_detalle (id_persona, unidad, cargo, contrato)
values
  -- Administrativos (unidad EPN; el cargo describe lo que hacen en el sistema).
  ('b9127392-5b7d-4d5b-b74b-08ea5b58fad5', 'EPN', 'Analista de Control de Accesos', 'FIJO'),
  ('00000000-0000-0000-0000-0000000000a2', 'EPN', 'Analista de Talento Humano', 'FIJO'),
  ('00000000-0000-0000-0000-0000000000a5', 'EPN', 'Analista de Control de Accesos', 'FIJO'),
  ('00000000-0000-0000-0000-0000000000a1', 'EPN', 'Director Administrativo', 'FIJO'),
  ('00000000-0000-0000-0000-000000000001', 'EPN', 'Administrador de Sistemas de Información', 'FIJO'),
  ('00000000-0000-0000-0000-0000000000a4', 'EPN', 'Analista de Infraestructura Física', 'FIJO'),
  ('00000000-0000-0000-0000-0000000000a3', 'EPN', 'Analista de Servicios Institucionales', 'FIJO'),
  ('484ee2dc-c794-4195-9a71-8e5069abd680', 'EPN', 'Asistente de Seguridad Institucional', 'TEMPORAL')
on conflict (id_persona) do nothing;

-- Trabajadores: llevan cargo y contrato, pero no unidad académica.
insert into public.persona_interna_detalle (id_persona, cargo, contrato)
values
  ('00000000-0000-0000-0000-000000000003', 'Guardia de Seguridad', 'FIJO'),
  ('862ed696-a68d-4186-9b9f-d20823789e58', 'Guardia de Seguridad', 'FIJO')
on conflict (id_persona) do nothing;

-- Docente: categoría de escalafón, nunca cargo.
insert into public.persona_interna_detalle (id_persona, unidad, categoria_escalafon, contrato)
values
  ('00000000-0000-0000-0000-0000000000da', 'EPN', 'Agregado', 'FIJO')
on conflict (id_persona) do nothing;

-- ---------------------------------------------------------------------------
-- Fichas que ya existían pero contradecían la regla de GPI
-- ---------------------------------------------------------------------------
-- "Titular" es una categoría del escalafón docente, no un cargo administrativo.
update public.persona_interna_detalle
   set cargo = null, categoria_escalafon = 'Principal', contrato = 'FIJO'
 where id_persona = '90c1f608-dc6f-4d6a-9458-4e93f0bc4376';   -- Cecilia Jaramillo

update public.persona_interna_detalle
   set cargo = null, contrato = 'FIJO'
 where id_persona = '0e45bbdc-8466-480b-bf6c-f5f23fa9064d';   -- Alexander Guerra

-- Carrera y curso completos, como se escriben en la matrícula.
update public.persona_interna_detalle
   set carrera = 'Ingeniería en Sistemas de Información'
 where id_persona = '9d11ffb6-d991-4d93-bdd4-a3b256b673b2';

update public.persona_interna_detalle
   set curso = 'Francés - Nivel B1'
 where id_persona = '83a9dadc-a2ae-4810-9be1-c573100fbbb0';

-- ---------------------------------------------------------------------------
-- Dos correos que quedaron a medias en las pruebas
-- ---------------------------------------------------------------------------
alter table public.persona disable trigger trg_bitacora_persona;

-- El correo institucional de la EPN es nombre.apellido, no con guion bajo.
update public.persona set correo = 'alejandro.quiroz@epn.edu.ec'
 where id_persona = '67545185-acb6-472e-a5f4-c912848c4412';

update public.persona set correo = 'lenin.pico04@hotmail.com'
 where id_persona = 'a48049fd-2f81-476e-a7ba-082016fa9222';

alter table public.persona enable trigger trg_bitacora_persona;
alter table public.persona_interna_detalle enable trigger trg_bitacora_persona_interna_detalle;
