-- GPI/GPE/ADM · Reactivar una persona SÍ debe ser posible: cada módulo reactiva lo suyo.
--
-- Corrige 20260720230000_gpi_baja_de_persona_es_permanente.sql. Esa migración interpretó
-- "no se puede volver a activarle" como una regla a IMPONER (bloqueó volver a ACTIVO para
-- todos, incluido ADM). Aclarado por Dax (20/07, con captura de la pantalla real de GPI): el
-- botón "Reactivar" SÍ debe existir, con la misma simetría que ya tiene "Dar de baja" -- GPI
-- reactiva personal interno, GPE personal externo, ADM cualquiera -- apoyado en los permisos
-- que RLS ya exige (GPI_PERSONA_UPDATE / GPE_PERSONA_UPDATE / ADM_PERSONA_UPDATE). No hacía
-- falta un trigger para esto: la RLS ya lo resolvia: lo unico que sobraba era el trigger que
-- se agrego de mas.
--
-- Lo que SÍ se mantiene (no se toca aquí): `proteger_personal_privilegiado`
-- (20260720220000) sigue bloqueando CUALQUIER cambio de estado -- baja o reactivación -- sobre
-- una persona con rol de Responsable/Director/Administrador, salvo que el actor tenga
-- ADM_PERSONA_UPDATE. Ese es un caso distinto (quién puede tocar a un par jerárquico), no el
-- de "¿se puede volver atrás de una baja?", y el reporte original (Carlos Chávez) sigue
-- resuelto por ese trigger.

drop trigger if exists trg_impedir_reactivar_persona on public.persona;
drop function if exists public.impedir_reactivar_persona();
