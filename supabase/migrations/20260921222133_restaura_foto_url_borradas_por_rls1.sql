-- 20260917122030_rls1_cambiar_foto_url_a_path puso foto_url = NULL en cuatro tablas y el cambio a fotos
-- privadas nunca se completó (nadie resolvía la URL firmada), asi que las fotos dejaron de verse aunque
-- los ficheros siguen en el bucket público `avatars`. Se vuelve a enlazar solo lo que sigue vacío y
-- tiene su objeto. Idempotente.
update public.socios s set foto_url = 'https://dwqvdycjcffqwfkzapvi.supabase.co/storage/v1/object/public/avatars/' || o.name || '?v=' || extract(epoch from o.created_at)::bigint
  from storage.objects o where o.bucket_id = 'avatars' and o.name = s.id and s.foto_url is null;
update public.instructores i set foto_url = 'https://dwqvdycjcffqwfkzapvi.supabase.co/storage/v1/object/public/avatars/' || o.name || '?v=' || extract(epoch from o.created_at)::bigint
  from storage.objects o where o.bucket_id = 'avatars' and o.name = 'instructor-' || i.id and i.foto_url is null;
update public.studios st set foto_url = 'https://dwqvdycjcffqwfkzapvi.supabase.co/storage/v1/object/public/avatars/' || o.name || '?v=' || extract(epoch from o.created_at)::bigint
  from storage.objects o where o.bucket_id = 'avatars' and o.name = 'admin-' || st.id and st.foto_url is null;
update public.tipos_clase t set foto_url = 'https://dwqvdycjcffqwfkzapvi.supabase.co/storage/v1/object/public/avatars/' || o.name || '?v=' || extract(epoch from o.created_at)::bigint
  from storage.objects o where o.bucket_id = 'avatars' and o.name = 'clase-' || t.id and t.foto_url is null;
