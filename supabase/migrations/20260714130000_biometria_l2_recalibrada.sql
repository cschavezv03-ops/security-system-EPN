-- Correccion de la metrica biometrica: coseno -> euclidiana (L2).
--
-- Motivo (medido con rostros reales, 2026-07-14): los descriptores de
-- face-api.js estan pensados para compararse por DISTANCIA EUCLIDIANA, no por
-- similitud coseno. Con coseno, dos personas distintas daban ~0.88 de
-- "confidence" (por encima del umbral 0.85) -> falsos positivos: un rostro NO
-- enrolado era aceptado como enrolado. Coseno casi no discrimina estos vectores.
--
-- Medicion real (rostro enrolado G0 vs otras muestras):
--   muestra              coseno_conf   L2_dist
--   G1 (misma persona)     0.9257       0.5638   <- genuino
--   I1 (impostor)          0.8832       0.6947   <- distinto
--   I0 (impostor)          0.8791       0.7103   <- distinto
-- Con coseno los tres superaban 0.85. Con L2 hay separacion real.
--
-- Nuevo punto de operacion (estricto con margen): distancia L2 maxima = 0.62.
--   confidence = greatest(0, 1 - distancia_L2)
--   match  <=>  confidence >= UMBRAL_BIOMETRIA  <=>  L2 <= 0.62
--   UMBRAL_BIOMETRIA pasa de 0.85 (coseno) a 0.38 (= 1 - 0.62).
-- Genuino 0.564 -> confidence 0.436 >= 0.38 (aceptado, margen 0.056).
-- Impostor 0.695/0.710 -> confidence 0.305/0.290 < 0.38 (rechazado, margen 0.075+).
--
-- El resto del pipeline no cambia: identificar_por_descriptor sigue devolviendo
-- `confidence` (mayor = mejor) y validar-biometria / registrar-evento-acceso lo
-- comparan contra UMBRAL_BIOMETRIA. Solo cambian la metrica, el indice y el valor
-- del umbral.

-- 1. Indice: reemplazar el HNSW coseno por HNSW L2.
drop index if exists public.idx_registro_biometrico_descriptor;
create index if not exists idx_registro_biometrico_descriptor
  on public.registro_biometrico
  using hnsw (descriptor_facial extensions.vector_l2_ops);

-- 2. Funcion 1:N con distancia euclidiana. confidence = 1 - L2 (recortado a >= 0).
--    CREATE OR REPLACE conserva los privilegios (service_role) ya otorgados.
create or replace function public.identificar_por_descriptor(
  p_descriptor double precision[]
)
returns table (
  id_persona uuid,
  confidence double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    rb.id_persona,
    greatest(0, 1 - (rb.descriptor_facial <-> (p_descriptor::extensions.vector)))::double precision as confidence
  from public.registro_biometrico rb
  join public.persona p on p.id_persona = rb.id_persona
  where rb.vigente = true
    and rb.descriptor_facial is not null
    and p.tipo_persona = 'INTERNA'
  order by rb.descriptor_facial <-> (p_descriptor::extensions.vector)
  limit 1;
$$;

comment on function public.identificar_por_descriptor(double precision[]) is
  'Identificacion facial 1:N por distancia euclidiana (L2). confidence = 1 - distancia_L2. Devuelve la persona INTERNA enrolada mas cercana. Invocada por la Edge Function validar-biometria con service_role.';

-- 3. Recalibrar el umbral: 0.85 (coseno) -> 0.38 (L2, = distancia maxima 0.62).
update public.parametro_sistema
set valor_parametro = '0.38',
    descripcion = 'Confidence minimo (=1 - distancia L2) para aceptar coincidencia facial. 0.38 = distancia L2 maxima 0.62. Metrica euclidiana sobre descriptores face-api 128-d. NO subir a 0.85 (era el valor del esquema coseno anterior).'
where codigo_parametro = 'UMBRAL_BIOMETRIA';
