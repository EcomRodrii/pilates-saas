-- ═══════════════════════════════════════════════════════════════════════════
-- Qué condiciones aceptó la clienta EN ESTA COMPRA.
--
-- Hoy sólo consta una aceptación por SOCIA (`socios.aceptacion_*`): fecha,
-- firma, origen y quién la introdujo. Cubre la relación, no la transacción. Y
-- en el checkout de la app no se le enseña ni se le guarda nada: lo único
-- «legal» que ve al pagar es el aviso de Stripe, que va sobre el MEDIO DE PAGO,
-- no sobre las condiciones del estudio.
--
-- ── Por qué un hash y no el texto ───────────────────────────────────────────
-- La convención de este repo es que «el texto SÍ es la clave de vigencia»
-- (lib/legal-textos.ts). `socios.aceptacion_version` la aplicó guardando el
-- TEXTO COMPLETO en cada fila: 2,7 KB idénticos por socia que hubo que sacar
-- del select del panel porque inflaban `socios` un 79 %.
--
-- Aquí se guarda el hash en el recibo y el texto UNA vez por versión y estudio.
-- Misma capacidad de prueba —del hash se llega al texto exacto— sin repetir
-- kilobytes en cada compra, que además serían muchas más que socias.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.terminos_versiones (
  id          text primary key,
  studio_id   text not null references public.studios(id) on delete cascade,
  hash        text not null,
  texto       text not null,
  creado_en   timestamptz not null default now(),
  -- Un texto, una fila. El upsert del checkout se apoya en esto para no
  -- escribir una versión nueva en cada compra.
  unique (studio_id, hash)
);

create index if not exists idx_terminos_versiones_studio on public.terminos_versiones (studio_id);

alter table public.terminos_versiones enable row level security;

-- Solo lectura para el personal del estudio: son documentos de prueba, y
-- reescribirlos a mano destruiría justamente lo que demuestran. Las escribe el
-- service-role desde el checkout.
create policy staff_lee_terminos_versiones on public.terminos_versiones
  for select to authenticated using (studio_id = public.current_studio_id());

revoke all on table public.terminos_versiones from anon;
grant select on table public.terminos_versiones to authenticated;

alter table public.recibos
  add column if not exists terminos_hash text,
  add column if not exists terminos_aceptados_en timestamptz;

comment on column public.recibos.terminos_hash is
  'Hash del texto legal vigente cuando se hizo esta compra. Resoluble contra terminos_versiones. NULL = compra anterior a esto, o cobro que no pasó por el checkout de la app.';
comment on column public.recibos.terminos_aceptados_en is
  'Cuándo aceptó la clienta esas condiciones — al crear el pago, no al confirmarlo.';
