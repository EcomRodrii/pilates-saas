-- P2-14: formaliza lo que el código ya asume en 4 sitios distintos — una
-- fila de `instructores` = una persona en una sede, con su propio rol,
-- horario y tarifa. mis_estudios() (0066_cadenas_multisede.sql) ya lista
-- TODAS las sedes de un auth_user_id sin LIMIT 1; current_studio_id() ya
-- hace ORDER BY studio_id LIMIT 1 "porque ahora es un caso central con
-- cadenas, no ya raro"; resolverInstructorId (mi-disponibilidad) ya
-- documenta el riesgo de "ficha duplicada" como conocido. Falta solo la
-- garantía de integridad — verificado con execute_sql antes de escribir
-- esta migración: cero duplicados reales en prod hoy, así que no hace
-- falta migración de limpieza previa.
alter table public.instructores
  add constraint instructores_auth_studio_unique unique (auth_user_id, studio_id);

comment on constraint instructores_auth_studio_unique on public.instructores is
  'P2-14: una persona (auth_user_id) tiene como mucho una fila por sede (studio_id) — permite multi-sede (varias filas, un auth_user_id, distinto studio_id) sin permitir fichas duplicadas dentro de la MISMA sede.';
