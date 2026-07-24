-- 0091 · F1 (B1-B4) — agregación de ingresos SERVER-SIDE.
--
-- Los informes de dinero pueden mentir a escala: la app suma `recibos.importe` sobre
-- el array del CLIENTE, capado a 1000 filas por PostgREST. Un `sum()` en SQL agrega
-- TODAS las filas (el cap de 1000 es del fetch REST, no de SQL). Con estas RPCs los
-- KPI y el gráfico de ingresos se calculan en el servidor → correctos a cualquier
-- escala (hoy los estudios están < 1000 recibos, así que el bug es LATENTE; esto lo
-- cierra antes de que un estudio de volumen lo dispare).
--
-- SECURITY INVOKER: corre como quien llama (authenticated) → la RLS de `recibos`
-- (admin_recibos: studio_id = current_studio_id()) acota por estudio; el agregado no
-- se capa. p_desde null = todo el histórico. La RPC diaria devuelve una fila por día
-- con cobro (≤366/año, sin capar); el front la agrupa por día o mes con getBucketKey.

create or replace function public.informe_ingresos(p_desde date)
returns table(total_ingresos numeric, n_cobrados bigint, n_socias_unicas bigint)
language sql stable security invoker set search_path to 'public'
as $$
  select
    coalesce(sum(importe), 0)::numeric,
    count(*)::bigint,
    count(distinct socio_id)::bigint
  from public.recibos
  where estado = 'COBRADO'
    and fecha_cobro is not null
    and (p_desde is null or fecha_cobro >= p_desde);
$$;

create or replace function public.ingresos_por_dia(p_desde date)
returns table(dia date, total numeric)
language sql stable security invoker set search_path to 'public'
as $$
  select fecha_cobro, coalesce(sum(importe), 0)::numeric
  from public.recibos
  where estado = 'COBRADO' and fecha_cobro is not null
    and (p_desde is null or fecha_cobro >= p_desde)
  group by fecha_cobro order by fecha_cobro;
$$;
