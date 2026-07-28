-- ─────────────────────────────────────────────────────────────────────────────
-- P2-9. Exigir plan o bono activo para reservar, por defecto.
--
-- Una clienta SIN plan ni bono activo podía reservar y ocupar plaza igual,
-- porque el DEFAULT de `reserva_exigir_plan` era `false` desde hacía meses y
-- NINGUNO de los 15 estudios lo había cambiado nunca. No es que eligieran
-- dejarlo abierto: es que nadie tomó la decisión. El propio copy de
-- tab-estudio.tsx ya presentaba la opción protectora como la buena.
--
-- SET DEFAULT true para los estudios nuevos + UPDATE de los existentes: al ser
-- un boolean sin marca de "tocado a mano", no hay forma de distinguir un
-- `false` elegido de un `false` heredado — y el reporte que motiva esto es
-- justo de una dueña con el valor heredado.
--
-- Quien de verdad quiera dejar pasar reservas sin plan lo activa a mano desde
-- Configuración → Estudio.
--
-- ── LA OTRA MITAD SE CAYÓ, Y CONVIENE SABER POR QUÉ ─────────────────────────
-- Esta migración se mergeó con una segunda mitad que ponía
-- `cancelacion_devolver_bono_tardia = true`, y estuvo HORAS mergeada sin
-- aplicarse. Al ir a aplicarla se vio que hacía lo contrario de lo que decían
-- su título y su propio comentario:
--
--     debeDevolverBono()  —  lib/booking-logic.ts
--       if (devolverEnTardia) return true;   ← true  = devuelve SIEMPRE
--       return !esCancelacionTardia(...);    ← false = no devuelve si es tardía
--
-- O sea que `true` es la opción PERMISIVA: con ella la ventana de cancelación
-- deja de penalizar nada. Los 15 estudios estaban ya en `false`, así que
-- aplicarla les habría quitado la penalización a todos, en silencio.
--
-- DECISIÓN TOMADA (2026-07-28, el usuario): se queda como está — una
-- cancelación tardía HACE PERDER la sesión. El código quedó alineado con eso
-- en #431 (los cinco `?? true` pasaron a `?? false`) y el copy del ajuste en
-- Configuración dice lo mismo. Base de datos, código y texto coinciden.
--
-- Si algún día se quiere lo contrario, hace falta una migración nueva y volver
-- a tocar esos mismos tres sitios. No se deja aquí a medias.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.studios
  alter column reserva_exigir_plan set default true;

update public.studios
  set reserva_exigir_plan = true
  where reserva_exigir_plan is distinct from true;
