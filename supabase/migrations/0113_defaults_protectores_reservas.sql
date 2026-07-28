-- ─────────────────────────────────────────────────────────────────────────────
-- P2-9. Dos decisiones de negocio que nadie tomó, tomadas en silencio por un
-- DEFAULT false de hace meses:
--
--   · reserva_exigir_plan            → una clienta SIN plan ni bono activo
--                                       podía reservar y ocupar plaza igual.
--   · cancelacion_devolver_bono_tardia → APARCADO. Ver la corrección de abajo:
--                                       el SQL original hacía lo contrario de
--                                       lo que decía este párrafo.
--
-- Las dos costaban dinero de la misma forma que P2-7 (bonos por tipo de
-- clase): el sistema dejaba pasar lo que el negocio no quería. El propio
-- copy de tab-estudio.tsx ya llamaba "(recomendado)" a la opción protectora
-- sin activarla. Ahora el default protege, y quien de verdad quiera dejar
-- pasar reservas sin plan o devolver bonos en tardías lo activa a mano desde
-- Configuración → Estudio.
--
-- SET DEFAULT true para estudios nuevos + UPDATE de los existentes: al ser
-- boolean sin marca de "tocado a mano", no hay forma de distinguir un false
-- que alguien eligió de un false que nunca se decidió — y el reporte que
-- motiva esto es justo de una dueña con el valor heredado, no elegido.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- CORRECCIÓN (2026-07-27): esta migración se mergeó pero NUNCA llegó a
-- aplicarse en producción, y al ir a aplicarla se vio que su segunda mitad
-- hacía lo CONTRARIO de lo que dice el título del PR y este mismo comentario.
--
--   `debeDevolverBono()` (lib/booking-logic.ts:29):
--       if (devolverEnTardia) return true;   ← true = devuelve SIEMPRE
--       return !esCancelacionTardia(...);    ← false = no devuelve si es tardía
--
-- Es decir, `cancelacion_devolver_bono_tardia = true` es la opción PERMISIVA:
-- con ella la ventana de cancelación deja de penalizar nada. Los 15 estudios de
-- producción estaban ya en `false` (la sesión se pierde si se cancela tarde),
-- así que aplicarla tal cual les habría QUITADO la penalización a todos.
--
-- El copy del ajuste en tab-estudio.tsx dice lo mismo que el SQL («Activado
-- (recomendado): la sesión se devuelve aunque sea tardía»), así que la
-- contradicción está entre el enunciado y el código, no dentro del código.
--
-- Se aplica solo la mitad sin ambigüedad —exigir plan— y la política de
-- cancelación se queda como estaba, a la espera de decidirla a propósito y no
-- de arrastre. Decisión del usuario.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- DECISIÓN (2026-07-27): Marco confirma la opción 1 — la clienta PIERDE la
-- sesión del bono si cancela tarde (`cancelacion_devolver_bono_tardia = false`,
-- que es justo el valor con el que ya estaban los 15 estudios de producción).
-- Coherente con el título original de este PR y con el copy de tab-estudio.tsx.
-- Cierra la ambigüedad de la CORRECCIÓN de arriba: no hay una segunda mitad
-- pendiente de aplicar. `false` sigue siendo el DEFAULT de la columna y ningún
-- estudio necesita backfill — no hace falta SQL adicional aquí.
--
-- El código de aplicación (fallbacks + copy) se realineó con este mismo valor
-- en PR #431, que había quedado apuntando a `true` por el mismo malentendido
-- que esta migración.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.studios
  alter column reserva_exigir_plan set default true;

update public.studios
  set reserva_exigir_plan = true
  where reserva_exigir_plan is distinct from true;
