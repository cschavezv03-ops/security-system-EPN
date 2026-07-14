-- Politicas RLS: modulo GPI.
-- Fuente: docs/02_MATRIZ_PERMISOS_RLS.md "Modulo GPI".

-- ===== persona_interna_detalle =====
-- ADM/DIR sin codigo dedicado (docs/99 E6): ADM_MODULO_ACCEDER (lo tienen ambos).
create policy persona_interna_detalle_select on public.persona_interna_detalle
  for select using (
    auth.tiene_permiso('ADM_MODULO_ACCEDER')
    or auth.tiene_permiso('GPI_PERSONA_DETALLE_SELECT')
    or auth.tiene_acceso_operativo_cac()
  );
create policy persona_interna_detalle_insert_gpi on public.persona_interna_detalle
  for insert with check (auth.tiene_permiso('GPI_PERSONA_DETALLE_INSERT'));
create policy persona_interna_detalle_update_gpi on public.persona_interna_detalle
  for update using (auth.tiene_permiso('GPI_PERSONA_DETALLE_UPDATE'))
  with check (auth.tiene_permiso('GPI_PERSONA_DETALLE_UPDATE'));

-- ===== registro_biometrico =====
-- ADMIN L4 (solo metadatos; DIR = "-", por eso NO se usa ADM_MODULO_ACCEDER
-- aqui) via el nuevo codigo ADM_BIOMETRIA_SELECT (docs/99 E7). CAC L, pero
-- GUA = "-" explicitamente: se usa CAC_EVENTO_SELECT (que el guardia NO
-- tiene) y no el helper operativo generico, para no filtrarle acceso.
create policy registro_biometrico_select_adm on public.registro_biometrico
  for select using (auth.tiene_permiso('ADM_BIOMETRIA_SELECT'));
create policy registro_biometrico_select_gpi on public.registro_biometrico
  for select using (auth.tiene_permiso('GPI_BIOMETRIA_SELECT'));
create policy registro_biometrico_select_cac on public.registro_biometrico
  for select using (auth.tiene_permiso('CAC_EVENTO_SELECT'));

-- El trigger trg_bloquear_biometria_externa (bloque 1) ya impide enrolar
-- biometria de una persona EXTERNA, sin importar el rol que lo intente.
create policy registro_biometrico_insert_gpi on public.registro_biometrico
  for insert with check (auth.tiene_permiso('GPI_BIOMETRIA_INSERT'));
create policy registro_biometrico_update_gpi on public.registro_biometrico
  for update using (auth.tiene_permiso('GPI_BIOMETRIA_UPDATE'))
  with check (auth.tiene_permiso('GPI_BIOMETRIA_UPDATE'));
