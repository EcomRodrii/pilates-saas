-- Libro de billing del SaaS (Fase 1 de Billing & Revenue, 16-nov-2026).
--
-- Lo que los estudios pagan a Tentare (Stripe Billing, cuenta PLATAFORMA; nada que
-- ver con Connect ni con los recibos de las alumnas). STRIPE SIGUE SIENDO LA VERDAD:
-- estas tres tablas son un ESPEJO que escribe el webhook de billing para poder
-- enseñar historial y calcular churn, upgrades y cobros efectivos sin preguntar a
-- Stripe en cada visita. Se pueden reconstruir desde Stripe (script de relleno).
--
--   · billing_eventos          cambios del ciclo de vida de una suscripción (solo inserción).
--   · billing_facturas         una fila por invoice de Stripe, al día con su último evento.
--   · billing_incidentes_pago  un incidente por factura que no se ha podido cobrar.
--
-- Solo servidor: RLS activa, sin política para authenticated (solo la restrictiva
-- `exige_doble_factor` que exige este repo a toda tabla con RLS) y sin grants a
-- anon/authenticated. Escribe service_role; el panel lee por rutas del servidor.
--
-- «Dueño» de una fila: un estudio (`studio_id`) o una cadena (`cadena_id`), nunca los
-- dos: una Cadena paga con UNA suscripción que vive en `cadenas`. Las FK son
-- `on delete set null`: borrar un estudio no borra su historial de cobros.

-- ── 1. Eventos del ciclo de vida ────────────────────────────────────────────
create table if not exists public.billing_eventos (
  id uuid primary key default gen_random_uuid(),
  -- El `evt_…` de Stripe. Con `tipo` forma la clave: un mismo evento puede dar
  -- varias filas (cambió el plan Y el periodo) y una entrega repetida no duplica.
  stripe_event_id text not null,
  tipo text not null check (tipo in (
    'ALTA', 'CAMBIO_PLAN', 'CAMBIO_INTERVALO', 'CAMBIO_COMPLEMENTOS', 'CAMBIO_ESTADO',
    'BAJA_PROGRAMADA', 'BAJA_REVOCADA', 'CANCELADA'
  )),
  studio_id text references public.studios(id) on delete set null,
  cadena_id text references public.cadenas(id) on delete set null,
  subscription_id text,
  customer_id text,
  plan_antes text,
  plan_despues text,
  intervalo_antes text check (intervalo_antes is null or intervalo_antes in ('mensual', 'anual')),
  intervalo_despues text check (intervalo_despues is null or intervalo_despues in ('mensual', 'anual')),
  estado_antes text,
  estado_despues text,
  -- Precio de LISTA de todas las líneas llevado a un mes (los anuales entre 12), en
  -- céntimos. No incluye descuentos: es lo que dice el catálogo, no lo cobrado (eso
  -- está en `billing_facturas`).
  mrr_lista_antes_cents integer,
  mrr_lista_despues_cents integer,
  detalle jsonb not null default '{}'::jsonb,
  -- Cuándo ocurrió según Stripe (`event.created`), no cuándo lo recibimos.
  ocurrido_en timestamptz not null,
  creado_en timestamptz not null default now(),
  constraint billing_eventos_un_dueno check (not (studio_id is not null and cadena_id is not null)),
  constraint billing_eventos_unico unique (stripe_event_id, tipo)
);
create index if not exists idx_billing_eventos_studio on public.billing_eventos (studio_id, ocurrido_en desc) where studio_id is not null;
create index if not exists idx_billing_eventos_cadena on public.billing_eventos (cadena_id, ocurrido_en desc) where cadena_id is not null;
create index if not exists idx_billing_eventos_ocurrido on public.billing_eventos (ocurrido_en desc);

-- ── 2. Facturas ─────────────────────────────────────────────────────────────
create table if not exists public.billing_facturas (
  stripe_invoice_id text primary key,
  studio_id text references public.studios(id) on delete set null,
  cadena_id text references public.cadenas(id) on delete set null,
  customer_id text,
  subscription_id text,
  numero text,
  estado text not null check (estado in ('draft', 'open', 'paid', 'void', 'uncollectible')),
  -- Por qué se emitió (`billing_reason` de Stripe): alta, ciclo, cambio de plan…
  motivo text,
  moneda text not null default 'eur',
  -- Todo en céntimos. `total` es lo facturado; `pagado` lo cobrado de verdad;
  -- `impuestos` va DENTRO de `total`; `devuelto` se rellenará con los reembolsos (fase 4).
  total_cents integer not null,
  pagado_cents integer not null default 0,
  impuestos_cents integer not null default 0,
  devuelto_cents integer not null default 0,
  periodo_inicio timestamptz,
  periodo_fin timestamptz,
  intentos integer not null default 0,
  siguiente_intento timestamptz,
  pagada_en timestamptz,
  url_factura text,
  url_pdf text,
  creada_en timestamptz not null,
  -- `event.created` del último evento aplicado: Stripe no garantiza el orden y uno
  -- viejo no puede pisar a uno nuevo (mismo criterio que `subscription_evento_en`).
  ultimo_evento_en timestamptz not null,
  actualizada_en timestamptz not null default now(),
  constraint billing_facturas_un_dueno check (not (studio_id is not null and cadena_id is not null))
);
create index if not exists idx_billing_facturas_studio on public.billing_facturas (studio_id, creada_en desc) where studio_id is not null;
create index if not exists idx_billing_facturas_cadena on public.billing_facturas (cadena_id, creada_en desc) where cadena_id is not null;
create index if not exists idx_billing_facturas_estado on public.billing_facturas (estado, creada_en desc);

