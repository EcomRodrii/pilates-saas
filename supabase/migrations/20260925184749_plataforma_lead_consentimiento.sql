-- ─────────────────────────────────────────────────────────────────────────────
-- El historial del permiso para enviar novedades, solo de añadir.
--
-- Las columnas `consentimiento_*` y `baja_en` de `plataforma_lead` (migr
-- 20260925182615) son el ESTADO ACTUAL: se reescriben con cada solicitud,
-- confirmación o baja. Pero la prueba de un consentimiento (LSSI art. 21, RGPD
-- art. 7.1) es su historia: qué texto se aceptó, cuándo, y cuándo se confirmó
-- o se retiró. Si solo existiera el estado actual, un envío anónimo del
-- formulario público con la casilla marcada pisaría el texto y la fecha de la
-- solicitud anterior de esa persona, y con ellos la prueba.
--
-- Aquí cada hecho es una fila que no se toca nunca:
--   · SOLICITUD    marcó la casilla (con el texto exacto y el recurso).
--   · CONFIRMACION pulsó «Sí, quiero recibirlas» en el correo de ESA solicitud
--                  (`solicitud_id`): el enlace va atado a la solicitud, no a la
--                  última que haya, que pudo crear otra persona.
--   · BAJA         pidió no recibir más.
--   · ANULADO      el permiso dejó de valer por otra causa (se cambió el email
--                  del lead en el CRM: el permiso era de la dirección vieja).
--
-- Solo de añadir por PERMISOS, no por convención: el service-role (el único que
-- entra) tiene SELECT e INSERT y nada más. Sin UPDATE ni DELETE, la historia no
-- se puede reescribir ni por error desde el código. Si se borra el lead (una
-- supresión RGPD), su historial se va con él (ON DELETE CASCADE): lo que pide
-- quien ejerce ese derecho es justo que no quede nada.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.plataforma_lead_consentimiento (
  id           text primary key default gen_random_uuid()::text,
  lead_id      text not null references public.plataforma_lead (id) on delete cascade,
  tipo         text not null check (tipo in ('SOLICITUD', 'CONFIRMACION', 'BAJA', 'ANULADO')),
  texto        text,
  recurso      text,
  solicitud_id text references public.plataforma_lead_consentimiento (id) on delete cascade,
  creado_en    timestamptz not null default now(),
  constraint plataforma_lead_consentimiento_solicitud_con_texto check (tipo <> 'SOLICITUD' or texto is not null),
  constraint plataforma_lead_consentimiento_confirmacion_de_algo check (tipo <> 'CONFIRMACION' or solicitud_id is not null)
);

create index if not exists idx_plataforma_lead_consentimiento_lead
  on public.plataforma_lead_consentimiento (lead_id, creado_en desc);

alter table public.plataforma_lead_consentimiento enable row level security;

-- RLS activa y cero políticas, como `plataforma_lead`: solo el service-role.
-- Y el service-role, sin UPDATE, DELETE ni TRUNCATE: la historia no se reescribe.
revoke all on table public.plataforma_lead_consentimiento from public, anon, authenticated;
revoke update, delete, truncate on table public.plataforma_lead_consentimiento from service_role;
grant select, insert on table public.plataforma_lead_consentimiento to service_role;
