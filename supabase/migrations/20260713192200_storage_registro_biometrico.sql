-- Storage: bucket privado para las fotos de registro_biometrico.
-- registro_biometrico.path_storage guarda la referencia; el archivo nunca
-- vive en una columna de la base de datos.
--
-- Acceso restringido a GPI unicamente. docs/02_MATRIZ_PERMISOS_RLS.md es
-- explicito: "GPE no tiene NINGUN permiso sobre registro_biometrico. Los
-- externos NUNCA tienen registro biometrico" (revierte D7, ratificado por
-- D20 -- la via de validacion externa es la cedula, nunca el rostro). ADM ve
-- solo metadatos de la fila (footnote4 de la matriz), nunca el archivo: sin
-- politica de Storage para ADM tampoco. Sin politica de DELETE (coherente
-- con "sin DELETE fisico" en todo el sistema).

insert into storage.buckets (id, name, public)
values ('registro-biometrico', 'registro-biometrico', false)
on conflict (id) do nothing;

create policy registro_biometrico_bucket_select_gpi
on storage.objects for select
using (
  bucket_id = 'registro-biometrico'
  and auth.tiene_permiso('GPI_BIOMETRIA_SELECT')
);

create policy registro_biometrico_bucket_insert_gpi
on storage.objects for insert
with check (
  bucket_id = 'registro-biometrico'
  and auth.tiene_permiso('GPI_BIOMETRIA_INSERT')
);

create policy registro_biometrico_bucket_update_gpi
on storage.objects for update
using (
  bucket_id = 'registro-biometrico'
  and auth.tiene_permiso('GPI_BIOMETRIA_UPDATE')
)
with check (
  bucket_id = 'registro-biometrico'
  and auth.tiene_permiso('GPI_BIOMETRIA_UPDATE')
);
