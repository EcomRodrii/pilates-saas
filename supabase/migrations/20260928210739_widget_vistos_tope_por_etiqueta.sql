-- Fase C del constructor de widgets, endurecimiento de «Visto en».
--
-- 1) `widget_vistos()` recortaba a 200 grupos EN TOTAL: lo de unos widgets
--    podía dejar fuera lo de otro, y el panel diría «Aún no lo vemos en tu
--    web» sin ser cierto. Ahora el tope es por etiqueta y forma (20 por cada
--    una, las más recientes). Misma firma que antes, así que sus permisos se
--    conservan; se repiten igualmente en los tres pasos explícitos.
--
-- 2) Una carga que dice dónde está pegado nunca lleva socia: ataría a una
--    persona con una web. La ruta ya no la escribe (registrarEventoWidget);
--    el CHECK lo deja fijado en la tabla. Todas las filas actuales tienen
--    `forma` a NULL, así que ninguna lo incumple.

create or replace function public.widget_vistos()
returns table(origen text, forma text, anfitrion text, firma text,
              primero timestamptz, ultimo timestamptz, n bigint)
language sql stable security invoker set search_path = public
as $$
  select g.origen, g.forma, g.anfitrion, g.firma, g.primero, g.ultimo, g.n
  from (
    select e.origen, e.forma, e.anfitrion, e.firma,
           min(e.creado_en) as primero, max(e.creado_en) as ultimo, count(*) as n,
           row_number() over (
             partition by e.origen, e.forma order by max(e.creado_en) desc
           ) as puesto
    from public.widget_eventos as e
    where e.studio_id = public.current_studio_id()
      and e.tipo = 'widget_loaded'
      and e.forma is not null
      and e.origen is not null
    group by e.origen, e.forma, e.anfitrion, e.firma
  ) as g
  where g.puesto <= 20
  order by g.ultimo desc;
$$;

revoke all on function public.widget_vistos() from public;
revoke all on function public.widget_vistos() from anon;
grant execute on function public.widget_vistos() to authenticated;
grant execute on function public.widget_vistos() to service_role;

alter table public.widget_eventos
  add constraint widget_eventos_pegado_sin_socia check (forma is null or socio_id is null);
