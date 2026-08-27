-- Community & Messaging OS — pieza correctiva: índices sobre FK que el
-- advisor de rendimiento marcó como faltantes tras aplicar el esquema
-- (`get_advisors`, INFO `unindexed_foreign_keys`). No cambia RLS ni RPC.
create index if not exists idx_conversacion_participantes_socio_id
  on public.conversacion_participantes(socio_id);
create index if not exists idx_conversaciones_ancla_reserva_id
  on public.conversaciones(ancla_reserva_id);
create index if not exists idx_conversaciones_ancla_sesion_id
  on public.conversaciones(ancla_sesion_id);
create index if not exists idx_mensajes_remitente_auth_user_id
  on public.mensajes(remitente_auth_user_id);
create index if not exists idx_mensajes_studio_id
  on public.mensajes(studio_id);
