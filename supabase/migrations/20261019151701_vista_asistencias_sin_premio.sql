-- ═══════════════════════════════════════════════════════════════════════════
-- Asistencias que debieron dar créditos y no los dieron (comprobación de salud).
--
-- Los créditos por asistir se conceden en `checkinPublico` y la gamificación es
-- best-effort a propósito: si falla, la asistencia ya está guardada y no se
-- tumba. El precio es que un fallo se queda en un log y nadie vuelve a mirarlo.
-- Esta vista lista esos casos para que `lib/salud/comprobaciones.ts` los cuente.
-- NO concede nada ni repara nada: solo permite enterarse.
--
-- Qué entra (todo a la vez):
--   · reserva ASISTIDA de Tentare (las de plataformas externas no puntúan, por
--     diseño: `lib/plataformas/reserva-externa.test.ts`);
--   · con check-in en los últimos 30 días y de hace más de 1 hora (el premio se
--     concede en la propia petición del check-in; la hora de margen es para no
--     contar lo que está en vuelo);
--   · con una regla de asistencia activa, con créditos, que ya existía cuando
--     se hizo el check-in (una regla creada o activada después no es una
--     pérdida);
--   · sin fila en `reward_actions` para esa reserva. Su UNIQUE
--     (studio_id, trigger, ref_id) es lo que hace barata la antijoin.
--
-- Lo que la vista NO sabe es el gate de plan (feature `gamificacion` y
-- suscripción activa): vive en TypeScript (`tieneFeature`) y duplicarlo aquí
-- divergiría. La comprobación lo aplica después sobre los estudios que salgan.
--
-- Solo la lee el servidor. Verificar después con has_table_privilege para anon,
-- authenticated y service_role.
-- ═══════════════════════════════════════════════════════════════════════════

set lock_timeout = '5s';

create or replace view public.gamificacion_asistencias_sin_premio
with (security_invoker = on) as
select r.studio_id, r.id as reserva_id, r.check_in_en
  from public.reservas r
 where r.estado = 'ASISTIDA'
   and r.origen = 'TENTARE'
   and r.check_in_en is not null
   and r.check_in_en >= now() - interval '30 days'
   and r.check_in_en <  now() - interval '1 hour'
   and exists (
     select 1 from public.reward_rules rr
      where rr.studio_id = r.studio_id
        and rr.trigger = 'ASISTENCIA_CLASE'
        and rr.activa
        and rr.creditos > 0
        and rr.creado_en <= r.check_in_en
   )
   and not exists (
     select 1 from public.reward_actions a
      where a.studio_id = r.studio_id
        and a.trigger = 'ASISTENCIA_CLASE'
        and a.ref_id = r.id
   );

comment on view public.gamificacion_asistencias_sin_premio is
  'Asistencias de los últimos 30 días que debieron dar créditos y no los dieron. Debe estar vacía; no repara nada.';

-- `pg_default_acl` da acceso directo a anon/authenticated: revocar solo PUBLIC no basta.
revoke all on public.gamificacion_asistencias_sin_premio from public, anon, authenticated;
grant select on public.gamificacion_asistencias_sin_premio to service_role;
