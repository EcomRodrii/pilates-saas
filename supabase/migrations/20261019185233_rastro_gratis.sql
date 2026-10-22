-- ═══════════════════════════════════════════════════════════════════════════
-- Vínculos del plan gratis (4): el rastro, con la hora del SERVIDOR.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La revisión de seguridad encontró que el vínculo podía usarse para cerrar el
-- estudio de OTRA persona: la dueña escribe su propio NIF y puede importar
-- alumnas, así que bastaba con poner el NIF de una víctima, o sus alumnas, en un
-- estudio propio ya cerrado. Y no hay ninguna fecha de alumnas, reservas o clases
-- que el navegador no pueda escribir.
--
-- Solución: el servidor apunta cuándo vio por primera vez cada alumna (correo o
-- móvil) y el NIF de cada estudio gratis, en sha256. Un vínculo por alumnas o NIF
-- solo cuenta con lo que YA estaba en el estudio viejo ANTES del alta del nuevo:
-- lo que se mete hoy no perjudica a nadie. Se rellena con lo que hay ahora en los
-- estudios gratis (visto hoy) y después lo va apuntando detectar_vinculos_gratis.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rastro_gratis (
  studio_id text not null references public.studios(id) on delete cascade,
  tipo text not null check (tipo in ('alumna', 'nif')),
  clave text not null,
  visto_en timestamptz not null default now(),
  primary key (studio_id, tipo, clave)
);
alter table public.rastro_gratis enable row level security;
create policy exige_doble_factor on public.rastro_gratis as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
revoke all on public.rastro_gratis from anon, authenticated;
grant all on public.rastro_gratis to service_role;
comment on table public.rastro_gratis is
  'Cuándo vio el SERVIDOR por primera vez cada alumna (correo o móvil) y el NIF de un estudio gratis, en sha256. Un vínculo por alumnas o NIF solo cuenta con lo que ya estaba en el estudio viejo antes del alta del nuevo: lo importado después no perjudica a nadie. Solo servidor (lib/billing/vinculos-gratis.ts).';
comment on table public.cuentas_stripe_vistas is
  'Cada cuenta de Stripe Connect que ha tenido un estudio (también las ya desconectadas). La apunta detectar_vinculos_gratis al medir. Solo servidor.';

insert into public.rastro_gratis (studio_id, tipo, clave)
  select distinct so.studio_id, 'alumna', encode(sha256(convert_to(k, 'UTF8')), 'hex')
    from public.socios so
    join public.studios s on s.id = so.studio_id and s.subscription_status in ('gratis', 'gratis_cerrado')
    cross join lateral (values
      ('e:' || nullif(lower(btrim(so.email)), '')),
      (case when length(regexp_replace(coalesce(so.telefono, ''), '\D', '', 'g')) >= 9
            then 't:' || right(regexp_replace(so.telefono, '\D', '', 'g'), 9) end)) as v(k)
   where so.borrado_en is null and k is not null
  on conflict do nothing;

insert into public.rastro_gratis (studio_id, tipo, clave)
  select s.id, 'nif', encode(sha256(convert_to(upper(regexp_replace(s.nif, '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex')
    from public.studios s
   where s.subscription_status in ('gratis', 'gratis_cerrado')
     and length(regexp_replace(coalesce(s.nif, ''), '[^A-Za-z0-9]', '', 'g')) >= 8
  on conflict do nothing;

insert into public.cuentas_stripe_vistas (stripe_account_id, studio_id)
  select s.stripe_account_id_anterior, s.id from public.studios s where s.stripe_account_id_anterior is not null
  on conflict do nothing;
