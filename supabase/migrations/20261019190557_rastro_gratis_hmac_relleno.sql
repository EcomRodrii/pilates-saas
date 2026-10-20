-- Vínculos del plan gratis (6b): el rastro de hoy, rehecho en HMAC con su misma
-- hora. Las filas en sha256 (es_hmac = false) no se borran aquí: las retira el
-- servidor en la siguiente medición (vinculos-gratis-servidor.ts).

alter table public.rastro_gratis add column if not exists es_hmac boolean not null default false;

insert into public.rastro_gratis (studio_id, tipo, clave, socio_id, es_hmac, visto_en)
  select distinct on (so.studio_id, k) so.studio_id, 'alumna',
         encode(extensions.hmac(convert_to(k, 'UTF8'), (select c.clave from public.rastro_gratis_clave c), 'sha256'), 'hex'),
         so.id, true,
         coalesce((select r.visto_en from public.rastro_gratis r
                    where r.studio_id = so.studio_id and r.tipo = 'alumna'
                      and r.clave = encode(sha256(convert_to(k, 'UTF8')), 'hex')), now())
    from public.socios so
    join public.studios s on s.id = so.studio_id and s.subscription_status in ('gratis', 'gratis_cerrado')
    cross join lateral (values
      ('e:' || nullif(lower(btrim(so.email)), '')),
      (case when length(regexp_replace(coalesce(so.telefono, ''), '\D', '', 'g')) >= 9
            then 't:' || right(regexp_replace(so.telefono, '\D', '', 'g'), 9) end)) as v(k)
   where so.borrado_en is null and k is not null
  on conflict do nothing;

insert into public.rastro_gratis (studio_id, tipo, clave, es_hmac, visto_en)
  select s.id, 'nif',
         encode(extensions.hmac(convert_to(n, 'UTF8'), (select c.clave from public.rastro_gratis_clave c), 'sha256'), 'hex'),
         true,
         coalesce((select r.visto_en from public.rastro_gratis r
                    where r.studio_id = s.id and r.tipo = 'nif' and r.clave = encode(sha256(convert_to(n, 'UTF8')), 'hex')), now())
    from public.studios s
    cross join lateral (select upper(regexp_replace(coalesce(s.nif, ''), '[^A-Za-z0-9]', '', 'g')) as n) x
   where s.subscription_status in ('gratis', 'gratis_cerrado') and length(n) >= 8
  on conflict do nothing;

comment on table public.rastro_gratis is
  'Cuándo vio el SERVIDOR por primera vez cada alumna (correo o móvil) y el NIF de un estudio gratis, en HMAC (clave en rastro_gratis_clave). Se borra al suprimir la ficha de la alumna, al dejar el estudio de ser gratis y a los 18 meses; las filas sin HMAC (es_hmac = false) las retira detectar_vinculos_gratis. Solo servidor (lib/billing/vinculos-gratis.ts).';
