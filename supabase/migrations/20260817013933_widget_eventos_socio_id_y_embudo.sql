-- Fase 8 "Booking Experience Engine" (CRO + Inteligencia): agregación del
-- embudo del widget + `socio_id` acotado a los eventos donde la visitante
-- ya está identificada. Diseño completo: docs/cro-analytics-widget-diseno.md.
--
-- `socio_id` NULLABLE, poblada solo en booking_started/checkout_started/
-- booking_completed/booking_abandoned — los mismos cuatro que, por
-- construcción del propio flujo (login antes de llegar a esos pasos), ya no
-- son anónimos. El resto de eventos (widget_loaded, class_list_viewed...) se
-- quedan sin tocar, 100% anónimos — no rompe el invariante de la tabla
-- original (comentario de widget_eventos: "Nunca PII"), lo matiza solo donde
-- el propio flujo ya dejó de serlo.
alter table public.widget_eventos
  add column if not exists socio_id text references public.socios(id) on delete set null;

comment on column public.widget_eventos.socio_id is
  'Fase 8 CRO: solo en eventos de visitante ya identificada (booking_started/checkout_started/booking_completed/booking_abandoned). NULL en el resto — la tabla sigue siendo anónima por defecto.';

-- Agregación del embudo. `security invoker` (no `definer`): hereda la RLS del
-- cliente que la llama (widget_eventos_lectura, PROPIETARIO/MANAGER de ESE
-- estudio) — mismo patrón que informe_ingresos/ingresos_por_dia
-- (0096_informe_ingresos_server_agg.sql). Sin vista materializada: un
-- GROUP BY sobre una tabla con índice (studio_id, tipo, creado_en desc) ya
-- puesto para exactamente esta consulta, y el volumen real de estos estudios
-- lo descarta por sí solo.
create or replace function public.embudo_widget(p_desde date)
returns table(tipo text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select tipo, count(*) as n
  from public.widget_eventos
  where studio_id = public.current_studio_id()
    and creado_en >= p_desde
  group by tipo;
$$;

-- Gemela para la serie temporal (mismo criterio que dbIngresosPorDia/
-- ingresos_por_dia).
create or replace function public.embudo_widget_por_dia(p_desde date)
returns table(dia date, tipo text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select (creado_en at time zone 'Europe/Madrid')::date as dia, tipo, count(*) as n
  from public.widget_eventos
  where studio_id = public.current_studio_id()
    and creado_en >= p_desde
  group by dia, tipo;
$$;

-- Funciones nuevas: EXECUTE por defecto a PUBLIC (gotcha de grants ya
-- documentado varias veces en este repo) — se revoca y se concede explícito.
-- `REVOKE ... FROM PUBLIC` NO basta: pg_default_acl da EXECUTE directo a
-- `anon` sin pasar por PUBLIC (verificado en vivo con
-- has_function_privilege al escribir esta migración — `anon` seguía en
-- `true` tras revocar solo PUBLIC), así que anon se revoca aparte y explícito.
revoke all on function public.embudo_widget(date) from public;
revoke all on function public.embudo_widget_por_dia(date) from public;
revoke all on function public.embudo_widget(date) from anon;
revoke all on function public.embudo_widget_por_dia(date) from anon;
grant execute on function public.embudo_widget(date) to authenticated;
grant execute on function public.embudo_widget_por_dia(date) to authenticated;
