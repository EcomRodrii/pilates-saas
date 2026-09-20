-- Auditoría 2026-09-19 · 🔴 Fuga cross-tenant ACTIVA en el bucket privado de
-- fotos de personas. No es un riesgo teórico: las políticas estaban así en
-- producción cuando se escribió esto.
--
-- `20260917122000_rls1_avatares_privados_bucket.sql` creó `avatars-privadas`
-- (fotos de socias, instructoras y perfiles de red — dato personal de toda la
-- plataforma) y le puso estas tres políticas, todas para el rol
-- `authenticated`:
--
--   delete ... using       (bucket_id = 'avatars-privadas')
--   update ... using/check (bucket_id = 'avatars-privadas')
--   insert ... with check  (name = auth.uid()::text
--                           or name like 'instructor-%'
--                           or name like 'network-%')
--
-- El único predicado de DELETE y UPDATE es «el objeto está en este bucket».
-- Es decir: CUALQUIER usuario autenticado —una socia de cualquier estudio—
-- podía borrar o SOBRESCRIBIR la foto de cualquier persona de la plataforma
-- conociendo su path, y los paths son predecibles (`<socio_id>`,
-- `instructor-<id>`, `network-<perfil>`). El INSERT tampoco ataba
-- `instructor-%` / `network-%` a nadie, así que se podía plantar una imagen
-- como instructora de otro estudio.
--
-- La auditoría del 2026-09-18 dio esto por cerrado ([C-9]) porque comprobó
-- `pg_policies` y no vio el agujero: el endurecimiento con
-- `avatars_path_escribible(name)` se aplicó a las políticas del bucket PÚBLICO
-- `avatars`, que se llaman casi igual (`avatars_*_autorizado` frente a
-- `avatars_privadas_*_autorizado`). El bucket privado nunca se tocó.
--
-- Arreglo: las tres políticas del bucket privado pasan a exigir el MISMO
-- predicado de propiedad que ya usa el bucket público. `avatars_path_escribible`
-- cubre exactamente las tres formas de path de este bucket:
--   · `instructor-<id>`  → la propia instructora, o quien pueda gestionar su ficha
--                          EN SU MISMO ESTUDIO.
--   · `network-<perfil>` → solo el dueño del perfil de red.
--   · `<socio_id>`       → la propia socia, o personal del MISMO estudio con
--                          `puede_gestionar_clientas()`.
--
-- Se conserva `name = auth.uid()::text` como alternativa en INSERT/UPDATE: es
-- intrínsecamente propio (nadie puede escribir el uid de otra persona) y estaba
-- en la política original, así que quitarlo podría romper algún alta que no he
-- podido observar en ejecución.

drop policy if exists avatars_privadas_insert_autorizado on storage.objects;
drop policy if exists avatars_privadas_update_autorizado on storage.objects;
drop policy if exists avatars_privadas_delete_autorizado on storage.objects;

create policy avatars_privadas_insert_autorizado on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars-privadas'
    and (public.avatars_path_escribible(name) or name = auth.uid()::text)
  );

create policy avatars_privadas_update_autorizado on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars-privadas'
    and (public.avatars_path_escribible(name) or name = auth.uid()::text)
  )
  with check (
    bucket_id = 'avatars-privadas'
    and (public.avatars_path_escribible(name) or name = auth.uid()::text)
  );

create policy avatars_privadas_delete_autorizado on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars-privadas'
    and (public.avatars_path_escribible(name) or name = auth.uid()::text)
  );

-- `avatars_privadas_denegar_select` (using false) se deja intacta: la lectura va
-- por URL firmada desde `/api/foto/signed-url`, que ya deriva el estudio de la
-- sesión. El camino de servidor usa service-role y no pasa por estas políticas.

-- ---------------------------------------------------------------------------
-- De paso: `generar_url_foto_firmada` es un SECURITY DEFINER que solo hace
-- `return null` —su propio comentario dice «placeholder; la lógica real en
-- TypeScript»—. Queda expuesto en la API REST y no hace nada. Se borra en vez
-- de dejar una función de seguridad que aparenta existir; ningún fichero del
-- repo la llama (grep de `generar_url_foto_firmada` fuera de `supabase/`: 0).
-- Es además la que `lib/rgpd-grants-anon-guardias-contrato.test.ts` marca como
-- SECURITY DEFINER sin decisión escrita sobre `anon`.
-- ---------------------------------------------------------------------------
drop function if exists public.generar_url_foto_firmada(text, int);
