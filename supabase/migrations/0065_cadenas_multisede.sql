-- Soporte real de multi-sede ("Cadena"). El plan CADENA (149€/mes) ya se
-- vende en /suscripcion como "Varios centros" / "Multi-centro y todo
-- incluido" (lib/billing/entitlements.ts, features.multiCentro) pero hasta
-- ahora ese flag no gateaba nada — no había ningún modelo de datos que
-- agrupara sedes. Esta migración añade la entidad `cadenas` (única fuente de
-- verdad para el billing de una cadena — una sola suscripción de Stripe
-- cubre todas sus sedes), un selector de "sede activa" por sesión, y
-- endurece la RLS existente para que nada de esto abra una vía de fuga
-- cross-tenant ni de escalada de privilegios entre cadenas.

-- ── Entidad cadena ───────────────────────────────────────────────────────────
create table public.cadenas (
  id text primary key,
  nombre text not null,
  owner_auth_user_id uuid not null references auth.users(id),
  plan text,
  stripe_customer_id text,
  subscription_id text,
  subscription_status text,
  current_period_end timestamptz,
  creado_en timestamptz not null default now()
);

alter table public.cadenas enable row level security;

create policy owner_cadenas on public.cadenas
  to authenticated
  using (owner_auth_user_id = auth.uid())
  with check (owner_auth_user_id = auth.uid());

alter table public.studios add column cadena_id text references public.cadenas(id);

-- Backfill de seguridad: cualquier studio YA en plan CADENA hoy (si lo hay)
-- pasa a tener su propia cadena de una sola sede, sin perder continuidad de
-- su suscripción de Stripe existente.
insert into public.cadenas (id, nombre, owner_auth_user_id, plan, stripe_customer_id, subscription_id, subscription_status, current_period_end)
select 'cadena-' || id, nombre, owner_auth_user_id, plan, stripe_customer_id, subscription_id, subscription_status, current_period_end
from public.studios where plan = 'CADENA';

update public.studios set cadena_id = 'cadena-' || id where plan = 'CADENA';

-- ── Sincronización cadena → sedes vía trigger (no vía código de aplicación) ──
-- El webhook de Stripe solo escribe en `cadenas`; este trigger propaga el
-- plan/estado a TODAS sus sedes en la misma transacción, así entitlementsDe()
-- y las policies existentes (que leen studios.plan) no necesitan cambiar.
create function public.propagar_plan_cadena() returns trigger
  language plpgsql security definer as $$
begin
  update public.studios
    set plan = new.plan, subscription_status = new.subscription_status, current_period_end = new.current_period_end
    where cadena_id = new.id;
  return new;
end;
$$;

create trigger trg_propagar_plan_cadena
  after update of plan, subscription_status, current_period_end on public.cadenas
  for each row execute function public.propagar_plan_cadena();

-- Al añadir una sede nueva a una cadena existente, hereda el plan/estado
-- vigente de la cadena (nunca de una sede hermana, que podría estar obsoleta).
create function public.heredar_plan_de_cadena() returns trigger
  language plpgsql security definer as $$
begin
  if new.cadena_id is not null then
    select plan, subscription_status, current_period_end
      into new.plan, new.subscription_status, new.current_period_end
      from public.cadenas where id = new.cadena_id;
  end if;
  return new;
end;
$$;

create trigger trg_heredar_plan_de_cadena
  before insert on public.studios
  for each row execute function public.heredar_plan_de_cadena();

-- ── Sede activa por sesión (selector "cambiar de sede") ──────────────────────
-- Sin esto, current_studio_id() solo puede resolver una sede fija y determinista
-- por usuario — no hay forma de "cambiar" a otra sede propia sin este registro.
create table public.sesion_activa (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  studio_id text not null,
  actualizado_en timestamptz not null default now()
);

alter table public.sesion_activa enable row level security;

create policy self_rw_sesion_activa on public.sesion_activa
  for all to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ── current_studio_id() / current_rol(): sesion_activa + determinismo ───────
-- Reescritura de las funciones existentes (SECURITY DEFINER, evaluadas en cada
-- statement de las ~73 policies que ya las usan — no hace falta tocar ninguna
-- de esas policies, solo esta función). Cambios:
--  1) Si hay una sede elegida en sesion_activa, se usa SOLO si el usuario
--     realmente tiene acceso a ella (owner o instructora) — nunca se confía
--     ciegamente en la fila; un UPSERT a una sede ajena queda sin efecto.
--  2) ORDER BY añadido al fallback: antes era no determinista con >1 fila de
--     `studios`/`instructores` para el mismo usuario (el caso que ahora es
--     central con cadenas, no ya un caso raro).
--  3) current_rol() deja de resolver por su cuenta y deriva de
--     current_studio_id() ya resuelto, para que nunca puedan desincronizarse.
create or replace function public.current_studio_id() returns text
  language sql stable security definer as $$
  select coalesce(
    (select sa.studio_id from public.sesion_activa sa
       where sa.auth_user_id = auth.uid()
         and (
           exists (select 1 from public.studios s where s.id = sa.studio_id and s.owner_auth_user_id = auth.uid())
           or exists (select 1 from public.instructores i where i.studio_id = sa.studio_id and i.auth_user_id = auth.uid())
         )),
    (select studio_id from public.instructores where auth_user_id = auth.uid() order by studio_id limit 1),
    (select id from public.studios where owner_auth_user_id = auth.uid() order by id limit 1)
  );
$$;

create or replace function public.current_rol() returns text
  language sql stable security definer as $$
  select coalesce(
    (select rol from instructores where auth_user_id = auth.uid() and studio_id = public.current_studio_id()),
    (select 'PROPIETARIO' from studios where owner_auth_user_id = auth.uid() and id = public.current_studio_id())
  );
$$;

-- ── insert_studios: impedir vincular una sede nueva a la cadena de otra persona ──
-- Antes solo exigía owner_auth_user_id = auth.uid() en la fila nueva; nada
-- impedía poner un cadena_id ajeno y, vía trg_heredar_plan_de_cadena, colarse
-- gratis en la suscripción de otra cadena.
drop policy insert_studios on public.studios;
create policy insert_studios on public.studios for insert to authenticated
  with check (
    owner_auth_user_id = auth.uid()
    and (cadena_id is null or exists (select 1 from public.cadenas c where c.id = cadena_id and c.owner_auth_user_id = auth.uid()))
  );

-- ── mis_estudios(): listado seguro para el selector de sede ─────────────────
-- Deliberadamente NO es una policy de fila sobre `studios` (esa tabla ya tuvo
-- una fuga cross-tenant real por columnas sensibles expuestas vía GRANT, ver
-- 0006_studios_columnas_publicas.sql / 0055_studios_rls_cierre.sql) y
-- deliberadamente NO se acopla a cadena_id (es un concepto de billing, no de
-- autorización — dejaría fuera a instructoras multi-sede sin cadena). Columnas
-- whitelisted en la firma de la función: no puede filtrar nif/stripe_customer_id
-- aunque alguien haga `select *` sobre el resultado del RPC.
create function public.mis_estudios() returns table(id text, nombre text, slug text, ciudad text)
  language sql stable security definer as $$
  select s.id, s.nombre, s.slug, s.ciudad
  from public.studios s
  where s.owner_auth_user_id = auth.uid()
     or exists (select 1 from public.instructores i where i.studio_id = s.id and i.auth_user_id = auth.uid());
$$;
