-- Fase 2 de la propuesta "Growth Widget" (auditoría del widget de reservas):
-- infraestructura de analítica del funnel del widget público — hoy no existe
-- NADA (confirmado con grep exhaustivo: sin GA/PostHog/Sentry-para-eventos/
-- tabla propia). Sin esto, ninguna afirmación de "esto convierte mejor" sobre
-- cambios futuros del widget se puede demostrar.
--
-- Anónimo por diseño: `session_id` lo genera el navegador (sessionStorage,
-- se pierde al cerrar la pestaña), sin relación con `socios`. Solo escribe el
-- endpoint público vía service-role — mismo patrón que
-- `intentos_reserva_fallidos` (fire-and-forget, nunca bloquea el flujo real).
create table if not exists public.widget_eventos (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  session_id text not null,
  tipo text not null check (tipo in (
    'widget_loaded', 'widget_viewed', 'class_list_viewed', 'class_selected',
    'class_detail_viewed', 'recommendation_started', 'recommendation_completed',
    'booking_started', 'checkout_started', 'booking_completed',
    'lead_started', 'lead_completed', 'booking_abandoned'
  )),
  -- Sesión de clase asociada, cuando el evento es sobre una clase concreta
  -- (class_selected/booking_started/booking_completed...). ON DELETE SET NULL:
  -- el evento histórico se queda aunque la sesión de clase se borre.
  sesion_clase_id text references public.sesiones(id) on delete set null,
  -- Lead-id crudo del widget (?ref=), mismo criterio que socios.origen_lead —
  -- texto libre sin interpretar, para poder cruzar el funnel por campaña.
  origen text,
  creado_en timestamptz not null default now()
);

create index if not exists idx_widget_eventos_studio_fecha
  on public.widget_eventos (studio_id, creado_en desc);
create index if not exists idx_widget_eventos_studio_tipo
  on public.widget_eventos (studio_id, tipo, creado_en desc);
create index if not exists idx_widget_eventos_session
  on public.widget_eventos (session_id);

comment on table public.widget_eventos is
  'Fase 2 "Growth Widget": eventos anónimos del funnel del widget público de reservas. Nunca PII — session_id es del navegador, no de una socia. Solo escribe /api/public/evento vía service-role.';

alter table public.widget_eventos enable row level security;

-- Mismo criterio que intentos_reserva_fallidos: solo lectura para quien
-- puede ver el negocio agregado del estudio. Sin policy de escritura para
-- authenticated/anon — el service-role no la necesita (bypassa RLS).
create policy widget_eventos_lectura on public.widget_eventos
  for select to authenticated
  using (
    studio_id = public.current_studio_id()
    and public.current_rol() in ('PROPIETARIO', 'MANAGER')
  );
