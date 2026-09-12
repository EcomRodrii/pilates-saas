-- ─────────────────────────────────────────────────────────────────────────────
-- `liberar_cupo_matricula` no la llama nadie desde el navegador.
--
-- Devuelve una plaza al contador de matrículas gratis de un plan, y existe para
-- compensar un cobro que no llegó a nacer. Sus CUATRO llamadores son las dos
-- rutas de checkout (`app/api/stripe/checkout`, `app/api/public/checkout-embebido`,
-- dos caminos de fallo cada una) y las cuatro pasan por `getSupabaseAdmin()`,
-- o sea service_role. Ninguna pantalla la invoca.
--
-- El `grant` a `authenticated` de 20260911013944 salió de copiar el de
-- `reservar_matricula`, que sí lo necesita: el mostrador llama a ESA desde el
-- navegador (`dbReservarMatricula`, lib/supabase-data.ts). Esta no, y se quedó
-- el grant por simetría de escritura, no por necesidad.
--
-- Esto NO tapa un agujero: el cuerpo ya la cierra con `validar_studio_mismatch`
-- + `puede_gestionar_clientas()`, y está probado en vivo (una socia recibe
-- STUDIO_MISMATCH; una instructora del estudio correcto, NO_AUTORIZADO). Quita
-- una puerta que no lleva a ninguna parte, en una función que REGALA matrículas.
--
-- ⚠️ El guarda del cuerpo se queda donde está, y no es redundancia decorativa:
-- el día que cambie la FIRMA de esta función, `pg_default_acl` le devolverá el
-- EXECUTE a `authenticated` sin que nadie lo pida —van cinco veces en este
-- repo— y ese día el guarda es lo único que sigue en pie.
--
-- `reservar_matricula` se queda como está: tiene llamador de cliente real.
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.liberar_cupo_matricula(text, text) from authenticated;

-- La migración se comprueba a sí misma. El historial de este repo dice que el
-- comentario SQL de un grant no es prueba de nada: cinco veces ha dicho «nadie
-- del cliente puede llamarla» mientras `authenticated` tenía EXECUTE.
do $$
begin
  if has_function_privilege('anon', 'public.liberar_cupo_matricula(text, text)', 'EXECUTE') then
    raise exception 'anon no debería poder ejecutar liberar_cupo_matricula';
  end if;
  if has_function_privilege('authenticated', 'public.liberar_cupo_matricula(text, text)', 'EXECUTE') then
    raise exception 'el revoke no ha surtido efecto: authenticated sigue pudiendo ejecutar liberar_cupo_matricula';
  end if;
  if not has_function_privilege('service_role', 'public.liberar_cupo_matricula(text, text)', 'EXECUTE') then
    raise exception 'service_role ha perdido el EXECUTE: las dos rutas de checkout no podrían devolver una plaza';
  end if;
  -- Y la que SÍ necesita cliente sigue intacta: si esto salta, el mostrador se
  -- ha quedado sin poder decidir el importe de la matrícula.
  if not has_function_privilege('authenticated', 'public.reservar_matricula(text, text)', 'EXECUTE') then
    raise exception 'reservar_matricula ha perdido authenticated: el mostrador la llama desde el navegador';
  end if;
end
$$;
