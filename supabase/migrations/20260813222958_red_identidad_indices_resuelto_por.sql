-- get_advisors (performance): FK sin índice de cobertura en resuelto_por,
-- en ambas tablas nuevas — el endpoint de admin (Fase 3) va a filtrar/unir
-- por resuelto_por (auditoría "qué resolvió tal persona del equipo").
create index idx_red_verificaciones_identidad_resuelto_por on public.red_verificaciones_identidad (resuelto_por);
create index idx_red_certificaciones_resuelto_por on public.red_certificaciones (resuelto_por);
