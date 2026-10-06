-- Factores de verificación en dos pasos de una persona, SOLO para el servidor.
--
-- `verificarSesionStaff` decidía el segundo paso con `user.factors`, que solo
-- devuelve `auth.getUser(token)`: una llamada de red a GoTrue en CADA petición
-- de staff (medido en producción: 1.249 ms de media, p95 10 s, sobre una base
-- Nano que hace swap). Con la clave de firma asimétrica del proyecto el token se
-- valida en local (`auth.getClaims`), y esta función da lo único que el token no
-- trae: qué factores tiene la persona. Va en paralelo con las demás lecturas de
-- `resolverConUsuario`, así que no añade un viaje.
--
-- Devuelve la misma forma que `user.factors` (`status`, `factor_type`,
-- `friendly_name`), que es lo que lee `factoresVerificados()`. NUNCA el secreto,
-- el teléfono ni los datos de WebAuthn de `auth.mfa_factors`.
--
-- ⚠️ Es SECURITY DEFINER porque lee el esquema `auth`, y por eso solo la ejecuta
-- el servidor: `authenticated` podría preguntar por el uid de OTRA persona.
-- `REVOKE FROM PUBLIC` no basta (pg_default_acl da EXECUTE directo a anon y
-- authenticated): los tres roles, explícitos.
create or replace function public.factores_mfa_de(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'status', f.status::text,
      'factor_type', f.factor_type::text,
      'friendly_name', f.friendly_name
    )),
    '[]'::jsonb
  )
  from auth.mfa_factors f
  where f.user_id = p_user;
$$;

revoke all on function public.factores_mfa_de(uuid) from public, anon, authenticated;
grant execute on function public.factores_mfa_de(uuid) to service_role;