-- ── 3. Incidentes de pago ───────────────────────────────────────────────────
create table if not exists public.billing_incidentes_pago (
  id uuid primary key default gen_random_uuid(),
  -- Una factura que falla = un incidente, por muchos reintentos que haga Stripe.
  stripe_invoice_id text not null unique,
  studio_id text references public.studios(id) on delete set null,
  cadena_id text references public.cadenas(id) on delete set null,
  customer_id text,
  subscription_id text,
  estado text not null default 'ABIERTO' check (estado in ('ABIERTO', 'ESCALADO', 'RECUPERADO', 'CANCELADO')),
  importe_cents integer not null,
  intentos integer not null default 1,
  -- Se rellenan en la fase 2 (el motivo exige leer el PaymentIntent a Stripe).
  motivo_codigo text,
  motivo_texto text,
  siguiente_intento timestamptz,
  abierto_en timestamptz not null,
  ultimo_fallo_en timestamptz not null,
  recuperado_en timestamptz,
  -- Hitos de aviso ya enviados (fase 2): [{ "dia": 2, "enviado_en": "…" }, …].
  avisos jsonb not null default '[]'::jsonb,
  constraint billing_incidentes_un_dueno check (not (studio_id is not null and cadena_id is not null))
);
create index if not exists idx_billing_incidentes_abiertos on public.billing_incidentes_pago (abierto_en) where estado in ('ABIERTO', 'ESCALADO');
create index if not exists idx_billing_incidentes_studio on public.billing_incidentes_pago (studio_id) where studio_id is not null;
create index if not exists idx_billing_incidentes_cadena on public.billing_incidentes_pago (cadena_id) where cadena_id is not null;

-- ── 4. Solo servidor ────────────────────────────────────────────────────────
alter table public.billing_eventos enable row level security;
alter table public.billing_facturas enable row level security;
alter table public.billing_incidentes_pago enable row level security;

create policy exige_doble_factor on public.billing_eventos as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
create policy exige_doble_factor on public.billing_facturas as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
create policy exige_doble_factor on public.billing_incidentes_pago as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

revoke all on public.billing_eventos from anon, authenticated;
revoke all on public.billing_facturas from anon, authenticated;
revoke all on public.billing_incidentes_pago from anon, authenticated;
grant all on public.billing_eventos to service_role;
grant all on public.billing_facturas to service_role;
grant all on public.billing_incidentes_pago to service_role;

comment on table public.billing_eventos is
  'Ciclo de vida de las suscripciones de los estudios a Tentare (alta, cambios, baja). Espejo del webhook de billing: Stripe es la verdad. Solo servidor.';
comment on table public.billing_facturas is
  'Una fila por invoice de Stripe de la suscripción de un estudio a Tentare, al día con su último evento. Importes en céntimos. Solo servidor.';
comment on table public.billing_incidentes_pago is
  'Un incidente por factura que Stripe no ha podido cobrar, hasta que se recupera. No duplica los reintentos de Stripe: solo los registra y sostiene los avisos. Solo servidor.';

