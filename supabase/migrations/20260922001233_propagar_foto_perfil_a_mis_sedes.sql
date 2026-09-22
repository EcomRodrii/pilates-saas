-- ⚠️ Fichero RECUPERADO/CORREGIDO, no escrito a mano desde cero.
--
-- La versión que llegó a `main` como `20260922000000_propagar_foto_perfil_a_mis_sedes.sql`
-- tenía DOS problemas, encontrados el 22-sep al ver `main` en rojo:
--
--  1. El nombre de fichero llevaba un timestamp inventado (`20260922000000`).
--     La migración se aplicó de verdad en producción con `apply_migration` bajo
--     la versión `20260922001233` (ver `supabase_migrations.schema_migrations`).
--     Mismo patrón que ya documenta este repo para `entitlement_solo_servicio`:
--     se cruza por NOMBRE, nunca por número, y el fichero se renombra a la
--     versión realmente aplicada — si no, un `supabase db push` desde limpio
--     la ve pendiente y la reaplica con OTRO timestamp.
--
--  2. Su guardia mezclaba `auth.uid() is null` con un `or` y `return 0` en vez
--     de `raise`: `if auth.uid() is null or not (...) then return 0; end if;`.
--     El guardián de contrato (`lib/rgpd-grants-anon-guardias-contrato.test.ts`,
--     test «ninguna guardia lee "uid nulo" como servidor») solo acepta
--     `if auth.uid() is null then raise ...` como forma de EXIGIR sesión, y
--     rechaza cualquier otra combinación aunque el efecto neto sea el mismo
--     (denegar). Esto es lo que tenía roto la CI de `main` sin que nadie lo
--     desplegara mal: el texto del repo no coincidía con lo aplicado.
--
-- El cuerpo de abajo es el texto LITERAL de `pg_get_functiondef` sobre la
-- función viva en producción — ya corregido allí, solo faltaba en el repo.
--
-- La foto y el avatar de una persona viven en la fila de CADA sede (`studios.foto_url/avatar_admin` para la
-- propietaria, `instructores.foto_url/avatar` para el equipo), y la RLS solo deja escribir la sede activa. Al
-- cambiar de sede se cargaba otra fila sin foto. Esta función copia el cambio a todas las sedes de la propia
-- persona (dueña por `owner_auth_user_id`, equipo por `auth_user_id`), nunca de otra.
create or replace function public.propagar_foto_perfil_a_mis_sedes(
  p_destino text, p_cambiar_foto boolean, p_foto_url text, p_cambiar_avatar boolean, p_avatar text
) returns integer language plpgsql security definer set search_path = '' as $f$
declare v_n integer := 0;
begin
  -- Sin sesión no hay «mis sedes»: error, no un «0» que se lea como servidor.
  if auth.uid() is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if not (p_cambiar_foto or p_cambiar_avatar) then return 0; end if;
  if p_foto_url is not null and p_foto_url not like 'https://%/storage/v1/object/public/avatars/%' then
    raise exception 'URL de foto no válida' using errcode = '22023';
  end if;
  if p_destino = 'STUDIO' then
    update public.studios set
      foto_url = case when p_cambiar_foto then p_foto_url else foto_url end,
      avatar_admin = case when p_cambiar_avatar then p_avatar else avatar_admin end
    where owner_auth_user_id = auth.uid();
  elsif p_destino = 'INSTRUCTOR' then
    update public.instructores set
      foto_url = case when p_cambiar_foto then p_foto_url else foto_url end,
      avatar = case when p_cambiar_avatar then p_avatar else avatar end
    where auth_user_id = auth.uid();
  else
    raise exception 'destino no válido' using errcode = '22023';
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $f$;
revoke all on function public.propagar_foto_perfil_a_mis_sedes(text,boolean,text,boolean,text) from public, anon;
grant execute on function public.propagar_foto_perfil_a_mis_sedes(text,boolean,text,boolean,text) to authenticated, service_role;
