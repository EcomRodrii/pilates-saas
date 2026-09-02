-- ─────────────────────────────────────────────────────────────────────────────
-- Prospección en frío: outreach de Tentare (empresa) a estudios que todavía no
-- son clientes. Dos piezas.
--
-- 1) `plataforma_lead` gana `web` e `instagram`, y un origen nuevo.
--
--    Un prospecto de una lista fría ES un lead: tiene email, tiene estado, y si
--    contesta entra en el mismo embudo que el resto. Crear una tabla aparte de
--    "prospectos" habría partido el CRM en dos sitios que luego hay que
--    sincronizar a mano cuando uno responde.
--
--    `IMPORT_PROSPECTOS` como origen propio, y no reutilizar 'MANUAL', porque
--    un frío convierte MUCHO peor que quien entra solo por el concierge.
--    Mezclarlos falsearía el % de conversión que ya pinta `resumirEmbudo`
--    (lib/interno/crecimiento.ts) — el número seguiría saliendo, pero dejaría
--    de significar nada.
--
-- 2) `plataforma_prospeccion_email`: el borrador de correo por lead.
--
--    Tabla propia y no columnas en `plataforma_lead` porque un correo tiene su
--    propio ciclo (BORRADOR → APROBADO → ENVIADO/FALLIDO) que no es el ciclo
--    del lead, y porque el histórico de POR QUÉ un envío falló tiene que
--    quedar auditable sin leer logs — mismo criterio que ya separó
--    `penalizaciones` de una columna en `reservas`.
--
--    Nombre `prospeccion` y no `campana`: `campanas` ya existe y es otra cosa
--    —campañas de un estudio cliente a SUS socias, multi-tenant y con RLS por
--    studio_id—. Llamarlas igual habría confundido también al código
--    (`mapCampana`, `RowCampanas` ya están cogidos).
--
-- RLS activa y CERO políticas en la tabla nueva, igual que `plataforma_lead`
-- (0136) y `plataforma_admin`: deny by default. Solo entra el service-role, y
-- solo después de que `exigirPermiso(req, 'marketing.send')` haya validado en
-- el servidor. Aquí vive el email de una persona que no es clienta de nadie.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.plataforma_lead
  add column if not exists web       text,
  add column if not exists instagram text;

comment on column public.plataforma_lead.web is
  'Web del estudio prospecto. Contexto para redactar el outreach, no se visita automáticamente.';
comment on column public.plataforma_lead.instagram is
  'Handle de Instagram (con o sin @). Mismo propósito que `web`.';

-- El CHECK de `origen` se recrea entero: Postgres no sabe "añadir un valor" a
-- un check existente. Mismos cinco de antes más el nuevo.
alter table public.plataforma_lead drop constraint if exists plataforma_lead_origen_check;
alter table public.plataforma_lead add constraint plataforma_lead_origen_check
  check (origen in ('CONCIERGE', 'ALTA', 'SOPORTE', 'MANUAL', 'REFERIDO', 'IMPORT_PROSPECTOS'));

create table if not exists public.plataforma_prospeccion_email (
  id            text primary key,
  lead_id       text not null references public.plataforma_lead(id) on delete cascade,
  asunto        text not null,
  cuerpo        text not null,
  estado        text not null default 'BORRADOR'
                  check (estado in ('BORRADOR', 'APROBADO', 'ENVIADO', 'FALLIDO', 'DESCARTADO')),
  -- Quién dio el visto bueno. Sin FK a plataforma_admin, mismo motivo que
  -- `plataforma_lead.responsable`: que alguien deje el equipo no debe bloquear
  -- su baja ni dejar huérfano el histórico.
  aprobado_por  uuid,
  aprobado_en   timestamptz,
  enviado_en    timestamptz,
  -- El error SMTP crudo. Sirve para distinguir "credenciales mal" de "ese
  -- buzón no existe", que se arreglan de forma muy distinta.
  error         text,
  generado_en   timestamptz not null default now(),
  creado_en     timestamptz not null default now()
);

-- ⚠️ La defensa REAL contra enviar dos veces al mismo estudio, y va en la BD a
-- propósito: un doble clic, un reintento de Inngest tras enviar pero antes de
-- memoizar, o un bug futuro en la cola no pueden saltársela. El índice es
-- PARCIAL — un lead puede acumular un DESCARTADO y un BORRADOR nuevo sin
-- problema; lo único irrepetible es ENVIADO.
create unique index if not exists uq_prospeccion_lead_enviado
  on public.plataforma_prospeccion_email (lead_id)
  where estado = 'ENVIADO';

-- La consulta de la pantalla: la cola de revisión, lo más reciente primero.
create index if not exists idx_prospeccion_estado
  on public.plataforma_prospeccion_email (estado, generado_en desc);

alter table public.plataforma_prospeccion_email enable row level security;
revoke all on public.plataforma_prospeccion_email from public, anon, authenticated;

comment on table public.plataforma_prospeccion_email is
  'Borradores de outreach en frío de Tentare. RLS sin políticas: solo service-role tras validar marketing.send.';
