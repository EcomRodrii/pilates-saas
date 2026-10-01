-- ─────────────────────────────────────────────────────────────────────────────
-- F0 · Cifras: lo ingresado es lo cobrado MENOS lo devuelto.
--
-- Las tres RPC de /informes sumaban `importe` de todo recibo COBRADO. Un
-- reembolso parcial deja el recibo COBRADO con `importe_devuelto` > 0
-- (`recibos_estado_check` no tiene «devuelto en parte»), así que ese dinero
-- devuelto seguía contando como ingreso en Informes. Además el ticket medio
-- dividía TODO lo cobrado —ventas de mostrador sin clienta incluidas— entre las
-- clientas que pagaron: en un estudio real salía 197,50 € cuando lo de las
-- clientas era 87,10 €.
--
-- `recibo_importe_ingresado` es la mitad SQL de `importeIngresado`
-- (lib/billing/situacion-recibo.ts); `situacion-recibo.test.ts` comprueba que
-- dicen lo mismo y que las RPC de aquí la usan.
--
-- Mismas firmas que antes en las tres RPC existentes (CREATE OR REPLACE
-- conserva sus grants). `informe_ingresos_neto` es nueva porque añade una
-- columna; `informe_ingresos` queda corregida para quien aún la llame y se
-- retirará cuando ningún despliegue la use.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.recibo_importe_ingresado(p_estado text, p_importe numeric, p_importe_devuelto numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_estado = 'COBRADO'
              then greatest(coalesce(p_importe, 0) - coalesce(p_importe_devuelto, 0), 0)
              else 0 end
$$;

comment on function public.recibo_importe_ingresado(text, numeric, numeric) is
  'Lo que de verdad entró por un recibo: COBRADO menos lo devuelto. Espejo de importeIngresado (lib/billing/situacion-recibo.ts).';

create or replace function public.informe_ingresos(p_desde date)
returns table(total_ingresos numeric, n_cobrados bigint, n_socias_unicas bigint)
language sql
stable
set search_path to 'public'
as $$
  select coalesce(sum(public.recibo_importe_ingresado(estado, importe, importe_devuelto)), 0)::numeric,
         count(*)::bigint,
         count(distinct socio_id)::bigint
  from public.recibos
  where estado = 'COBRADO' and fecha_cobro is not null
    and public.recibo_importe_ingresado(estado, importe, importe_devuelto) > 0
    and (p_desde is null or fecha_cobro >= p_desde);
$$;

create or replace function public.informe_ingresos_neto(p_desde date)
returns table(total_ingresos numeric, n_cobrados bigint, n_socias_unicas bigint, total_socias numeric)
language sql
stable
set search_path to 'public'
as $$
  select coalesce(sum(public.recibo_importe_ingresado(estado, importe, importe_devuelto)), 0)::numeric,
         count(*)::bigint,
         count(distinct socio_id)::bigint,
         coalesce(sum(public.recibo_importe_ingresado(estado, importe, importe_devuelto))
                  filter (where socio_id is not null), 0)::numeric
  from public.recibos
  where estado = 'COBRADO' and fecha_cobro is not null
    and public.recibo_importe_ingresado(estado, importe, importe_devuelto) > 0
    and (p_desde is null or fecha_cobro >= p_desde);
$$;

comment on function public.informe_ingresos_neto(date) is
  'Ingresos netos desde una fecha (RLS acota al estudio). total_socias excluye ventas de mostrador sin clienta: es el numerador del ticket medio.';

create or replace function public.ingresos_por_dia(p_desde date)
returns table(dia date, total numeric)
language sql
stable
set search_path to 'public'
as $$
  select fecha_cobro, coalesce(sum(public.recibo_importe_ingresado(estado, importe, importe_devuelto)), 0)::numeric
  from public.recibos
  where estado = 'COBRADO' and fecha_cobro is not null and (p_desde is null or fecha_cobro >= p_desde)
  group by fecha_cobro order by fecha_cobro;
$$;

create or replace function public.ventas_por_tipo(p_desde date, p_hasta date)
returns table(tipo text, n_ventas bigint, total numeric)
language sql
stable
set search_path to 'public'
as $$
  select
    coalesce(pt.tipo, 'OTROS') as tipo,
    count(*)::bigint as n_ventas,
    coalesce(sum(public.recibo_importe_ingresado(r.estado, r.importe, r.importe_devuelto)), 0)::numeric as total
  from public.recibos r
  left join public.suscripciones s on s.id = r.suscripcion_id
  left join public.planes_tarifa pt on pt.id = s.plan_id
  where r.estado = 'COBRADO'
    and r.fecha_cobro is not null
    and public.recibo_importe_ingresado(r.estado, r.importe, r.importe_devuelto) > 0
    and (p_desde is null or r.fecha_cobro >= p_desde)
    and (p_hasta is null or r.fecha_cobro <= p_hasta)
  group by coalesce(pt.tipo, 'OTROS');
$$;

-- Funciones nuevas: el default ACL del proyecto da EXECUTE a anon. Son
-- SECURITY INVOKER (la RLS de `recibos` acota al estudio y a quien ve
-- finanzas), así que anon no leería nada, pero no tiene por qué llamarlas.
revoke execute on function public.recibo_importe_ingresado(text, numeric, numeric) from public, anon;
revoke execute on function public.informe_ingresos_neto(date) from public, anon;
grant execute on function public.recibo_importe_ingresado(text, numeric, numeric) to authenticated, service_role;
grant execute on function public.informe_ingresos_neto(date) to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.informe_ingresos_neto(date)', 'EXECUTE') then
    raise exception 'informe_ingresos_neto: anon no debería poder ejecutarla';
  end if;
  if not has_function_privilege('authenticated', 'public.informe_ingresos_neto(date)', 'EXECUTE') then
    raise exception 'informe_ingresos_neto: el panel no podría llamarla';
  end if;
  -- Las RPC existentes llaman a la helper como INVOKER: quien puede ejecutarlas
  -- tiene que poder ejecutar la helper.
  if not has_function_privilege('authenticated', 'public.recibo_importe_ingresado(text, numeric, numeric)', 'EXECUTE') then
    raise exception 'recibo_importe_ingresado: las RPC de informes fallarían';
  end if;
end $$;
