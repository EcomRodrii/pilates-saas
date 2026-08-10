-- 20260810150000 · Informes: desglose de ventas por tipo (Planes/Bonos/Clases
-- sueltas/Otros), pedido explícito del fundador para /informes.
--
-- Mismo patrón que informe_ingresos/ingresos_por_dia (migr 0096): agregación
-- SERVER-SIDE con count()/sum() en SQL, sin traer filas crudas al cliente
-- (evita el cap de 1000 de PostgREST). SECURITY INVOKER: corre como quien
-- llama (authenticated) → la RLS de recibos/suscripciones/planes_tarifa
-- (studio_id = current_studio_id()) acota por estudio sin necesidad de
-- REVOKE/GRANT explícito — mismo criterio exacto que 0096, que tampoco lo
-- necesita por ser SECURITY INVOKER.
--
-- `tipo` sale de planes_tarifa.tipo ('MENSUAL'/'BONO'/'PUNTUAL') a través de
-- recibos.suscripcion_id → suscripciones.plan_id. Los recibos SIN
-- suscripcion_id (pagos históricos migrados, POS/otros conceptos) caen en
-- 'OTROS' vía el LEFT JOIN + coalesce — no se descartan ni rompen el
-- agregado. p_hasta es inclusive, para poder acotar el período anterior sin
-- solaparlo con el actual (p_hasta = p_desde_actual - 1 día).

create or replace function public.ventas_por_tipo(p_desde date, p_hasta date)
returns table(tipo text, n_ventas bigint, total numeric)
language sql stable security invoker set search_path to 'public'
as $$
  select
    coalesce(pt.tipo, 'OTROS') as tipo,
    count(*)::bigint as n_ventas,
    coalesce(sum(r.importe), 0)::numeric as total
  from public.recibos r
  left join public.suscripciones s on s.id = r.suscripcion_id
  left join public.planes_tarifa pt on pt.id = s.plan_id
  where r.estado = 'COBRADO'
    and r.fecha_cobro is not null
    and (p_desde is null or r.fecha_cobro >= p_desde)
    and (p_hasta is null or r.fecha_cobro <= p_hasta)
  group by coalesce(pt.tipo, 'OTROS');
$$;
