-- Auditoría 25-ago. Dos huecos de la MISMA clase que el de PII del 14-ago:
-- el control existe en el código de la API, pero NO en la base de datos, y
-- `authenticated` puede hablar con PostgREST directamente saltándose la API.
--
-- OJO: los dos `revoke ... (columna)` de aquí abajo fueron un NO-OP, por el
-- grant a nivel de TABLA. Se corrigen en 20260825074240. Se dejan tal cual
-- para que el fichero refleje lo que de verdad se aplicó a producción.

-- 1. Las señales de confianza no pueden auto-otorgarse.
--    `identidad_verificada_en` pinta el badge "Identidad verificada"
--    (components/network/lista-badges.tsx) y es un filtro del buscador
--    (components/network-v2/FiltrosSidebar.tsx); `destacado` decide el orden
--    de la portada y la cinta de la tarjeta.
--    `saneaCambios` (app/api/network/perfil/route.ts) es lista blanca y nunca
--    las deja escribir, pero eso solo protege la ruta de la API: la policy
--    red_perfiles_update_propio acota `estado` en su WITH CHECK y no dice nada
--    de estas dos columnas.
revoke update (destacado, identidad_verificada_en) on public.red_perfiles from authenticated;
revoke insert (destacado, identidad_verificada_en) on public.red_perfiles from authenticated;

-- 2. `red_perfil_media.path` es una clave de un bucket privado que guarda
--    TAMBIÉN los DNI y las certificaciones de toda la red
--    (lib/network/documentos-identidad.ts y lib/network/portfolio-storage.ts
--    comparten bucket). La API ya exige el prefijo `{auth.uid()}/portfolio-`
--    y su comentario lo llama "defensa en profundidad"; la policy solo
--    comprobaba `perfil_id`, así que la defensa de verdad no estaba: quien
--    insertase la fila por PostgREST con el `path` de otra persona conseguía
--    que el servidor se lo firmara con service role (`createSignedUrls`).
drop policy if exists red_perfil_media_insert_propio on public.red_perfil_media;
create policy red_perfil_media_insert_propio on public.red_perfil_media
  for insert to authenticated
  with check (
    path like ((select auth.uid())::text || '/portfolio-%')
    and exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_perfil_media.perfil_id
        and rp.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists red_perfil_media_update_propio on public.red_perfil_media;
create policy red_perfil_media_update_propio on public.red_perfil_media
  for update to authenticated
  using (
    exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_perfil_media.perfil_id
        and rp.auth_user_id = (select auth.uid())
    )
  )
  with check (
    path like ((select auth.uid())::text || '/portfolio-%')
    and exists (
      select 1 from public.red_perfiles rp
      where rp.id = red_perfil_media.perfil_id
        and rp.auth_user_id = (select auth.uid())
    )
  );
