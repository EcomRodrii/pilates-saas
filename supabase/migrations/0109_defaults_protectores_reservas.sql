-- ─────────────────────────────────────────────────────────────────────────────
-- P2-9. Dos decisiones de negocio que nadie tomó, tomadas en silencio por un
-- DEFAULT false de hace meses:
--
--   · reserva_exigir_plan            → una clienta SIN plan ni bono activo
--                                       podía reservar y ocupar plaza igual.
--   · cancelacion_devolver_bono_tardia → una cancelación tardía devolvía la
--                                       sesión del bono como si no hubiera
--                                       pasado nada — la ventana de aviso no
--                                       protegía nada en la práctica.
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

alter table public.studios
  alter column reserva_exigir_plan set default true,
  alter column cancelacion_devolver_bono_tardia set default true;

update public.studios
  set reserva_exigir_plan = true
  where reserva_exigir_plan is distinct from true;

update public.studios
  set cancelacion_devolver_bono_tardia = true
  where cancelacion_devolver_bono_tardia is distinct from true;
