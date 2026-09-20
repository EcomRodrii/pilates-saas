-- Auditoría 2026-09-19 · PAY-4 (el libro de intentos de cobro, la respuesta a
-- «me habéis cobrado dos veces») NO EXISTÍA, aunque el registro de migraciones
-- decía que sí.
--
-- Evidencia, contra producción:
--   select to_regclass('public.cobros_intentos')       → NULL
--   select to_regclass('public.sesion_activa_vista')   → NULL
--   select version from supabase_migrations.schema_migrations
--     where version='20260918000200'                   → 1 fila («aplicada»)
--
-- O sea: la migración figura como aplicada y la tabla no está. Dos motivos en
-- el SQL original (`20260918000200_pay4_cobros_intentos.sql`) explican por qué
-- no podía llegar a crearse tal cual:
--
--   1. `studio_id uuid not null` — `studios.id` es **text** en toda la base
--      (igual que `recibos.id`). La columna no habría casado con nada.
--   2. La policy de lectura usa `sesion_activa_vista`, una vista que no existe
--      en este proyecto. El resto del repo resuelve el estudio de la sesión con
--      `public.current_studio_id()`.
--
-- Y el efecto en producción era el peor posible: `registrarIntentoCobro()`
-- (`lib/billing/confirmar-cobro.ts`) insertaba en una tabla inexistente y se
-- tragaba el error con un `.catch(() => {})`. El libro de auditoría de cobros
-- llevaba desde el 18-sep registrando exactamente cero filas, en silencio,
-- mientras la funcionalidad aparentaba estar entregada.
--
-- Esta migración crea la tabla como debía ser. Es aditiva: no toca ninguna
-- tabla existente ni ningún dato.

create table if not exists public.cobros_intentos (
  payment_intent_id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  recibo_id text not null references public.recibos(id) on delete cascade,
  importe_centimos integer not null,
  origen text not null check (origen in ('checkout', 'off_session', 'webhook', 'manual')),
  desenlace text not null check (desenlace in ('cobrado', 'fallido', 'pendiente', 'reintentando')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_cobros_intentos_studio_id on public.cobros_intentos(studio_id);
create index if not exists idx_cobros_intentos_recibo_id on public.cobros_intentos(recibo_id);
-- Para la consulta del detector de dobles: «recibos con más de un intent
-- distinto en los últimos N días».
create index if not exists idx_cobros_intentos_recibo_creado on public.cobros_intentos(recibo_id, creado_en desc);

alter table public.cobros_intentos enable row level security;

-- Lectura acotada al estudio de la sesión. Sin esto, el libro de cobros de
-- TODA la plataforma quedaría legible por cualquier autenticado — que es
-- justo el fallo [C-8] que la auditoría del 2026-09-18 corrigió sobre el papel
-- de una migración que nunca llegó a crear la tabla.
create policy cobros_intentos_lectura_de_su_estudio on public.cobros_intentos
  for select to authenticated
  using (studio_id = public.current_studio_id() and public.puede_ver_finanzas());

-- La escritura es exclusivamente de servidor (webhook de Stripe, cobro
-- off-session, mostrador). `service_role` no pasa por RLS, así que no hace
-- falta policy de escritura: la AUSENCIA de policies de insert/update/delete
-- para `authenticated` es la que garantiza que nadie del cliente pueda
-- falsear el libro. No añadir una por comodidad.
