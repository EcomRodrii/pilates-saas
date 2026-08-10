-- Histórico de pagos importado de la plataforma anterior (migración asistida).
-- Deliberadamente NO es `recibos`: esa tabla arrastra Stripe/Veri·Factu/AEAT/
-- dunning — insertar aquí filas sin factura real y sin NIF verificado
-- obligaría a apagar toda esa maquinaria con flags nuevos en cada consumidor.
-- Una tabla aparte, de solo lectura desde la UI (se escribe solo por el
-- importador con service-role), no puede filtrar dinero real por accidente.
create table public.pagos_historicos (
  id text primary key,
  studio_id text not null references public.studios(id),
  socio_id text not null references public.socios(id),
  fecha date not null,
  concepto text,
  importe numeric(10,2) not null check (importe >= 0),
  medio_pago text,
  creado_en timestamptz not null default now()
);

create index idx_pagos_historicos_studio on public.pagos_historicos(studio_id);
create index idx_pagos_historicos_socio on public.pagos_historicos(socio_id);

alter table public.pagos_historicos enable row level security;

-- Mismo criterio de lectura que recibos reales (migr 0114): es dinero, aunque
-- sea histórico. Sin política de insert/update/delete para `authenticated` a
-- propósito — el importador escribe con la service-role, que no pasa por RLS;
-- nadie debe poder editar un pago histórico desde el cliente.
create policy pagos_historicos_lectura on public.pagos_historicos
  for select to authenticated
  using (studio_id = public.current_studio_id() and public.puede_ver_finanzas());

revoke all on public.pagos_historicos from anon, public;
grant select on public.pagos_historicos to authenticated;
grant select, insert, update, delete on public.pagos_historicos to service_role;
