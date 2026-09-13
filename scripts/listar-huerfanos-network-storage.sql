-- ═══════════════════════════════════════════════════════════════════════════
-- SOLO LECTURA — objetos de Storage de Tentare Network que ya no referencia
-- ninguna fila. No borra nada: el borrado lo hace a mano quien tenga permiso,
-- con la lista de la consulta 2, desde el panel de Storage o con service_role.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Origen de los huérfanos (antes de la fase 2 RGPD):
--   - subir un DNI/certificado dos veces (el primero salía borroso) dejaba el
--     primero sin fila (lib/network/documentos-identidad.ts sube ANTES de
--     registrar);
--   - retirar una certificación borraba la fila y no el fichero;
--   - la foto `network-<perfil>` nunca se borraba con el perfil.
-- Desde la fase 2 los flujos nuevos ya limpian; esto es para lo que quedó.
--
-- Margen de 1 día: una subida recién hecha puede no tener aún su fila.

-- 1) Recuento por tipo.
with refs as (
  select documento_path as p from public.red_verificaciones_identidad where documento_path is not null
  union select documento_path_reverso from public.red_verificaciones_identidad where documento_path_reverso is not null
  union select documento_path from public.red_certificaciones where documento_path is not null
  union select path from public.red_perfil_media
)
select 'red-documentos-identidad sin fila' as tipo,
       split_part(split_part(o.name, '/', 2), '-', 1) as prefijo,
       count(*) as objetos,
       pg_size_pretty(sum(coalesce((o.metadata->>'size')::bigint, 0))) as tamano
from storage.objects o
where o.bucket_id = 'red-documentos-identidad'
  and o.name not in (select p from refs)
  and o.created_at < now() - interval '1 day'
group by 2
union all
select 'avatars network- sin perfil', 'network', count(*), pg_size_pretty(sum(coalesce((o.metadata->>'size')::bigint, 0)))
from storage.objects o
where o.bucket_id = 'avatars'
  and o.name like 'network-%'
  and not exists (select 1 from public.red_perfiles rp where rp.id = substring(o.name from length('network-') + 1))
  and o.created_at < now() - interval '1 day'
order by 1, 2;

-- 2) Detalle para borrar (bucket + ruta). Contiene el uid de la cuenta en la
--    ruta: no copiar esta salida a tickets, PRs ni documentación.
with refs as (
  select documento_path as p from public.red_verificaciones_identidad where documento_path is not null
  union select documento_path_reverso from public.red_verificaciones_identidad where documento_path_reverso is not null
  union select documento_path from public.red_certificaciones where documento_path is not null
  union select path from public.red_perfil_media
)
select o.bucket_id, o.name, o.created_at
from storage.objects o
where (
    (
      o.bucket_id = 'red-documentos-identidad'
      and o.name not in (select p from refs)
    ) or (
      o.bucket_id = 'avatars'
      and o.name like 'network-%'
      and not exists (select 1 from public.red_perfiles rp where rp.id = substring(o.name from length('network-') + 1))
    )
  )
  and o.created_at < now() - interval '1 day'
order by o.bucket_id, o.created_at;

-- 3) Documentos de verificaciones/certificaciones YA RESUELTAS que conservan la
--    imagen (anteriores a la minimización). Con CONSERVAR_DOCUMENTO_TRAS_VERIFICAR
--    = false son candidatos a borrar, tras la revisión legal.
select 'identidad resuelta con imagen' as tipo, count(*)
from public.red_verificaciones_identidad
where estado in ('verificado', 'rechazado') and documento_path is not null
union all
select 'certificación resuelta con imagen', count(*)
from public.red_certificaciones
where estado in ('verificado', 'rechazado') and documento_path is not null;
