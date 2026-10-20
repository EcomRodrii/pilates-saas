-- ═══════════════════════════════════════════════════════════════════════════
-- Vínculos del plan gratis (5): solo puede salir perjudicado quien copia.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La detección pasa a ir SIEMPRE del estudio medido (el nuevo) a uno más antiguo
-- de otra dueña que ya se pasó o está cerrado, y alumnas y NIF se comparan contra
-- `rastro_gratis` visto antes del alta del nuevo. La cuenta de Stripe también se
-- busca en la anterior (`stripe_account_id_anterior`). Permisos sin cambios
-- (CREATE OR REPLACE conserva el ACL: solo service_role, verificado).

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
--
-- Solo puede salir perjudicado el estudio que copia: el vínculo va del estudio
-- medido (el NUEVO) a uno MÁS ANTIGUO que ya se pasó o está cerrado, y alumnas y
-- NIF solo cuentan con lo que el servidor ya vio en el viejo ANTES del alta del
-- nuevo (rastro_gratis). Importar hoy las alumnas o el NIF de otra no le hace nada.
declare
  v_owner uuid;
  v_creado timestamptz;
  v_stripe text;
  v_stripe_ant text;
  v_nif text;
begin
  select s.owner_auth_user_id, s.creado_en, nullif(btrim(s.stripe_account_id), ''),
         nullif(btrim(s.stripe_account_id_anterior), ''),
         nullif(upper(regexp_replace(coalesce(s.nif, ''), '[^A-Za-z0-9]', '', 'g')), '')
    into v_owner, v_creado, v_stripe, v_stripe_ant, v_nif
    from studios s where s.id = p_studio;
  if not found then return; end if;
  if v_nif is not null and length(v_nif) < 8 then v_nif := null; end if;

  -- El rastro de ESTE estudio, con la hora del servidor: lo que un estudio nuevo
  -- comparará mañana con él.
  insert into cuentas_stripe_vistas (stripe_account_id, studio_id)
    select x, p_studio from unnest(array[v_stripe, v_stripe_ant]) x where x is not null
    on conflict do nothing;
  if v_nif is not null then
    insert into rastro_gratis (studio_id, tipo, clave)
      values (p_studio, 'nif', encode(sha256(convert_to(v_nif, 'UTF8')), 'hex'))
      on conflict do nothing;
  end if;
  insert into rastro_gratis (studio_id, tipo, clave)
    select distinct p_studio, 'alumna', encode(sha256(convert_to(k, 'UTF8')), 'hex')
      from socios so
      cross join lateral (values
        ('e:' || nullif(lower(btrim(so.email)), '')),
        (case when length(regexp_replace(coalesce(so.telefono, ''), '\D', '', 'g')) >= 9
              then 't:' || right(regexp_replace(so.telefono, '\D', '', 'g'), 9) end)) as v(k)
     where so.studio_id = p_studio and so.borrado_en is null and k is not null
    on conflict do nothing;

  return query
  with mias as (
    select so.id, encode(sha256(convert_to(k, 'UTF8')), 'hex') as clave
      from socios so
      cross join lateral (values
        ('e:' || nullif(lower(btrim(so.email)), '')),
        (case when length(regexp_replace(coalesce(so.telefono, ''), '\D', '', 'g')) >= 9
              then 't:' || right(regexp_replace(so.telefono, '\D', '', 'g'), 9) end)) as v(k)
     where so.studio_id = p_studio and so.borrado_en is null and k is not null
  ),
  tot as (
    select count(*)::integer as n from socios so where so.studio_id = p_studio and so.borrado_en is null
  ),
  -- Más antiguos, de otra dueña, y que ya se pasaron o están cerrados.
  viejos as (
    select s.id
      from studios s
      left join uso_plan_gratis u on u.studio_id = s.id
     where s.id <> p_studio
       and s.owner_auth_user_id is distinct from v_owner
       and s.creado_en < v_creado
       and (s.subscription_status = 'gratis_cerrado' or u.excedido_desde is not null)
  ),
  comunes as (
    select r.studio_id as otro, count(distinct m.id)::integer as n
      from mias m
      join rastro_gratis r
        on r.tipo = 'alumna' and r.clave = m.clave and r.visto_en < v_creado
       and r.studio_id in (select vj.id from viejos vj)
     group by r.studio_id
  ),
  mia as (select h.ip_hmac, h.dispositivo_hmac from huellas_alta h where h.studio_id = p_studio),
  candidatos as (
    -- La cuenta de Stripe solo la escribe el servidor: no se puede falsificar.
    select vj.id as otro, 'stripe'::text as mot, true as cta, '{}'::jsonb as det
      from viejos vj
     where exists (select 1 from cuentas_stripe_vistas c
                    where c.studio_id = vj.id and c.stripe_account_id in (v_stripe, v_stripe_ant))
    union all
    select r.studio_id, 'nif', true, '{}'::jsonb
      from rastro_gratis r
     where v_nif is not null and r.tipo = 'nif'
       and r.clave = encode(sha256(convert_to(v_nif, 'UTF8')), 'hex')
       and r.visto_en < v_creado
       and r.studio_id in (select vj.id from viejos vj)
    union all
    select c.otro, 'alumnas', true, jsonb_build_object('comunes', c.n, 'total', tot.n)
      from comunes c, tot
     where c.n >= p_min_comunes and c.n >= ceil(p_pct_comunes * tot.n)
    union all
    select h.studio_id, 'dispositivo', false, '{}'::jsonb
      from huellas_alta h, mia
     where h.studio_id in (select vj.id from viejos vj)
       and mia.dispositivo_hmac is not null and h.dispositivo_hmac = mia.dispositivo_hmac
    union all
    select h.studio_id, 'ip', false, '{}'::jsonb
      from huellas_alta h, mia
     where h.studio_id in (select vj.id from viejos vj)
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

-- Solo el servidor (CREATE OR REPLACE conserva el ACL; se repite por escrito).
revoke execute on function public.detectar_vinculos_gratis(text, integer, numeric) from public;
revoke execute on function public.detectar_vinculos_gratis(text, integer, numeric) from anon;
revoke execute on function public.detectar_vinculos_gratis(text, integer, numeric) from authenticated;
grant execute on function public.detectar_vinculos_gratis(text, integer, numeric) to service_role;
