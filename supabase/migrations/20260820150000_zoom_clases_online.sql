-- Clases online con Zoom (pedido explícito del fundador, 2026-08-20). El
-- OAuth ya existía completo (lib/zoom.ts, migr 0061) pero crearReunionZoom()
-- no tenía ni un llamador — este cambio añade el flag "online" y las columnas
-- donde el cron de sync (lib/zoom-sync.ts) guarda la reunión creada.
--
-- Diseño de tentare-arquitecto (2026-08-20): el flag va en tipos_clase, NO en
-- sesiones — una propietaria crea "Pilates Online" y todas sus sesiones son
-- online, mismo patrón operativo que ventana_cancelacion_horas. Híbridas
-- puntuales (una sesión suelta online dentro de un tipo presencial) quedan
-- fuera de esta primera entrega a propósito.

alter table public.tipos_clase
  add column es_online boolean not null default false;

comment on column public.tipos_clase.es_online is
  'Clase online con Zoom: el cron lib/zoom-sync.ts crea/actualiza la reunión de las sesiones de este tipo. Bloqueado en UI si el estudio no tiene Zoom conectado (studios.zoom_email).';

alter table public.sesiones
  add column zoom_meeting_id bigint,
  add column zoom_join_url text;

comment on column public.sesiones.zoom_meeting_id is
  'Id de la reunión de Zoom creada por el cron de sync. NULL = todavía sin crear o el tipo de clase no es online.';
comment on column public.sesiones.zoom_join_url is
  'Enlace de acceso a la reunión de Zoom. Solo debe servirse a la instructora de la sesión y a socias con reserva CONFIRMADA — nunca en un select genérico de sesiones del portal.';
