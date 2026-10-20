-- Plaza fija sin cuota: «Avisar y liberar», la opción de serie (decisión del fundador, 20-oct-2026).
--
-- El fundador le quitó el plan a una alumna y sus clases fijas siguieron reservadas sin que nadie le avisara: todos los
-- estudios estaban en MANTENER, la opción de serie desde 20260915215236. Ahora, cuando la cuota deja de cubrir sus clases
-- fijas ya reservadas:
--   1. se le avisa («Tu clase fija termina pronto»: si no renueva antes del día X, se cancelan) y se apunta aquí, con el
--      día desde el que se liberan (`liberar_desde`, 3 días después del aviso, en el día del estudio);
--   2. si llega ese día sin cuota, se liberan como con LIBERAR (sin penalización, la plaza no se toca);
--   3. si renueva antes, no se libera nada y el aviso se borra (otra pérdida futura avisa otra vez).
-- Mientras corre el plazo no se le cobra penalización (como MANTENER_SIN_PENALIZAR).
--
-- Lo apunta y lo borra el servidor (`avisarPlazaFijaSinCuota`, service_role); el navegador no ve la tabla. Los demás
-- valores siguen igual y cada estudio puede elegirlos en Configuración. Los 19 estudios estaban en MANTENER, que nadie
-- había cambiado: pasan a la nueva de serie.

create table if not exists public.plaza_fija_sin_cuota_avisos (
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  avisada_en timestamptz not null default now(),
  liberar_desde date not null,
  primary key (studio_id, socio_id)
);
alter table public.plaza_fija_sin_cuota_avisos enable row level security;
create policy exige_doble_factor on public.plaza_fija_sin_cuota_avisos as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
revoke all on public.plaza_fija_sin_cuota_avisos from anon, authenticated;
grant select, insert, update, delete on public.plaza_fija_sin_cuota_avisos to service_role;
comment on table public.plaza_fija_sin_cuota_avisos is
  'Alumnas avisadas de que sus clases fijas se liberan si no renuevan (política AVISAR_Y_LIBERAR). Solo el servidor.';

alter table public.studios drop constraint if exists studios_plaza_fija_sin_cuota_check;
alter table public.studios
  add constraint studios_plaza_fija_sin_cuota_check
  check (plaza_fija_sin_cuota in ('AVISAR_Y_LIBERAR', 'LIBERAR', 'MANTENER_SIN_PENALIZAR', 'MANTENER'));
alter table public.studios alter column plaza_fija_sin_cuota set default 'AVISAR_Y_LIBERAR';
update public.studios set plaza_fija_sin_cuota = 'AVISAR_Y_LIBERAR' where plaza_fija_sin_cuota = 'MANTENER';

comment on column public.studios.plaza_fija_sin_cuota is
  'Qué pasa con las reservas de plaza fija ya hechas cuando la alumna se queda sin cuota: AVISAR_Y_LIBERAR (por defecto), LIBERAR, MANTENER_SIN_PENALIZAR o MANTENER.';

-- Las que se liberan: con LIBERAR, en el acto; con AVISAR_Y_LIBERAR, solo si ya se la avisó y ha llegado su día.
-- Misma firma → conserva los grants.
create or replace function public.reservas_plaza_fija_sin_cuota(p_studio_id text default null, p_socio_id text default null)
 returns table(studio_id text, reserva_id text)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select r.studio_id, r.id
  from reservas r
  join sesiones s on s.id = r.sesion_id
  join studios st on st.id = r.studio_id
  where r.id like 'res-pf-%'
    and r.estado in ('CONFIRMADA', 'LISTA_ESPERA')
    and (p_studio_id is null or r.studio_id = p_studio_id)
    and (p_socio_id is null or r.socio_id = p_socio_id)
    and (
      st.plaza_fija_sin_cuota = 'LIBERAR'
      or (st.plaza_fija_sin_cuota = 'AVISAR_Y_LIBERAR' and exists (
        select 1 from plaza_fija_sin_cuota_avisos a
         where a.studio_id = r.studio_id and a.socio_id = r.socio_id and a.liberar_desde <= public.hoy_estudio()
      ))
    )
    and coalesce(s.cancelada, false) = false
    and s.inicio > now()
    -- `false`: una cuota ACTIVA con la renovación por cobrar sigue siendo cuota.
    and not public.cuota_cubre_plaza_fija(r.studio_id, r.socio_id, s.tipo_clase_id, (s.inicio at time zone 'Europe/Madrid')::date, false);
$function$;

-- Quién tiene ahora clases fijas reservadas que su cuota ya no cubre, con la política de su estudio: lo que el servidor
-- necesita para avisar (AVISAR_Y_LIBERAR sin aviso) y para borrar los avisos de quien ya renovó (no sale aquí).
create or replace function public.socias_plaza_fija_sin_cuota(p_studio_id text default null, p_socio_id text default null)
 returns table(studio_id text, socio_id text, politica text)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select distinct r.studio_id, r.socio_id, st.plaza_fija_sin_cuota
  from reservas r
  join sesiones s on s.id = r.sesion_id
  join studios st on st.id = r.studio_id
  where r.id like 'res-pf-%'
    and r.estado in ('CONFIRMADA', 'LISTA_ESPERA')
    and (p_studio_id is null or r.studio_id = p_studio_id)
    and (p_socio_id is null or r.socio_id = p_socio_id)
    and coalesce(s.cancelada, false) = false
    and s.inicio > now()
    and not public.cuota_cubre_plaza_fija(r.studio_id, r.socio_id, s.tipo_clase_id, (s.inicio at time zone 'Europe/Madrid')::date, false);
$function$;

revoke all on function public.socias_plaza_fija_sin_cuota(text, text) from public;
revoke all on function public.socias_plaza_fija_sin_cuota(text, text) from anon;
revoke all on function public.socias_plaza_fija_sin_cuota(text, text) from authenticated;
grant execute on function public.socias_plaza_fija_sin_cuota(text, text) to service_role;