-- ── 5. Escribir una factura sin que un evento viejo pise a uno nuevo ────────
-- `p` trae las columnas de `billing_facturas` por nombre. Devuelve 'aplicada' o
-- 'desordenada' (había una fila con un evento más reciente). INVOKER: solo la llama
-- el servidor con service_role, que ya salta la RLS.
create or replace function public.billing_registrar_factura(p jsonb)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_filas integer;
begin
  insert into public.billing_facturas as f (
    stripe_invoice_id, studio_id, cadena_id, customer_id, subscription_id, numero, estado, motivo, moneda,
    total_cents, pagado_cents, impuestos_cents, periodo_inicio, periodo_fin, intentos, siguiente_intento,
    pagada_en, url_factura, url_pdf, creada_en, ultimo_evento_en
  ) values (
    p->>'stripe_invoice_id', p->>'studio_id', p->>'cadena_id', p->>'customer_id', p->>'subscription_id',
    p->>'numero', p->>'estado', p->>'motivo', coalesce(p->>'moneda', 'eur'),
    (p->>'total_cents')::integer, coalesce((p->>'pagado_cents')::integer, 0), coalesce((p->>'impuestos_cents')::integer, 0),
    (p->>'periodo_inicio')::timestamptz, (p->>'periodo_fin')::timestamptz,
    coalesce((p->>'intentos')::integer, 0), (p->>'siguiente_intento')::timestamptz,
    (p->>'pagada_en')::timestamptz, p->>'url_factura', p->>'url_pdf',
    (p->>'creada_en')::timestamptz, (p->>'ultimo_evento_en')::timestamptz
  )
  on conflict (stripe_invoice_id) do update set
    studio_id = coalesce(excluded.studio_id, f.studio_id),
    cadena_id = coalesce(excluded.cadena_id, f.cadena_id),
    customer_id = excluded.customer_id,
    subscription_id = coalesce(excluded.subscription_id, f.subscription_id),
    numero = coalesce(excluded.numero, f.numero),
    estado = excluded.estado,
    motivo = coalesce(excluded.motivo, f.motivo),
    total_cents = excluded.total_cents,
    pagado_cents = excluded.pagado_cents,
    impuestos_cents = excluded.impuestos_cents,
    periodo_inicio = excluded.periodo_inicio,
    periodo_fin = excluded.periodo_fin,
    intentos = greatest(excluded.intentos, f.intentos),
    siguiente_intento = excluded.siguiente_intento,
    pagada_en = coalesce(excluded.pagada_en, f.pagada_en),
    url_factura = coalesce(excluded.url_factura, f.url_factura),
    url_pdf = coalesce(excluded.url_pdf, f.url_pdf),
    ultimo_evento_en = excluded.ultimo_evento_en,
    actualizada_en = now()
  where f.ultimo_evento_en <= excluded.ultimo_evento_en;
  get diagnostics v_filas = row_count;
  return case when v_filas > 0 then 'aplicada' else 'desordenada' end;
end;
$$;

-- ── 6. Abrir o actualizar el incidente de una factura que ha fallado ────────
-- Idempotente por factura. No reabre uno ya recuperado ni abre uno para una
-- factura que el libro ya tiene como pagada (un `payment_failed` que llega tarde).
create or replace function public.billing_abrir_incidente(p jsonb)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_filas integer;
begin
  if exists (select 1 from public.billing_facturas where stripe_invoice_id = p->>'stripe_invoice_id' and estado = 'paid') then
    return 'ya_pagada';
  end if;
  insert into public.billing_incidentes_pago as i (
    stripe_invoice_id, studio_id, cadena_id, customer_id, subscription_id, importe_cents, intentos,
    siguiente_intento, abierto_en, ultimo_fallo_en
  ) values (
    p->>'stripe_invoice_id', p->>'studio_id', p->>'cadena_id', p->>'customer_id', p->>'subscription_id',
    (p->>'importe_cents')::integer, greatest(coalesce((p->>'intentos')::integer, 1), 1),
    (p->>'siguiente_intento')::timestamptz, (p->>'fallo_en')::timestamptz, (p->>'fallo_en')::timestamptz
  )
  on conflict (stripe_invoice_id) do update set
    studio_id = coalesce(excluded.studio_id, i.studio_id),
    cadena_id = coalesce(excluded.cadena_id, i.cadena_id),
    importe_cents = excluded.importe_cents,
    intentos = greatest(excluded.intentos, i.intentos),
    siguiente_intento = excluded.siguiente_intento,
    ultimo_fallo_en = greatest(excluded.ultimo_fallo_en, i.ultimo_fallo_en)
  where i.estado in ('ABIERTO', 'ESCALADO');
  get diagnostics v_filas = row_count;
  return case when v_filas > 0 then 'abierto' else 'sin_cambios' end;
end;
$$;

-- ── 7. Cerrar el incidente cuando la factura se paga, se anula o se da por perdida ──
-- RECUPERADO solo si se pagó; CANCELADO si se anuló o se marcó incobrable.
create or replace function public.billing_cerrar_incidente(p_stripe_invoice_id text, p_en timestamptz, p_estado text default 'RECUPERADO')
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_filas integer;
begin
  if p_estado not in ('RECUPERADO', 'CANCELADO') then
    raise exception 'estado de cierre no válido: %', p_estado using errcode = '22023';
  end if;
  update public.billing_incidentes_pago
     set estado = p_estado,
         recuperado_en = case when p_estado = 'RECUPERADO' then p_en else null end,
         siguiente_intento = null
   where stripe_invoice_id = p_stripe_invoice_id and estado in ('ABIERTO', 'ESCALADO');
  get diagnostics v_filas = row_count;
  return case when v_filas > 0 then lower(p_estado) else 'sin_incidente' end;
end;
$$;

-- ⚠️ `pg_default_acl` da EXECUTE a anon/authenticated DIRECTO en las funciones
-- nuevas: revocar PUBLIC no basta (ver tentare-os.md). Los tres pasos, y se verifica
-- con has_function_privilege.
revoke execute on function public.billing_registrar_factura(jsonb) from public, anon, authenticated;
revoke execute on function public.billing_abrir_incidente(jsonb) from public, anon, authenticated;
revoke execute on function public.billing_cerrar_incidente(text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.billing_registrar_factura(jsonb) to service_role;
grant execute on function public.billing_abrir_incidente(jsonb) to service_role;
grant execute on function public.billing_cerrar_incidente(text, timestamptz, text) to service_role;
