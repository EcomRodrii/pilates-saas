-- F-28 (auditoría 20ª pasada, 1-sep-2026): `crear_reserva_atomica` es un
-- gemelo peligroso de `reservar_plaza` — sin SECURITY DEFINER, sin
-- comprobación de tenant (`p_studio_id`), sin validar bono/plan/ventana de
-- cancelación, y usa `sesiones.aforo_maximo` en crudo en vez del cálculo real
-- de plazas (que descuenta spots bloqueados/reservados). Migración 0029 ya le
-- había revocado el EXECUTE a `anon`/PUBLIC por "código muerto", pero
-- `authenticated` seguía con el privilegio (verificado en vivo con
-- `has_function_privilege`) y la función seguía existiendo.
--
-- Sin ningún caller real (grep exhaustivo sobre lib/app/components: cero
-- resultados) y sin ninguna dependencia en el catálogo aparte de las propias
-- de tipo/lenguaje/namespace (verificado con pg_depend antes de aplicar) —
-- se borra en vez de dejarla revocada, mismo criterio que el resto de esta
-- ronda de auditoría con código muerto (F-19, F-27): una función peligrosa
-- que sigue en el catálogo es una trampa para quien la encuentre con grep y
-- la use pensando que es la vía real.

DROP FUNCTION IF EXISTS public.crear_reserva_atomica(text, text, text, text, text);
