-- ─────────────────────────────────────────────────────────────────────────────
-- Opening OS · cupo EXACTO de las etapas que cierran la venta.
--
-- Solo aplica a etapas con al_completar = 'CERRAR' y límite: en una 'AVISAR'
-- el plan sigue a la venta por definición y su cuenta no cambia.
--
-- Cada plaza es una fila: RESERVADA antes de cobrar (bajo lock de la etapa),
-- VENDIDA al entregarse el plan, LIBERADA solo cuando Stripe confirma que ese
-- cobro ya no puede ocurrir (sesión caducada, PaymentIntent cancelado). Nunca
-- por reloj: un pago tardío sobre una plaza liberada vendería una de más.
-- Ocupadas = VENDIDA + RESERVADA; nunca pasan del límite.
--
-- Vías: Checkout (Modo A) y embebido (Modo B) reservan antes de crear el cobro
-- y guardan en la plaza la referencia de Stripe (cs_/pi_); la entrega del plan
-- confirma por esa referencia. Todo lo demás (mostrador, TPV, importaciones)
-- pasa por el trigger BEFORE INSERT de suscripciones: toma plaza si queda; si
-- no, al cliente (mostrador, aún sin cobrar) se le rechaza, y a service_role
-- (el dinero ya entró) se le admite y se avisa en alertas_opening.
--
-- Un reembolso NO devuelve la plaza (decisión del fundador): si la propietaria
-- quiere venderla otra vez, sube el cupo.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.launch_stage_plazas (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.launch_stages(id) on delete cascade,
  studio_id text not null references public.studios(id) on delete cascade,
  -- Identidad del intento de compra (clave de idempotencia del checkout, o
  -- 'sus:<id>' para las que toma el trigger): dos pestañas del mismo intento
  -- reutilizan la misma plaza.
  clave text not null,
  stripe_ref text,
  suscripcion_id text,
  estado text not null default 'RESERVADA' check (estado in ('RESERVADA','VENDIDA','LIBERADA')),
  expira_en timestamptz,
  -- Cuántas veces se ha vuelto a reservar este mismo intento tras liberarse.
  -- Va en la clave de idempotencia de Stripe (`<clave>:r<intento>`): con la
  -- clave vieja, Stripe devolvería la sesión caducada o el PaymentIntent
  -- cancelado, o rechazaría el `expires_at` nuevo durante 24 h.
  intento integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint launch_stage_plazas_clave unique (stage_id, clave)
);
create unique index uq_launch_stage_plazas_ref on public.launch_stage_plazas(stripe_ref) where stripe_ref is not null;
create unique index uq_launch_stage_plazas_sus on public.launch_stage_plazas(suscripcion_id) where suscripcion_id is not null;
create index idx_launch_stage_plazas_ocupadas on public.launch_stage_plazas(stage_id) where estado in ('RESERVADA','VENDIDA');

alter table public.launch_stage_plazas enable row level security;
revoke insert, update, delete on public.launch_stage_plazas from authenticated, anon;
create policy leer_launch_stage_plazas on public.launch_stage_plazas
  for select to authenticated
  using (studio_id = public.current_studio_id()
         and public.current_rol() in ('PROPIETARIO','MANAGER'));

