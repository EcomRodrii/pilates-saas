-- ─────────────────────────────────────────────────────────────────────────────
-- Devolver una plaza de matrícula gratis: anotar y devolver, en UNA transacción.
--
-- `liberarCupoMatriculaUnaVez` (lib/billing/matricula-online.ts) hacía dos
-- llamadas separadas: INSERT en `matricula_cupo_liberaciones` y luego la RPC
-- `liberar_cupo_matricula`, que además se tragaba cualquier error. Si la
-- segunda fallaba, la fila de «ya devuelta» quedaba escrita y la plaza NO
-- volvía nunca: ni el reintento del webhook ni el conciliador podían hacer
-- nada, porque el INSERT ya chocaba por 23505.
--
-- Aquí las dos cosas van juntas: o se anota y se devuelve, o no pasa nada y el
-- siguiente intento (webhook o conciliador) lo vuelve a probar.
--
-- La columna `payment_intent_id` es en realidad la CLAVE de la devolución:
-- el PaymentIntent en el checkout embebido y la Checkout Session (`cs_…`) en el
-- Modo A, que caduca sin PI si nadie intentó pagar (#2180). No se renombra:
-- el código desplegado todavía escribe con ese nombre.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.liberar_cupo_matricula_una_vez(
  p_clave text,
  p_plan_id text,
  p_studio_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_insertadas integer;
begin
  -- Solo service_role (webhook y conciliador). El guarda no es decorativo: el
  -- día que cambie la firma, `pg_default_acl` devolverá el EXECUTE a
  -- anon/authenticated sin pedirlo, y esto será lo único en pie. (Con
  -- `es_llamada_servicio()` y no mirando `auth.uid()`: anon tampoco tiene uid.)
  if not public.es_llamada_servicio() then
    raise exception 'NO_AUTORIZADO';
  end if;

  insert into matricula_cupo_liberaciones (payment_intent_id, plan_id, studio_id)
  values (p_clave, p_plan_id, p_studio_id)
  on conflict (payment_intent_id) do nothing;
  get diagnostics v_insertadas = row_count;
  if v_insertadas = 0 then
    return false; -- ya se devolvió para esta clave
  end if;

  update planes_tarifa
     set matricula_gratis_usados = greatest(0, matricula_gratis_usados - 1)
   where id = p_plan_id and studio_id = p_studio_id;
  return true;
end;
$function$;

comment on function public.liberar_cupo_matricula_una_vez(text, text, text) is
  'Devuelve UNA plaza de matrícula gratis por clave (PaymentIntent o Checkout Session), anotando y devolviendo en la misma transacción. Solo service_role.';

comment on column public.matricula_cupo_liberaciones.payment_intent_id is
  'Clave de la devolución: el PaymentIntent (checkout embebido) o la Checkout Session cs_… (Modo A). El nombre es histórico.';

-- ⚠️ Firma nueva: `pg_default_acl` da EXECUTE directo a anon/authenticated.
-- Revocar PUBLIC no basta (.claude/tentare-os.md).
revoke all on function public.liberar_cupo_matricula_una_vez(text, text, text) from public;
revoke all on function public.liberar_cupo_matricula_una_vez(text, text, text) from anon;
revoke all on function public.liberar_cupo_matricula_una_vez(text, text, text) from authenticated;
grant execute on function public.liberar_cupo_matricula_una_vez(text, text, text) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.liberar_cupo_matricula_una_vez(text, text, text)', 'EXECUTE') then
    raise exception 'anon no debería poder ejecutar liberar_cupo_matricula_una_vez';
  end if;
  if has_function_privilege('authenticated', 'public.liberar_cupo_matricula_una_vez(text, text, text)', 'EXECUTE') then
    raise exception 'authenticated no debería poder ejecutar liberar_cupo_matricula_una_vez';
  end if;
  if not has_function_privilege('service_role', 'public.liberar_cupo_matricula_una_vez(text, text, text)', 'EXECUTE') then
    raise exception 'service_role necesita liberar_cupo_matricula_una_vez: el webhook y el conciliador la llaman';
  end if;
end
$$;
