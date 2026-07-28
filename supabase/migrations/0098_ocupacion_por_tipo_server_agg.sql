-- 0093 · F1 (B4/C2) — ocupación por tipo de clase SERVER-SIDE. El cálculo de /informes
-- iteraba el array `reservas`+`sesiones` del cliente, capado a 1000 → mal a escala.
-- RPC que agrega en SQL (no se capa); RLS acota por estudio (SECURITY INVOKER).
-- ocupadas = reservas CONFIRMADA/ASISTIDA; aforo = suma de aforo_maximo de sesiones
-- no canceladas desde p_desde.
create or replace function public.ocupacion_por_tipo(p_desde date)
returns table(tipo_clase_id text, n_sesiones bigint, aforo bigint, ocupadas bigint)
language sql stable security invoker set search_path to 'public'
as $$
  select
    ss.tipo_clase_id,
    count(*)::bigint,
    coalesce(sum(ss.aforo_maximo), 0)::bigint,
    coalesce(sum((
      select count(*) from public.reservas r
      where r.sesion_id = ss.id and r.estado in ('CONFIRMADA','ASISTIDA')
    )), 0)::bigint
  from public.sesiones ss
  where not ss.cancelada and (p_desde is null or ss.inicio >= p_desde)
  group by ss.tipo_clase_id;
$$;
