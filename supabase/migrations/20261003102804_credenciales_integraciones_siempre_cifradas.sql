-- ═══════════════════════════════════════════════════════════════════════════
-- Credenciales de las integraciones: la BD exige que estén cifradas.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Desde #2396/#2398 (30-sep) los tokens de `integracion_credenciales` y los
-- secretos de `integraciones.config` (token, apiKey) los cifra la app
-- (AES-256-GCM, INTEGRACIONES_CLAVE_CIFRADO). Pero sin la clave se guardaban en
-- claro con un aviso. Comprobado en producción el 2-oct-2026: 0 valores en
-- claro (4 credenciales, 6 configs), así que la clave está puesta y funciona.
--
-- Contrato de encargo: «cifradas» tiene que ser una garantía, no un deseo. La
-- BD rechaza desde aquí cualquier valor en claro, y la app ya no lo intenta
-- (lib/db/supabase-data-admin.ts, sinClaveDeCifrado). Si un día faltara la
-- clave, la integración falla a la vista en vez de guardar un token legible.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from public.integracion_credenciales
              where (access_token is not null and access_token not like 'enc:v1:%')
                 or (refresh_token is not null and refresh_token not like 'enc:v1:%')) then
    raise exception 'hay credenciales de integraciones en claro: que las cifre el barrido nocturno antes';
  end if;
  if exists (select 1 from public.integraciones
              where coalesce(nullif(config->>'token', ''), 'enc:v1:') not like 'enc:v1:%'
                 or coalesce(nullif(config->>'apiKey', ''), 'enc:v1:') not like 'enc:v1:%') then
    raise exception 'hay secretos de integraciones.config en claro: que los cifre el barrido nocturno antes';
  end if;
end $$;

alter table public.integracion_credenciales drop constraint if exists integracion_credenciales_cifradas;
alter table public.integracion_credenciales
  add constraint integracion_credenciales_cifradas check (
    (access_token is null or access_token like 'enc:v1:%')
    and (refresh_token is null or refresh_token like 'enc:v1:%')
  );

-- Los secretos de la config son los de CAMPOS_SECRETOS (lib/integraciones/config-cifrada.ts).
-- Vacío o ausente vale: «Desconectar» guarda `{}`.
alter table public.integraciones drop constraint if exists integraciones_secretos_cifrados;
alter table public.integraciones
  add constraint integraciones_secretos_cifrados check (
    coalesce(nullif(config->>'token', ''), 'enc:v1:') like 'enc:v1:%'
    and coalesce(nullif(config->>'apiKey', ''), 'enc:v1:') like 'enc:v1:%'
  );
