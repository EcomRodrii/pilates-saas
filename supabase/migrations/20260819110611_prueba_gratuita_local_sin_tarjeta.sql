-- ═══════════════════════════════════════════════════════════════════════════
-- Prueba gratuita de 7 días SIN TARJETA (apertura de Tentare al público).
--
-- Hasta ahora la prueba la daba Stripe (`trial_period_days` en el Checkout de
-- suscripción), así que para empezar había que pasar por la pasarela y dejar
-- una tarjeta. Al abrir el alta al público esa es la fricción más cara del
-- embudo: la prueba pasa a ser LOCAL, arranca al crear el estudio y no toca
-- Stripe para nada.
--
-- ⚠️ La prueba se materializa reutilizando `subscription_status = 'trialing'`
-- A PROPÓSITO, en vez de estrenar un estado paralelo. `suscripcionActiva()`
-- (lib/billing/entitlements.ts) ya trata 'trialing' como acceso válido, y de
-- ahí cuelgan los ~18 sitios que llaman a `tieneFeature()` para decidir si un
-- estudio puede usar el Centro de Control, las sustituciones autónomas o el
-- multi-sede. Un estado nuevo obligaría a tocar los 18 —y a que cada query
-- seleccionara una columna más— para que la prueba no se sintiera como un plan
-- capado desde el primer minuto.
--
-- Lo nuevo es `trial_ends_at`, que es lo único capaz de distinguir los DOS
-- 'trialing' que ahora conviven:
--   · con `subscription_id`    → prueba de Stripe; la cierra Stripe.
--   · sin  `subscription_id`   → prueba local; no la cierra NADIE por su cuenta.
--
-- Y de ahí sale el riesgo real de este cambio: un 'trialing' local sin vigilar
-- es acceso gratis PARA SIEMPRE. Se ataja por partida doble, con el mismo
-- criterio de «regla de negocio, no de reloj» que ya usan las reglas de
-- reserva (Fase 2a/2c):
--   1. La REGLA vive en la derivación — `estadoTrial()` compara contra el reloj
--      cada vez que se pregunta, y `/api/billing/status` la aplica en CADA
--      petición. Si este cron se retrasa o no corre un tic, el gate sigue
--      siendo correcto.
--   2. Este barrido solo pone la BD al día para el resto de consumidores (los
--      `tieneFeature()` de servidor, que leen la columna sin derivar nada).
--
-- Columna nueva sobre `studios`, que tiene GRANT de SELECT a nivel de TABLA
-- para `authenticated` (relacl `authenticated=arwdDxtm`) y solo grants por
-- COLUMNA para `anon` (11 columnas, la lista blanca pública). Verificado en
-- vivo antes de escribir esto: por construcción la columna la ve el personal
-- del estudio —acotado por la RLS de siempre— y NO la ve `anon`. Nada que
-- conceder ni que revocar aquí.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠️ NOMBRE DEL FICHERO: aplicada con `apply_migration`, que la sella con la
-- marca de tiempo del MOMENTO de aplicarla y no con la del fichero. Se aplicó
-- como `20260819110611`, así que el fichero se renombró a esa misma versión.
-- Sin ese renombrado, un `supabase db push` desde limpio la vería pendiente y
-- la reaplicaría con OTRO timestamp, multiplicando la divergencia (es la regla
-- que ya documenta .claude/tentare-os.md §Migraciones).
--
-- El bloque `cron.schedule` de abajo se ejecutó APARTE, no dentro de
-- `apply_migration`: devuelve un valor (el jobid) y no encaja en ese camino.
-- Queda aquí porque es parte de la migración para cualquier entorno nuevo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.studios
  add column if not exists trial_ends_at timestamptz;

