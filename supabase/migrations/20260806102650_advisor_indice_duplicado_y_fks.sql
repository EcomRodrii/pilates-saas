-- Higiene de índices salida del advisor de rendimiento de Supabase
-- (get_advisors type=performance, 2026-08-06). De los 99 hallazgos, estos son
-- los únicos con una acción segura y clara; el porqué de los otros 97 está
-- escrito abajo, para que nadie los "arregle" más adelante sin saber esto.
--
-- ─── 1. Índice duplicado en facturas ────────────────────────────────────────
-- `facturas` tenía DOS índices UNIQUE idénticos sobre (studio_id,
-- numero_completo):
--
--   facturas_studio_numero_completo_key  ← respalda la RESTRICCIÓN, 1432 usos
--   uq_facturas_studio_numero            ← suelto, 1 uso
--
-- Se va el suelto. La unicidad NO se relaja: la restricción sigue en pie, que
-- es lo que importa porque el número de factura tiene requisito legal de
-- unicidad (Veri*Factu). Verificado en vivo con BEGIN/ROLLBACK antes de
-- escribir esto: tras el borrado queda 1 índice sobre numero_completo y la
-- restricción unique sigue existiendo.
--
-- Se hace en dos pasos (drop constraint + drop index) porque no está claro de
-- qué migración antigua salió cada uno, y `uq_facturas_studio_numero` podría
-- haber llegado como índice suelto o como restricción según el camino. Ambas
-- sentencias son idempotentes.
alter table public.facturas drop constraint if exists uq_facturas_studio_numero;
drop index if exists public.uq_facturas_studio_numero;

-- ─── 2. Claves foráneas sin índice que las cubra ────────────────────────────
-- Sin índice, borrar la fila PADRE obliga a un escaneo secuencial de la tabla
-- hija para comprobar la integridad referencial. Hoy no se nota (las tablas
-- son pequeñas), pero es barato dejarlo bien antes de que crezcan.
create index if not exists idx_changelog_versiones_creado_por
  on public.changelog_versiones (creado_por);

create index if not exists idx_intentos_reserva_fallidos_sesion
  on public.intentos_reserva_fallidos (sesion_id);

create index if not exists idx_intentos_reserva_fallidos_tipo_clase
  on public.intentos_reserva_fallidos (tipo_clase_id);

create index if not exists idx_lecturas_ficha_salud_socio
  on public.lecturas_ficha_salud (socio_id);

-- ─── Lo que este archivo NO hace, a propósito ───────────────────────────────
--
-- ⚠️ NO borra los 73 "unused_index" que reporta el advisor, y no es un olvido:
-- son el 74% del informe y borrarlos sería un error. Las tablas que más
-- escaneo secuencial acumulan son diminutas — `studios` 9 filas, `instructores`
-- 10, `facturas` 17, `salas` 6 — así que el planificador elige seq scan porque
-- caben en una página, no porque los índices sobren. "Sin usar" aquí significa
-- "la base de datos todavía es pequeña", y quitarlos optimizaría para 9
-- estudios a costa de justo cuando haya 900. Volver a mirarlo cuando algún
-- estudio real tenga volumen, no antes.
--
-- ⚠️ NO toca los 20 "multiple_permissive_policies". Fusionar dos políticas
-- permisivas en una cambia la superficie de seguridad, y en este repo eso pasa
-- por `tentare-seguridad`, no por un arreglo de rendimiento al paso.
--
-- ⚠️ NO envuelve el `auth.uid()` del único "auth_rls_initplan" que queda
-- (`staff_escribe_mensajes_equipo`). Es un with_check de INSERT sobre el chat
-- del equipo: se evalúa por fila insertada y ahí se inserta un mensaje cada
-- vez. El "suboptimal at scale" del advisor no aplica a inserciones de una fila.
--
-- ⚠️ Y una corrección para el registro: durante la auditoría se llegó a
-- sospechar de "409 llamadas a current_studio_id() sin envolver en (select …)".
-- Es FALSO. El advisor no mira funciones propias (solo auth.*), así que ni lo
-- confirmaba ni lo desmentía — y el plan real lo zanja:
--
--   explain (costs off) select id from reservas where studio_id = current_studio_id();
--   →  Index Scan using idx_reservas_studio_socio on reservas
--        Index Cond: (studio_id = current_studio_id())
--
-- Se evalúa UNA vez para posicionar el índice, no por fila: la función es
-- STABLE y sin argumentos, así que Postgres la iza. No hay nada que arreglar.
