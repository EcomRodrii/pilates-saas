-- RLS-4 (auditoría 2026-09-16): siete tablas con `studio_id` (columna sobre
-- la que la RLS de todo el repo filtra por estudio) sin índice — cada
-- política evaluaba un scan completo de la tabla en vez de un lookup.
-- Puramente aditivo, sin cambio de comportamiento.
create index if not exists idx_matricula_cupo_liberaciones_studio_id on public.matricula_cupo_liberaciones (studio_id);
create index if not exists idx_oauth_codigos_autorizacion_studio_id on public.oauth_codigos_autorizacion (studio_id);
create index if not exists idx_red_resenas_studio_id on public.red_resenas (studio_id);
create index if not exists idx_respuestas_cuestionario_salud_studio_id on public.respuestas_cuestionario_salud (studio_id);
create index if not exists idx_sesion_activa_studio_id on public.sesion_activa (studio_id);
create index if not exists idx_socio_companeras_studio_id on public.socio_companeras (studio_id);
create index if not exists idx_valoraciones_iniciales_salud_studio_id on public.valoraciones_iniciales_salud (studio_id);