comment on column public.studios.trial_ends_at is
  'Fin de la prueba gratuita LOCAL de 7 días (sin tarjeta), fijada al crear el estudio. '
  'NULL = este estudio no tiene prueba local (los anteriores a la apertura al público, '
  'o los que ya la consumieron). Es lo único que distingue un subscription_status '
  '''trialing'' local de uno de Stripe: el de Stripe trae subscription_id.';

-- ── El barrido ─────────────────────────────────────────────────────────────
-- Cierra las pruebas locales vencidas. Tres condiciones, y las tres importan:
--   · trial_ends_at < now()        → de verdad ha vencido.
--   · subscription_status='trialing' → sigue marcada como prueba (idempotencia:
--     una segunda pasada no vuelve a tocar la fila).
--   · subscription_id is null      → es la prueba LOCAL. Sin esto, el barrido
--     sacaría de 'trialing' a un estudio cuya prueba lleva Stripe, pisándole el
--     estado al webhook y cortándole el acceso a un cliente que sí dejó tarjeta.
--
-- ⚠️ El estado final es 'trial_expirado', NO NULL. Volver a NULL parecería lo
-- natural ("no tiene suscripción"), pero `/api/billing/checkout` decide si
-- regalar días de Stripe con `primeraVez = !studio.subscription_status`: con
-- NULL, todo estudio que agotara su prueba local recibiría OTRA prueba, ahora
-- de Stripe, al ir a pagar. Un centinela que no es de Stripe cierra las dos
-- puertas a la vez — `suscripcionActiva('trial_expirado')` es false (bloquea) y
-- `primeraVez` es false (no hay segunda prueba).
create or replace function public.cerrar_pruebas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cerradas integer;
begin
  update public.studios
     set subscription_status = 'trial_expirado'
   where trial_ends_at is not null
     and trial_ends_at < now()
     and subscription_status = 'trialing'
     and subscription_id is null;
  get diagnostics v_cerradas = row_count;
  return v_cerradas;
end;
$$;

-- Solo para el cron. `REVOKE ... FROM PUBLIC` NO basta en este proyecto:
-- pg_default_acl concede EXECUTE sobre toda función SECURITY DEFINER nueva
-- DIRECTAMENTE a anon/authenticated/service_role, no heredado de PUBLIC, así
-- que revocar PUBLIC no les quita nada (ver .claude/tentare-os.md §Seguridad y
-- el caso real de `reservar_numero_factura`, PR #769). Los tres pasos
-- explícitos, y comprobados abajo con has_function_privilege.
revoke execute on function public.cerrar_pruebas_vencidas() from public;
revoke execute on function public.cerrar_pruebas_vencidas() from anon;
revoke execute on function public.cerrar_pruebas_vencidas() from authenticated;
grant  execute on function public.cerrar_pruebas_vencidas() to service_role;
grant  execute on function public.cerrar_pruebas_vencidas() to postgres;

do $$
begin
  if has_function_privilege('anon', 'public.cerrar_pruebas_vencidas()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.cerrar_pruebas_vencidas()', 'EXECUTE') then
    raise exception 'cerrar_pruebas_vencidas sigue siendo ejecutable por anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.cerrar_pruebas_vencidas()', 'EXECUTE') then
    raise exception 'service_role no puede ejecutar cerrar_pruebas_vencidas';
  end if;
end $$;

-- Cada 15 minutos. La prontitud del BLOQUEO no depende de esto (el gate deriva
-- en vivo, ver cabecera); lo que este tic acota es cuánto tarda la columna en
-- reflejar la verdad para los `tieneFeature()` de servidor. `studios` tiene
-- decenas de filas, así que el barrido es una lectura trivial sin índice nuevo.
select cron.unschedule('cerrar-pruebas-vencidas')
where exists (select 1 from cron.job where jobname = 'cerrar-pruebas-vencidas');

select cron.schedule(
  'cerrar-pruebas-vencidas',
  '*/15 * * * *',
  $$select public.cerrar_pruebas_vencidas();$$
);

-- ── El arranque de la prueba ───────────────────────────────────────────────
-- ⚠️ La prueba NO se arranca desde el cliente. `dbCreateStudio` hace un INSERT
-- directo sobre `studios` con la sesión de la propietaria (la policy de RLS se
-- lo permite sobre su propio estudio), así que si `trial_ends_at` viajara en
-- ese payload cualquiera podría pedirse una prueba hasta el año 3000 con una
-- petición a mano. La UI nunca es el límite de seguridad: lo fija la BD.
--
-- Por eso el trigger IGNORA lo que venga en el INSERT y escribe siempre
-- `now() + 7 días`. Es la única forma de que el valor sea un hecho del
-- servidor y no una sugerencia del navegador.
--
-- Solo para estudios INDEPENDIENTES (`cadena_id is null`). Una sede nueva de
-- una cadena no estrena prueba propia: su plan y su estado los hereda de la
-- cadena, que ya tiene su suscripción. De eso se encarga
-- `trg_heredar_plan_de_cadena`, que por orden alfabético corre DESPUÉS de este
-- (Postgres dispara los BEFORE por nombre de trigger) y, si hubiera cadena,
-- pisaría lo que pongamos aquí — que es justo el resultado correcto.
create or replace function public.arrancar_prueba_gratuita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cadena_id is null then
    new.trial_ends_at := now() + (7 || ' days')::interval;
    new.subscription_status := 'trialing';
    new.subscription_id := null;
    new.current_period_end := new.trial_ends_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.arrancar_prueba_gratuita() from public;
revoke execute on function public.arrancar_prueba_gratuita() from anon;
revoke execute on function public.arrancar_prueba_gratuita() from authenticated;

drop trigger if exists trg_arrancar_prueba_gratuita on public.studios;
create trigger trg_arrancar_prueba_gratuita
  before insert on public.studios
  for each row execute function public.arrancar_prueba_gratuita();

-- ── El plan elegido durante la prueba ──────────────────────────────────────
-- La propietaria elige su plan en el alta, y durante la prueba disfruta ESE
-- plan (es lo que se le promete: «qué obtienes durante la prueba»). Ese valor
-- llega en el INSERT de `dbCreateStudio`, o sea desde el cliente.
--
-- Elegir tu propio plan de prueba es intencionado; escribir CUALQUIER COSA en
-- esa columna, no. Antes daba igual —un estudio recién creado nacía sin
-- suscripción, así que `tieneFeature()` decía que no a todo y el valor de
-- `plan` no abría ninguna puerta—, pero desde que la prueba nace en 'trialing'
-- el plan SÍ decide entitlements desde el primer minuto. Sin este CHECK, un
-- INSERT a mano con plan='LO_QUE_SEA' pasaría, y `entitlementsDe()` caería a
-- BASE en silencio: el estudio se quedaría con menos de lo que pidió sin que
-- nada fallara de forma visible.
alter table public.studios
  drop constraint if exists studios_plan_valido;
alter table public.studios
  add constraint studios_plan_valido
  check (plan is null or plan in ('BASE', 'ESTUDIO', 'CADENA'))
  not valid;

-- `not valid` + `validate`: no bloquea la tabla mientras comprueba las filas
-- que ya están. Si alguna no pasara, esto falla aquí y no en silencio.
alter table public.studios validate constraint studios_plan_valido;
