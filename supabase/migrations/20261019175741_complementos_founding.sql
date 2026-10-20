-- ═══════════════════════════════════════════════════════════════════════════
-- Complementos (add-ons) de Founding Studio (19-oct-2026, decisión del fundador)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Founding Studio (plan BASE, 29 €) deja de traer el Centro de Control, las
-- sustituciones automáticas y la IA de redacción para quien empiece a pagarlo
-- desde hoy: se contratan aparte, cada uno como una línea más de la misma
-- suscripción de Stripe. Quien ya lo pagaba lo conserva todo sin pagar más, y el
-- gratis y la prueba siguen con todo. La regla vive en `entitlementsDe`
-- (lib/billing/entitlements.ts); aquí, solo los dos datos que necesita:
--
--   · regimen_addons: este estudio paga Founding con complementos aparte. Lo pone
--     a true el webhook de Stripe cuando llega una suscripción creada por el
--     checkout nuevo (metadata regimen = 'addons'). Nace false para todos: los
--     que ya pagaban no cambian.
--   · addons: los complementos que tiene contratados. Lo escribe el webhook (y la
--     ruta que los activa) leyendo las líneas REALES de la suscripción de Stripe,
--     nunca el navegador.
--
-- ⚠️ Las dos son solo del servidor: `authenticated` tiene privilegios de
-- columna en `studios` (no de tabla), así que una columna nueva nace sin INSERT
-- ni UPDATE para él. Se comprueba al final con has_column_privilege.
-- ADD COLUMN con un valor por defecto constante no reescribe la tabla ni dispara
-- los triggers de UPDATE de `studios`.
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

alter table public.studios
  add column if not exists regimen_addons boolean not null default false,
  add column if not exists addons text[] not null default '{}';

alter table public.studios drop constraint if exists studios_addons_validos;
alter table public.studios add constraint studios_addons_validos
  check (addons <@ array['decisiones', 'sustituciones', 'ia']::text[]);

comment on column public.studios.regimen_addons is
  'true = paga Founding Studio (BASE) con los complementos aparte (checkout desde el 19-oct-2026). false = Founding completo de siempre. Solo lo escribe el webhook de Stripe.';
comment on column public.studios.addons is
  'Complementos contratados (decisiones, sustituciones, ia), leídos de las líneas reales de la suscripción de Stripe. Solo los escribe el servidor.';

do $$
begin
  if has_column_privilege('authenticated', 'public.studios', 'addons', 'UPDATE')
     or has_column_privilege('authenticated', 'public.studios', 'addons', 'INSERT')
     or has_column_privilege('authenticated', 'public.studios', 'regimen_addons', 'UPDATE')
     or has_column_privilege('authenticated', 'public.studios', 'regimen_addons', 'INSERT')
     or has_column_privilege('anon', 'public.studios', 'addons', 'UPDATE')
     or has_column_privilege('anon', 'public.studios', 'regimen_addons', 'UPDATE') then
    raise exception 'studios.addons / regimen_addons no pueden ser escribibles desde el navegador';
  end if;
end $$;