-- La etapa que hoy impone cupo exacto para ese plan, si hay.
create or replace function public.opening_etapa_con_cupo(p_plan_id text, p_studio_id text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id from public.launch_stages e
   where e.studio_id = p_studio_id and e.plan_id = p_plan_id
     and e.al_completar = 'CERRAR' and e.limite_plazas is not null
     -- Llena por cupo sigue imponiéndolo hasta su fin: si no, el mostrador
     -- podría seguir vendiendo el plan por encima del límite.
     and (e.estado <> 'CERRADA' or e.cerrada_motivo = 'CUPO')
     and now() >= e.fecha_inicio and now() < e.fecha_fin
   order by e.fecha_inicio
   limit 1;
$$;

-- Ventas: en una etapa 'CERRAR' son sus plazas VENDIDAS; en una 'AVISAR', como
-- hasta ahora, las suscripciones del plan con inicio dentro de la etapa.
create or replace function public.opening_ventas_etapa(p_stage_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when e.al_completar = 'CERRAR' then
    (select count(*)::int from public.launch_stage_plazas p where p.stage_id = e.id and p.estado = 'VENDIDA')
  else
    (select count(*)::int from public.suscripciones s
      where s.studio_id = e.studio_id and s.plan_id = e.plan_id
        and s.fecha_inicio >= (e.fecha_inicio at time zone 'Europe/Madrid')::date
        and s.fecha_inicio <  (e.fecha_fin    at time zone 'Europe/Madrid')::date)
  end
  from public.launch_stages e
  where e.id = p_stage_id and e.plan_id is not null;
$$;

-- Reserva una plaza antes de cobrar. NULL = ese plan no tiene cupo exacto ahora
-- (se vende sin reserva). Lanza ETAPA_AGOTADA si no queda.
create or replace function public.reservar_plaza_etapa(
  p_plan_id text, p_studio_id text, p_clave text, p_expira_en timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage uuid;
  v_limite integer;
  v_plaza public.launch_stage_plazas%rowtype;
  v_existe boolean;
  v_ocupadas integer;
begin
  v_stage := public.opening_etapa_con_cupo(p_plan_id, p_studio_id);
  if v_stage is null then return null; end if;

  select limite_plazas into v_limite from public.launch_stages where id = v_stage for update;

  -- FOUND se sobrescribe en cada SELECT INTO: se guarda aparte.
  select * into v_plaza from public.launch_stage_plazas where stage_id = v_stage and clave = p_clave;
  v_existe := found;
  if v_existe and v_plaza.estado in ('RESERVADA','VENDIDA') then
    return v_plaza.id;
  end if;

  select count(*) into v_ocupadas from public.launch_stage_plazas
   where stage_id = v_stage and estado in ('RESERVADA','VENDIDA');
  if v_ocupadas >= v_limite then
    raise exception 'ETAPA_AGOTADA';
  end if;

  if v_existe then
    -- Mismo intento que ya se liberó: vuelve a reservarse (ya se comprobó que cabe).
    update public.launch_stage_plazas
       set estado = 'RESERVADA', expira_en = p_expira_en, stripe_ref = null,
           intento = intento + 1, updated_at = now()
     where id = v_plaza.id;
    return v_plaza.id;
  end if;

  insert into public.launch_stage_plazas(stage_id, studio_id, clave, expira_en)
  values (v_stage, p_studio_id, p_clave, p_expira_en)
  returning id into v_plaza.id;
  return v_plaza.id;
end;
$$;

-- La referencia del cobro (cs_/pi_/pos:…), justo después de crearlo.
-- Idempotente: si la plaza ya lleva esa misma referencia (reintento del mismo
-- intento, aunque ya esté VENDIDA) es un sí.
create or replace function public.asignar_ref_plaza_etapa(p_plaza_id uuid, p_ref text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with u as (
    update public.launch_stage_plazas set stripe_ref = p_ref, updated_at = now()
     where id = p_plaza_id and estado = 'RESERVADA' and stripe_ref is null
    returning 1
  ) select exists (select 1 from u)
        or exists (select 1 from public.launch_stage_plazas where id = p_plaza_id and stripe_ref = p_ref);
$$;

-- Al entregar el plan, antes de insertar la suscripción. Idempotente: un
-- reintento del webhook confirma lo mismo. Devuelve 'SIN_PLAZA' si ese cobro no
-- reservó (lo cubrirá el trigger), 'VENDIDA' o 'TARDIA' (la plaza ya se había
-- liberado: el dinero entró igual, se vende y se avisa).
create or replace function public.confirmar_plaza_etapa_por_ref(p_ref text, p_suscripcion_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plaza public.launch_stage_plazas%rowtype;
begin
  select * into v_plaza from public.launch_stage_plazas where stripe_ref = p_ref for update;
  if not found then return 'SIN_PLAZA'; end if;
  if v_plaza.estado = 'VENDIDA' then return 'VENDIDA'; end if;

  update public.launch_stage_plazas
     set estado = 'VENDIDA', suscripcion_id = p_suscripcion_id, expira_en = null, updated_at = now()
   where id = v_plaza.id;

  if v_plaza.estado = 'LIBERADA' then
    insert into public.alertas_opening(studio_id, tipo, severidad, titulo, descripcion, datos)
    values (v_plaza.studio_id, 'CUPO_SUPERADO:' || v_plaza.stage_id, 'ALTA',
            'Se ha vendido una plaza más del cupo',
            'Un pago llegó después de que su plaza se liberara. La venta es válida: revisa el cupo de la etapa.',
            jsonb_build_object('href', '/dashboard#etapas-lanzamiento'))
    on conflict do nothing;
    return 'TARDIA';
  end if;
  return 'VENDIDA';
end;
$$;

-- Solo suelta lo RESERVADO; una VENDIDA no se toca (un reembolso no la devuelve).
create or replace function public.liberar_plaza_etapa(p_plaza_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with u as (
    update public.launch_stage_plazas set estado = 'LIBERADA', updated_at = now()
     where id = p_plaza_id and estado = 'RESERVADA'
    returning 1
  ) select exists (select 1 from u);
$$;

create or replace function public.liberar_plaza_etapa_por_ref(p_ref text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with u as (
    update public.launch_stage_plazas set estado = 'LIBERADA', updated_at = now()
     where stripe_ref = p_ref and estado = 'RESERVADA'
    returning 1
  ) select exists (select 1 from u);
$$;

-- Red de seguridad: toda suscripción de un plan con cupo exacto ocupa plaza.
create or replace function public.opening_trg_cupo_etapa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage uuid;
  v_limite integer;
  v_ocupadas integer;
begin
  v_stage := public.opening_etapa_con_cupo(new.plan_id, new.studio_id);
  if v_stage is null then return new; end if;
  -- Ya la confirmó la entrega del plan (Checkout/embebido), o es un reintento.
  if exists (select 1 from public.launch_stage_plazas where suscripcion_id = new.id) then return new; end if;

  select limite_plazas into v_limite from public.launch_stages where id = v_stage for update;
  select count(*) into v_ocupadas from public.launch_stage_plazas
   where stage_id = v_stage and estado in ('RESERVADA','VENDIDA');

  if v_ocupadas >= v_limite then
    -- El mostrador escribe con el JWT del personal y aún no ha cobrado: se para.
    if coalesce(auth.role(), '') = 'authenticated' then
      raise exception 'ETAPA_AGOTADA';
    end if;
    -- service_role: el dinero ya entró (TPV cobrado, webhook). Se vende y se avisa.
    insert into public.alertas_opening(studio_id, tipo, severidad, titulo, descripcion, datos)
    values (new.studio_id, 'CUPO_SUPERADO:' || v_stage, 'ALTA',
            'Se ha vendido una plaza más del cupo',
            'Una venta ya cobrada llegó con la etapa llena. La venta es válida: revisa el cupo de la etapa.',
            jsonb_build_object('href', '/dashboard#etapas-lanzamiento'))
    on conflict do nothing;
  end if;

  insert into public.launch_stage_plazas(stage_id, studio_id, clave, suscripcion_id, estado)
  values (v_stage, new.studio_id, 'sus:' || new.id, new.id, 'VENDIDA')
  on conflict (stage_id, clave) do nothing;
  return new;
end;
$$;

create trigger trg_suscripciones_opening_cupo
  before insert on public.suscripciones
  for each row execute function public.opening_trg_cupo_etapa();

-- Solo servidor (API con service_role, webhooks, el propio trigger).
revoke execute on function public.opening_etapa_con_cupo(text, text) from public, anon, authenticated;
revoke execute on function public.reservar_plaza_etapa(text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.asignar_ref_plaza_etapa(uuid, text) from public, anon, authenticated;
revoke execute on function public.confirmar_plaza_etapa_por_ref(text, text) from public, anon, authenticated;
revoke execute on function public.liberar_plaza_etapa(uuid) from public, anon, authenticated;
revoke execute on function public.liberar_plaza_etapa_por_ref(text) from public, anon, authenticated;
revoke execute on function public.opening_trg_cupo_etapa() from public, anon, authenticated;
revoke execute on function public.opening_ventas_etapa(uuid) from public, anon, authenticated;
grant execute on function public.opening_etapa_con_cupo(text, text) to service_role, postgres;
grant execute on function public.reservar_plaza_etapa(text, text, text, timestamptz) to service_role, postgres;
grant execute on function public.asignar_ref_plaza_etapa(uuid, text) to service_role, postgres;
grant execute on function public.confirmar_plaza_etapa_por_ref(text, text) to service_role, postgres;
grant execute on function public.liberar_plaza_etapa(uuid) to service_role, postgres;
grant execute on function public.liberar_plaza_etapa_por_ref(text) to service_role, postgres;
grant execute on function public.opening_ventas_etapa(uuid) to service_role, postgres;
