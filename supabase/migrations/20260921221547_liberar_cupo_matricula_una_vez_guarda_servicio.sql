-- La guarda de `liberar_cupo_matricula_una_vez` pasa a `es_llamada_servicio()`.
--
-- La primera versión (20260921221032, ya aplicada) cerraba con
-- `if auth.uid() is not null then raise`, que deja pasar a anon (tampoco tiene
-- uid) el día que `pg_default_acl` le devuelva el EXECUTE tras un cambio de
-- firma. El fichero de 221032 ya lleva el cuerpo definitivo; este existe para
-- que el repo y `schema_migrations` coincidan por nombre.
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
  if not public.es_llamada_servicio() then
    raise exception 'NO_AUTORIZADO';
  end if;

  insert into matricula_cupo_liberaciones (payment_intent_id, plan_id, studio_id)
  values (p_clave, p_plan_id, p_studio_id)
  on conflict (payment_intent_id) do nothing;
  get diagnostics v_insertadas = row_count;
  if v_insertadas = 0 then
    return false;
  end if;

  update planes_tarifa
     set matricula_gratis_usados = greatest(0, matricula_gratis_usados - 1)
   where id = p_plan_id and studio_id = p_studio_id;
  return true;
end;
$function$;

-- Misma firma: conserva los grants. Se revocan igual, por si acaso.
revoke all on function public.liberar_cupo_matricula_una_vez(text, text, text) from public, anon, authenticated;
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
    raise exception 'service_role necesita liberar_cupo_matricula_una_vez';
  end if;
end
$$;
