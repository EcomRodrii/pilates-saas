-- Guardias de «llamada de servidor» explícitas, en vez de «no hay usuario».
--
-- Auditoría RGPD/seguridad 2026-09-13, A26 / control C11 (anexo de funciones, F-1).
--
-- 27 funciones de `public` decidían si saltarse sus comprobaciones de estudio y
-- de rol mirando si `auth.uid()` era nulo: «sin usuario» se leía como «servidor
-- de confianza». No es lo mismo. Hoy ninguna es ejecutable por `anon`, pero la
-- seguridad de las 27 dependía de que ninguna migración futura olvidara un
-- REVOKE al cambiar una firma, y en este repo eso ya ha pasado varias veces.
--
-- `es_llamada_servicio()` pregunta lo que importa: quién llama.
--  · API con la clave de servicio: PostgREST fija `role` y los claims a
--    `service_role` en cada petición (medido en pg_stat_statements:
--    `set_config('role', …)` + `set_config('request.jwt.claims', …)`).
--  · pg_cron y migraciones: sesión directa de `postgres`/`supabase_admin`, sin
--    rol de API ni claims (los jobs de cron.job corren como `postgres`).
--  · Todo lo demás (anon, authenticated con o sin `sub`, Realtime, Storage,
--    Auth): false.
-- Ensayada en producción, en transacción revertida, en siete contextos.
--
-- Clasificación de las 27 (catálogo de prod, 2026-09-14):
--  · Solo servidor (sin EXECUTE de cliente): cancelar_reserva_plaza,
--    liberar_cupo_matricula, renovar_bono_idempotente, reservar_numero_factura
--    y los triggers socios_auth_user_id_solo_servidor y
--    studios_cuenta_cobro_solo_servidor.
--  · RPC con EXECUTE de authenticated cuya guardia solo se salta el servidor:
--    abrir_conversacion, ajustar_creditos, ajustar_stock, ampliar_caducidades,
--    cancelar_canje, canjear_recompensa, congelar_suscripcion,
--    consumir_sesion_bono, crear_recuperacion(6), descongelar_suscripcion,
--    devolver_sesion_bono, editar_serie_desde, entregar_canje,
--    reasignar_instructora, registrar_consentimiento_marketing,
--    reservar_matricula, reservar_plaza, resolver_reserva_pendiente,
--    semaforo_salud_estudio y el helper validar_studio_mismatch (lo usan 17).
--  · Helper de RLS: tiene_consentimiento_salud (políticas de las tablas de salud).
-- En todas es la misma sustitución y ninguna cambia de firma, dueño ni grants:
--   uid no nulo  →  not public.es_llamada_servicio()
--   uid nulo     →  public.es_llamada_servicio()
-- Para service_role y cron el resultado es idéntico al de antes; lo único que
-- cambia es que un uid nulo que NO venga del servidor pasa las comprobaciones
-- como cualquier otra petición de cliente.
--
-- Por qué se convierte la definición VIVA y no se copian 27 cuerpos: varias se
-- han redefinido en sesiones paralelas, y copiar el último texto del repo
-- arriesga devolver una versión vieja. El bloque falla si una definición no
-- cambia, si cambia su ACL o si al terminar queda alguna guardia sin convertir.
-- ⚠️ El texto de las migraciones anteriores sigue mostrando la guardia antigua:
-- quien redefina una de estas funciones debe partir de `pg_get_functiondef` en
-- prod, no de ese texto. Lo vigila lib/rgpd-grants-anon-guardias-contrato.test.ts.

create or replace function public.es_llamada_servicio()
returns boolean
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    -- Petición de API con la clave de servicio.
    nullif(current_setting('role', true), '') = 'service_role'
    or coalesce(
         nullif(current_setting('request.jwt.claim.role', true), ''),
         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
       ) = 'service_role'
    -- Conexión directa de administración (pg_cron, migraciones): ni rol de API
    -- ni claims. Una sesión de postgres que se hace pasar por anon/authenticated
    -- para ensayar políticas NO cuenta como servidor.
    or (
      session_user in ('postgres', 'supabase_admin')
      and coalesce(nullif(current_setting('role', true), ''), 'none') = 'none'
      and coalesce(
            nullif(current_setting('request.jwt.claim.role', true), ''),
            nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
          ) is null
    ),
    false
  );
$function$;

comment on function public.es_llamada_servicio() is
  'true solo para service_role (API) o una sesión directa de postgres/supabase_admin sin identidad de API (pg_cron, migraciones). Sustituye a comprobar si auth.uid() es nulo.';

-- INVOKER a propósito (solo lee GUCs). Los triggers de `socios`/`studios` y
-- `validar_studio_mismatch` corren con el rol de quien escribe, así que
-- authenticated necesita EXECUTE; anon no escribe en esas tablas.
revoke all on function public.es_llamada_servicio() from public, anon;
grant execute on function public.es_llamada_servicio() to authenticated, service_role;

do $conversion$
declare
  f record;
  v_def text;
  v_nueva text;
  v_acl text;
  v_n int := 0;
begin
  for f in
    select p.oid, p.oid::regprocedure::text as firma, p.proacl::text as acl
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosrc ~* 'auth\.uid\(\)\s+is\s+(not\s+)?null'
     order by 2
  loop
    v_def := pg_get_functiondef(f.oid);
    v_nueva := regexp_replace(v_def, 'auth\.uid\(\)\s+is\s+not\s+null', 'not public.es_llamada_servicio()', 'gi');
    v_nueva := regexp_replace(v_nueva, 'auth\.uid\(\)\s+is\s+null', 'public.es_llamada_servicio()', 'gi');
    if v_nueva = v_def then
      raise exception 'guardias de servidor: % no cambió al convertirla', f.firma;
    end if;

    execute v_nueva;

    select p.proacl::text into v_acl from pg_proc p where p.oid = f.oid;
    if v_acl is distinct from f.acl then
      raise exception 'guardias de servidor: la ACL de % cambió (% → %)', f.firma, f.acl, v_acl;
    end if;
    v_n := v_n + 1;
  end loop;

  if exists (
    select 1 from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosrc ~* 'auth\.uid\(\)\s+is\s+(not\s+)?null'
  ) then
    raise exception 'guardias de servidor: quedan funciones sin convertir';
  end if;

  raise notice 'guardias de servidor: % funciones convertidas', v_n;
end
$conversion$;
