-- ═══════════════════════════════════════════════════════════════════════════
-- 0030 · R1 (BLOCKER de seguridad): RLS en los datos de salud de la ficha clínica
-- ═══════════════════════════════════════════════════════════════════════════
--
-- RENUMERADO 2026-07-16 (era 0014_rls_ficha_clinica_salud.sql). Colisionaba con
-- 0014_marca_e_iva.sql: Supabase indexa las migraciones por su token numérico
-- (`0014`), así que en un `db push` solo se registra/aplica un archivo por número
-- y el otro se trata como "ya aplicado" y se omite. Este —el que activa RLS sobre
-- datos de salud (GDPR Art. 9)— es justo el que no debe saltarse nunca. Movido al
-- final de la secuencia con número único. Es 100 % IDEMPOTENTE (ENABLE RLS, DROP
-- POLICY IF EXISTS + CREATE, REVOKE, ALTER DEFAULT PRIVILEGES): re-aplicarlo sobre
-- un entorno donde ya hubiera corrido NO cambia nada. Verifica con
-- scripts/verify-rls-salud.sql antes y después del push.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (due diligence — Consejo Ejecutivo, jul-2026)
-- `condiciones_salud` y `respuestas_sesion` (lesiones, embarazo/postparto,
-- dolor post-clase — dato de CATEGORÍA ESPECIAL, GDPR Art. 9) se crearon SIN RLS
-- (0004_ficha_clinica.sql, que delegaba el control de acceso a la capa de app).
-- Pero por el default `GRANT ALL ON TABLES TO anon` (0000_base.sql:3896/3906,
-- hallazgo M-4 aún abierto) NACIERON accesibles al rol `anon`. Como la anon key
-- es pública (NEXT_PUBLIC_SUPABASE_ANON_KEY, embebida en el bundle) y PostgREST
-- expone public.* en /rest/v1, CUALQUIERA podía leer/escribir/borrar la salud de
-- CUALQUIER socia de CUALQUIER estudio. Fuga cross-tenant de PHI.
--
-- FIX
--   (1) Habilitar RLS y añadir la MISMA política que ya usa `notas_progreso`
--       (admin_notas_progreso): staff autenticado del estudio, aislado por
--       current_studio_id(). Se elige el modelo "staff" (no solo PROPIETARIO)
--       a propósito: las instructoras necesitan ver las restricciones de salud
--       para adaptar la clase (FICHA-CLINICA.md §11; se lee desde /calendario).
--   (2) REVOKE de anon/PUBLIC sobre ambas tablas (defensa en profundidad: sin
--       política para anon, RLS ya lo bloquea; el REVOKE lo cierra también a
--       nivel de tabla).
--   (3) Causa raíz M-4: revocar el default `GRANT ALL ON TABLES TO anon` para
--       que NINGUNA tabla futura vuelva a nacer pública. Solo afecta a objetos
--       creados a partir de ahora; las tablas existentes conservan sus grants
--       explícitos, así que no rompe nada en producción.
--
-- No afecta a los llamadores legítimos:
--   · Panel/staff (navegador) → JWT `authenticated`; current_studio_id() resuelve
--     y la política casa su propio estudio (idéntico a notas_progreso, que ya
--     funciona por este mismo camino en fetchCriticalStudioData).
--   · Crons (revisiones-salud), borrado de socia y endpoints públicos → usan
--     service_role (getSupabaseAdmin), que se salta RLS y no depende de anon.
--   · El portal de la socia NO lee estas tablas por anon (verificado).
-- ═══════════════════════════════════════════════════════════════════════════

-- (1) RLS + política staff aislada por estudio ──────────────────────────────
ALTER TABLE public.condiciones_salud ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respuestas_sesion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_condiciones_salud ON public.condiciones_salud;
CREATE POLICY admin_condiciones_salud ON public.condiciones_salud
  TO authenticated
  USING (studio_id = public.current_studio_id())
  WITH CHECK (studio_id = public.current_studio_id());

DROP POLICY IF EXISTS admin_respuestas_sesion ON public.respuestas_sesion;
CREATE POLICY admin_respuestas_sesion ON public.respuestas_sesion
  TO authenticated
  USING (studio_id = public.current_studio_id())
  WITH CHECK (studio_id = public.current_studio_id());

-- (2) Cerrar el acceso de tabla a anon/PUBLIC en estas dos tablas ────────────
REVOKE ALL ON TABLE public.condiciones_salud FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.respuestas_sesion FROM anon, PUBLIC;

-- (3) Causa raíz M-4: que ninguna tabla FUTURA creada por migraciones (rol
--     `postgres`) nazca accesible por anon. El default equivalente para el rol
--     `supabase_admin` (0000_base.sql:3906) NO se puede tocar desde una migración
--     — Postgres gestionado lo prohíbe (SQLSTATE 42501); si se quisiera cerrar
--     también ese, hay que hacerlo desde el panel/soporte de Supabase. El rol que
--     crea tablas en nuestras migraciones es `postgres`, así que esto cubre el
--     vector de riesgo real (una feature nueva que añada tabla sin RLS).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
