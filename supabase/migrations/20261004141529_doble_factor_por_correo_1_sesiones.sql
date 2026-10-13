-- ═══════════════════════════════════════════════════════════════════════════
-- El segundo paso por CORREO (3-oct-2026, decisión del fundador): al entrar al
-- panel con la verificación en dos pasos activada, lo primero es un código de
-- un solo uso enviado al correo de la cuenta; la app de autenticación queda
-- para «No tengo acceso a mi correo». Reglas en lib/auth/codigo-correo-reglas.ts.
--
-- Cómo encaja con 20261003110108_dispositivos_de_confianza.sql: Supabase no
-- tiene el correo como factor, así que verificar el código NO sube la sesión a
-- `aal2`. El servidor la apunta en `sesiones_confiadas` con origen 'correo', y
-- la regla única `sesion_confiada_de` la acepta. Ni una política cambia:
-- `nivel_acceso_suficiente()`, `current_studio_id()` y `verificarSesionStaff`
-- ya preguntan a esa función.
--
-- Una sesión confiada por correo vale lo que viva la sesión de Supabase (como
-- una `aal2`): se va con ella (cascada con auth.sessions), con el factor, y al
-- cambiar la contraseña o el correo.
--
-- Cuándo el correo NO vale de segundo paso (la regla vive aquí, en
-- `correo_doble_factor_disponible`, no en TypeScript):
--   · La sesión no entró con contraseña (`auth.mfa_amr_claims`, el mismo dato
--     del que sale el claim `amr`): con Google o con un enlace/código por
--     correo, el correo sería el mismo factor dos veces.
--   · Cambió la contraseña o el correo de la cuenta y desde entonces no ha
--     pasado la app de autenticación: con el buzón se restablece la contraseña,
--     y el código llegaría a ese mismo buzón. Regla de negocio, no de reloj: la
--     marca dura hasta un `aal2` de verdad, no 24 horas.
--
-- Lo que el correo no da, a propósito: activar la verificación (hace falta un
-- factor de Supabase), quitar o añadir factores ni apagar «exigir a todo el
-- equipo» (GoTrue / `aal2`), ni la zona interna (/interno, su propio `aal2`).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Esta migración se aplicó en producción en SEIS trozos (4-oct-2026), cada uno
-- con su versión y su nombre, y el repo la tenía en un solo fichero
-- (20261003160000_doble_factor_por_correo.sql). Supabase compara VERSIONES: con
-- el fichero único, «Supabase Preview» fallaba («Remote migration versions not
-- found in local migrations directory») y un `db push` la habría vuelto a
-- aplicar entera. Partida el 14-oct-2026 con el SQL EXACTO de cada trozo
-- (`supabase_migrations.schema_migrations.statements`, comprobado por md5).
-- Trozo 1 de los seis con registro (del 1 al 5, y el 7): sesiones_confiadas: también por correo (columna `origen`).

set local lock_timeout = '8s';
alter table public.sesiones_confiadas add column if not exists origen text not null default 'dispositivo';
alter table public.sesiones_confiadas alter column dispositivo_id drop not null;
alter table public.sesiones_confiadas drop constraint if exists sesiones_confiadas_origen_valido;
alter table public.sesiones_confiadas add constraint sesiones_confiadas_origen_valido
  check (origen in ('dispositivo', 'correo') and (origen = 'dispositivo') = (dispositivo_id is not null));
