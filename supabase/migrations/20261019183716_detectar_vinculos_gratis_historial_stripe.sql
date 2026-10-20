-- Vínculos del plan gratis (3): la detección mira el historial de cuentas de
-- Stripe (cuentas_stripe_vistas) y apunta la de hoy cada vez que mide.

create or replace function public.detectar_vinculos_gratis(
  p_studio text,
  p_min_comunes integer,
  p_pct_comunes numeric
) returns table (vinculado_id text, motivo text, cuenta boolean, nuevo boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
-- Las columnas de RETURNS TABLE son variables: sin la línea de arriba, el ON
-- CONFLICT y los nombres de columna chocan (42702, ya pisado en este repo).
declare
  v_owner uuid;
  v_stripe text;
  v_nif text;
begin
  select s.owner_auth_user_id, nullif(btrim(s.stripe_account_id), ''),
         nullif(upper(regexp_replace(coalesce(s.nif, ''), '[^A-Za-z0-9]', '', 'g')), '')
    into v_owner, v_stripe, v_nif
    from studios s where s.id = p_studio;
  if not found then return; end if;
  if v_nif is not null and length(v_nif) < 8 then v_nif := null; end if;

  -- La cuenta de Stripe de hoy queda apuntada: si mañana la desconecta para
  -- llevársela a otra cuenta, el rastro sigue aquí.
  if v_stripe is not null then
    insert into cuentas_stripe_vistas (stripe_account_id, studio_id)
      values (v_stripe, p_studio) on conflict do nothing;
  end if;

  return query
  -- Las alumnas de este estudio, con su correo y su móvil (los 9 últimos dígitos).
  with mias as (
    select so.id,
           nullif(lower(btrim(so.email)), '') as e,
           case when length(regexp_replace(coalesce(so.telefono, ''), '\D', '', 'g')) >= 9
                then right(regexp_replace(so.telefono, '\D', '', 'g'), 9) end as t
      from socios so
     where so.studio_id = p_studio and so.borrado_en is null
  ),
  tot as (select count(*)::integer as n from mias),
  otros as (
    select s.id, s.nif, s.subscription_status, u.excedido_desde
      from studios s
      left join uso_plan_gratis u on u.studio_id = s.id
     where s.id <> p_studio
       and s.owner_auth_user_id is distinct from v_owner
  ),
  -- Solo para alumnas y huella: el otro ya se pasó o está cerrado.
  pasados as (
    select o.id from otros o
     where o.subscription_status = 'gratis_cerrado' or o.excedido_desde is not null
  ),
  comunes as (
    select o.studio_id as otro, count(distinct m.id)::integer as n
      from mias m
      join socios o
        on o.borrado_en is null
       and o.studio_id in (select p.id from pasados p)
       and ((m.e is not null and lower(btrim(o.email)) = m.e)
         or (m.t is not null and length(regexp_replace(coalesce(o.telefono, ''), '\D', '', 'g')) >= 9
             and right(regexp_replace(o.telefono, '\D', '', 'g'), 9) = m.t))
     group by o.studio_id
  ),
  mia as (select h.ip_hmac, h.dispositivo_hmac from huellas_alta h where h.studio_id = p_studio),
  candidatos as (
    -- La cuenta de Stripe de este estudio, la tenga el otro ahora o la tuviera antes.
    select o.id as otro, 'stripe'::text as mot, true as cta, '{}'::jsonb as det
      from otros o
     where v_stripe is not null
       and exists (select 1 from cuentas_stripe_vistas c where c.studio_id = o.id and c.stripe_account_id = v_stripe)
    union all
    select o.id, 'nif', true, '{}'::jsonb
      from otros o
     where v_nif is not null
       and upper(regexp_replace(coalesce(o.nif, ''), '[^A-Za-z0-9]', '', 'g')) = v_nif
    union all
    select c.otro, 'alumnas', true, jsonb_build_object('comunes', c.n, 'total', tot.n)
      from comunes c, tot
     where c.n >= p_min_comunes and c.n >= ceil(p_pct_comunes * tot.n)
    union all
    select h.studio_id, 'dispositivo', false, '{}'::jsonb
      from huellas_alta h, mia
     where h.studio_id in (select p.id from pasados p)
       and mia.dispositivo_hmac is not null and h.dispositivo_hmac = mia.dispositivo_hmac
    union all
    select h.studio_id, 'ip', false, '{}'::jsonb
      from huellas_alta h, mia
     where h.studio_id in (select p.id from pasados p)
       and mia.ip_hmac is not null and h.ip_hmac = mia.ip_hmac
  ),
  escritos as (
    insert into vinculos_cuentas_gratis as v (studio_id, vinculado_id, motivo, cuenta, detalle)
    select p_studio, c.otro, c.mot, c.cta, c.det from candidatos c
    on conflict (studio_id, vinculado_id, motivo)
      do update set detalle = excluded.detalle
    returning v.vinculado_id, v.motivo, v.cuenta, (xmax = 0) as es_nuevo
  )
  select e.vinculado_id, e.motivo, e.cuenta, e.es_nuevo from escritos e;
end;
$$;

revoke execute on function public.detectar_vinculos_gratis(text, integer, numeric) from public;
revoke execute on function public.detectar_vinculos_gratis(text, integer, numeric) from anon;
revoke execute on function public.detectar_vinculos_gratis(text, integer, numeric) from authenticated;
grant execute on function public.detectar_vinculos_gratis(text, integer, numeric) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.detectar_vinculos_gratis(text, integer, numeric)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.detectar_vinculos_gratis(text, integer, numeric)', 'EXECUTE')
     or has_table_privilege('authenticated', 'public.cuentas_stripe_vistas', 'SELECT') then
    raise exception 'la detección del plan gratis no puede tocarse desde el navegador';
  end if;
end $$;
