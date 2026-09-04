-- Gap 4 (portal Reservas > Pasadas): valoración mínima de 1-5 estrellas sobre
-- una clase YA ASISTIDA, autoservicio desde el portal. Alcance confirmado por
-- el fundador: solo la cifra, sin comentario, sin relación (todavía) con las
-- estadísticas de instructora.
--
-- ⚠️ Ya existe una tabla `valoraciones` (migr 0044) que TAMBIÉN puntúa 1-5 tras
-- una clase — pero es un mecanismo DISTINTO y deliberadamente separado: se
-- dispara por email/WhatsApp con un token firmado SIN LOGIN
-- (`verificarTokenValoracion`, `app/api/public/valorar/route.ts`), se atribuye
-- a la INSTRUCTORA que dio la clase y alimenta `valoraciones_resumen_estudio()`
-- (ranking de sustituciones/Equipo). Esta columna es un mecanismo PULL (la
-- socia entra a su pestaña "Pasadas" cuando quiera, con su sesión de portal
-- normal, sin token ni caducidad) y no toca ese resumen. Nombre distinto a
-- propósito (`valoracion_experiencia`, no `valoracion`/`puntuacion`) para que
-- un grep de "valorar"/"valoracion" no confunda las dos features.
--
-- Columna, no tabla: a diferencia de 0044 (necesita UNIQUE(socio,sesion)
-- porque el token se puede reenviar varias veces), aquí la RESERVA ya es la
-- unidad 1:1 con la clase de esa socia — mismo patrón que columnas nullable
-- para features opcionales ya usado en el repo (p.ej. sesiones.cancelada_motivo,
-- Fase 2c). El segundo CHECK impide guardar una valoración antes de que la
-- reserva esté ASISTIDA (nunca sobre una clase que aún no ha pasado).
--
-- Sin RLS nueva: el portal de socias NUNCA escribe en Postgres vía RLS directa
-- (lib/db/supabase-portal.ts solo instancia `.auth`, nunca `.from()/.rpc()` —
-- mismo criterio ya documentado en crearPlazaFijaPublica). La única política
-- que existe hoy sobre `reservas` (`admin_reservas`, 0000_base) está scoped a
-- current_studio_id(), que resuelve identidad de STAFF, no de socias — una
-- socia no tiene acceso de fila vía RLS a `reservas` hoy, ni para leer ni para
-- escribir. La cerradura real de esta escritura vive en
-- `valorarExperienciaReservaPublica()` (lib/db/supabase-data-admin.ts):
-- service-role + identidad SIEMPRE del JWT (validarSociaPublica) +
-- `.eq('socio_id', socioId).eq('estado','ASISTIDA').is('valoracion_experiencia', null)`
-- en código — mismo patrón que cancelarReservaPublica/crearPlazaFijaPublica.
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS valoracion_experiencia smallint;

ALTER TABLE public.reservas
  ADD CONSTRAINT reservas_valoracion_experiencia_rango
  CHECK (valoracion_experiencia IS NULL OR (valoracion_experiencia BETWEEN 1 AND 5));

ALTER TABLE public.reservas
  ADD CONSTRAINT reservas_valoracion_experiencia_solo_asistida
  CHECK (valoracion_experiencia IS NULL OR estado = 'ASISTIDA');
