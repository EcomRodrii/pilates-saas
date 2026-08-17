-- Devolver una sesión al bono, de forma ATÓMICA. Antes era read-modify-write.
--
-- EL FALLO (I-10). El consumo ya era atómico —`consumir_sesion_bono`, un UPDATE
-- condicional que devuelve el saldo nuevo— pero la DEVOLUCIÓN no: se leía
-- `sesiones_restantes` en un snapshot, se calculaba `min(tope, restantes + 1)`
-- en TypeScript y se escribía el resultado. Dos cancelaciones concurrentes de la
-- misma socia leen el mismo valor y escriben el mismo número: una de las dos
-- devoluciones se pierde, sin error por ningún lado. Es la asimetría exacta que
-- el consumo ya había resuelto.
--
-- El tope (no pasar del total del plan) se aplica AQUÍ, en el WHERE, en vez de
-- calcularlo antes: así la condición y la escritura son la misma operación.
-- Devuelve el saldo nuevo, o NULL si no había nada que devolver (bono ya al
-- tope, inexistente, o de otro estudio) — mismo contrato que
-- `consumir_sesion_bono`, que devuelve NULL cuando no descuenta.
--
-- Un plan sin `sesiones` (saldo no acotado) no tiene tope: `p.sesiones is null`
-- deja pasar la devolución siempre.
create or replace function public.devolver_sesion_bono(
  p_suscripcion_id text, p_studio_id text
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_saldo int;
begin
  -- Mismo guardia que consumir_sesion_bono: con sesión de usuario, el estudio
  -- del token manda. Con service-role (`auth.uid()` null) no aplica, igual que
  -- en el resto de RPC de este repo.
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  update public.suscripciones s
     set sesiones_restantes = s.sesiones_restantes + 1
    from public.planes_tarifa p
   where s.id = p_suscripcion_id
     and s.studio_id = p_studio_id
     and p.id = s.plan_id
     and p.studio_id = p_studio_id
     and s.sesiones_restantes is not null
     and (p.sesiones is null or s.sesiones_restantes < p.sesiones)
  returning s.sesiones_restantes into v_saldo;

  return v_saldo;
end;
$function$;

-- Función NUEVA → le aplica el gotcha de pg_default_acl (EXECUTE va directo a
-- anon/authenticated sin pasar por PUBLIC, así que revocar PUBLIC no basta).
-- Mismos privilegios que `consumir_sesion_bono`, que es su espejo: la llama
-- tanto el panel (authenticated) como el servidor (service_role).
revoke all on function public.devolver_sesion_bono(text, text) from public;
revoke all on function public.devolver_sesion_bono(text, text) from anon;
grant execute on function public.devolver_sesion_bono(text, text) to authenticated, service_role;
