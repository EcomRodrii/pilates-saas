-- ═══════════════════════════════════════════════════════════════════════════
-- Founding Studio gratis: un estudio no se queda gratis para siempre cambiando
-- de cuenta (19-oct-2026, decisión del fundador). Reglas en
-- lib/billing/vinculos-gratis.ts.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El uso del plan gratis ya se suma por dueña (uso-gratis-servidor.ts); con una
-- cuenta nueva empezaba de cero. Ahora se suman también los estudios de OTRAS
-- cuentas que son, de hecho, el mismo negocio:
--
--   · 'stripe'  — la misma cuenta de Stripe Connect (donde cobra a sus alumnas).
--   · 'nif'     — el mismo NIF.
--   · 'alumnas' — la mayoría de sus alumnas son las de un estudio que ya pasó un
--                 límite o está cerrado (nadie salta de cuenta sin llevárselas).
--
-- Esos tres CUENTAN (`cuenta = true`): el estudio hereda el exceso y su margen.
-- 'dispositivo' e 'ip' (la huella del alta, tras el interruptor HUELLA_ALTA)
-- solo AVISAN (`cuenta = false`): una IP compartida no es el mismo negocio.
-- Un vínculo se deshace desde /interno (`descartado_en`), nunca solo.
--
-- Todo es solo del servidor: ni la dueña ni el navegador leen ni escriben aquí.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.vinculos_cuentas_gratis (
  id uuid primary key default gen_random_uuid(),
  -- El estudio en el que se detectó (el que se estaba midiendo).
  studio_id text not null references public.studios(id) on delete cascade,
  -- El otro estudio, de otra cuenta.
  vinculado_id text not null references public.studios(id) on delete cascade,
  motivo text not null check (motivo in ('stripe', 'nif', 'alumnas', 'dispositivo', 'ip')),
  -- true: se suma su uso como si fuera la misma dueña. false: solo aviso.
  cuenta boolean not null,
  -- Solo cifras (alumnas en común, total), nunca datos de una persona.
  detalle jsonb not null default '{}'::jsonb,
  detectado_en timestamptz not null default now(),
  descartado_en timestamptz,
  descartado_por text,
  constraint vinculos_cuentas_gratis_distintos check (studio_id <> vinculado_id),
  constraint vinculos_cuentas_gratis_unico unique (studio_id, vinculado_id, motivo)
);

create index if not exists vinculos_cuentas_gratis_vinculado on public.vinculos_cuentas_gratis (vinculado_id);

comment on table public.vinculos_cuentas_gratis is
  'Estudios de cuentas distintas que son el mismo negocio (plan gratis). cuenta=true suma su uso; descartado_en lo deshace desde /interno. Solo servidor (lib/billing/vinculos-gratis.ts).';

-- La huella del alta: con qué IP y qué navegador entró por primera vez la dueña.
-- Guardadas con HMAC (nunca la IP en claro). Solo se rellena con HUELLA_ALTA.
create table if not exists public.huellas_alta (
  studio_id text primary key references public.studios(id) on delete cascade,
  ip_hmac text,
  dispositivo_hmac text,
  visto_en timestamptz not null default now()
);

comment on table public.huellas_alta is
  'Primera IP y primer navegador (HMAC) con que la dueña abrió el panel. Solo avisa de cuentas parecidas, nunca cierra nada. Solo servidor.';

alter table public.vinculos_cuentas_gratis enable row level security;
alter table public.huellas_alta enable row level security;

-- Verificación en dos pasos del equipo (tentare-os): restrictiva en cada tabla nueva.
create policy exige_doble_factor on public.vinculos_cuentas_gratis as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
create policy exige_doble_factor on public.huellas_alta as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- Sin lectura ni escritura desde el navegador: ninguna política permisiva.
revoke all on public.vinculos_cuentas_gratis from anon, authenticated;
revoke all on public.huellas_alta from anon, authenticated;
grant all on public.vinculos_cuentas_gratis to service_role;
grant all on public.huellas_alta to service_role;

-- ─── Detectar ────────────────────────────────────────────────────────────────
-- Lo llama el servidor cada vez que mide el uso de un estudio gratis (como mucho
-- cada 12 h). Compara en la base de datos (las alumnas no salen de aquí) y
-- devuelve los vínculos NUEVOS. Los umbrales los pasa el servidor
-- (vinculos-gratis.ts), que es donde viven las reglas.
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
    select s.id, s.stripe_account_id, s.nif, s.subscription_status, u.excedido_desde
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
    select o.id as otro, 'stripe'::text as mot, true as cta, '{}'::jsonb as det
      from otros o where v_stripe is not null and o.stripe_account_id = v_stripe
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

comment on function public.detectar_vinculos_gratis(text, integer, numeric) is
  'Busca estudios de otras cuentas que son el mismo negocio (Stripe, NIF, alumnas, huella) y los apunta en vinculos_cuentas_gratis. Solo service_role (lib/billing/vinculos-gratis.ts).';

-- Solo el servidor: tres pasos explícitos (tentare-os: pg_default_acl da EXECUTE directo).
revoke execute on function public.detectar_vinculos_gratis(text, integer, numeric) from public;
revoke execute on function public.detectar_vinculos_gratis(text, integer, numeric) from anon;
revoke execute on function public.detectar_vinculos_gratis(text, integer, numeric) from authenticated;
grant execute on function public.detectar_vinculos_gratis(text, integer, numeric) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.detectar_vinculos_gratis(text, integer, numeric)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.detectar_vinculos_gratis(text, integer, numeric)', 'EXECUTE') then
    raise exception 'detectar_vinculos_gratis no puede ser ejecutable desde el navegador';
  end if;
  if has_table_privilege('authenticated', 'public.vinculos_cuentas_gratis', 'SELECT')
     or has_table_privilege('authenticated', 'public.huellas_alta', 'SELECT')
     or has_table_privilege('anon', 'public.vinculos_cuentas_gratis', 'SELECT')
     or has_table_privilege('anon', 'public.huellas_alta', 'SELECT') then
    raise exception 'vinculos_cuentas_gratis / huellas_alta no pueden leerse desde el navegador';
  end if;
end $$;

