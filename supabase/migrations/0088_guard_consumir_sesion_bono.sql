-- 0088 · F0 (audit A1 / pentest) — cerrar `consumir_sesion_bono` sin guardia de tenant.
--
-- ANTES: función SECURITY DEFINER en LANGUAGE sql, un UPDATE puro, ejecutable por
-- `authenticated` vía REST y SIN validar el estudio del que llama. Cualquier usuario
-- autenticado podía decrementar el saldo del bono de cualquier socia conociendo su
-- `suscripcion_id` (escritura cross-tenant / griefing). Es la única de la familia de
-- RPC de créditos/bonos que NO llevaba el guardia; sus hermanas (ajustar_creditos,
-- reservar_plaza, crear_recuperacion, congelar_suscripcion) sí.
--
-- AHORA: mismo guardia que las hermanas. Si la llamada es autenticada (cliente del
-- panel), `p_studio_id` debe coincidir con `current_studio_id()`; las llamadas
-- service-role (rutas de servidor, `auth.uid()` nulo) lo saltan — la identidad ya se
-- validó en la ruta. Se reescribe a plpgsql para poder hacer el RAISE. El
-- comportamiento de retorno se preserva: devuelve el saldo tras el descuento, o NULL
-- si no había sesión que descontar (el llamante lo trata como SIN_SESION).
--
-- NO se hace REVOKE EXECUTE: la ruta del panel llama esta RPC con el cliente
-- autenticado del staff (igual que ajustar_creditos), así que el guardia —no el
-- REVOKE— es la defensa, consistente con el resto de la familia. El REVOKE + rutas
-- server-side es el endurecimiento uniforme de la superficie SECURITY DEFINER (F3).

create or replace function public.consumir_sesion_bono(p_suscripcion_id text, p_studio_id text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_saldo int;
begin
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  update public.suscripciones
     set sesiones_restantes = sesiones_restantes - 1
   where id = p_suscripcion_id
     and studio_id = p_studio_id
     and sesiones_restantes > 0
  returning sesiones_restantes into v_saldo;

  return v_saldo;
end;
$function$;
