-- «Tentare Widgets», PR 2: el embudo del widget público, POR WIDGET.
--
-- Desde #2320 cada widget copiado lleva su etiqueta de seguimiento (`ref`, p.
-- ej. `web-horario`, `web-planes`), y la página la pone en TODOS sus eventos
-- (`widget_eventos.origen`). Esto solo la agrupa: mismo recuento que
-- `embudo_widget` (migr 20260817013933), partido por `origen`.
--
-- SECURITY INVOKER, igual que `embudo_widget`: la cerradura es la RLS de
-- `widget_eventos` (`widget_eventos_lectura`: su estudio, y solo PROPIETARIO/
-- MANAGER). La función no ve nada que esa persona no pudiera leer ya.
--
-- `origen` es texto libre (lo escribe el snippet): se devuelve tal cual, NULL
-- incluido (los códigos pegados antes de #2320 no llevan etiqueta). Quien lo
-- pinta decide cómo nombrarlo (lib/widgets/embudo.ts).
create or replace function public.embudo_widget_por_origen(p_desde date)
returns table(origen text, tipo text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select e.origen, e.tipo, count(*) as n
  from public.widget_eventos as e
  where e.studio_id = public.current_studio_id()
    and e.creado_en >= p_desde
  group by e.origen, e.tipo;
$$;

-- Nada para anon (ni heredado de PUBLIC ni directo por los privilegios por
-- defecto del esquema); solo para quien entra al panel.
revoke all on function public.embudo_widget_por_origen(date) from public;
revoke all on function public.embudo_widget_por_origen(date) from anon;
grant execute on function public.embudo_widget_por_origen(date) to authenticated;
