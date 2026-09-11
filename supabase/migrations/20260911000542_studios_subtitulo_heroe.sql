-- TENTARE — el subtítulo del héroe de la alumna, cuarto texto de marca.
--
-- Es la línea que va BAJO EL SALUDO («Disciplina hoy, resultados mañana.» en la
-- guía del fundador). No confundir con `frase_heroe`, que es la que va en
-- VERTICAL al costado de la foto: son dos sitios distintos del mismo héroe.
--
-- ⚠️ A diferencia de `lema`, `frase_heroe` y `frase_manuscrita`, este hueco YA
-- tiene texto hoy: «¿Qué te apetece hoy?». Así que NULL aquí no significa «no
-- se pinta» sino «se pinta el del producto» — si no, activar esta columna le
-- cambiaría el héroe a los trece estudios sin que nadie lo hubiera pedido.
--
-- ⚠️ El GRANT, cuarta vez: `authenticated` no tiene UPDATE sobre `studios`
-- entera sino lista blanca de columnas (migr 20260910171150), y una columna
-- nueva no entra sola. Verificado en vivo con BEGIN/ROLLBACK antes de aplicar:
-- tras el ALTER `has_column_privilege(…,'subtitulo_heroe','UPDATE')` = false;
-- tras el GRANT, true.

alter table public.studios
  add column if not exists subtitulo_heroe text;

comment on column public.studios.subtitulo_heroe is
  'Línea bajo el saludo en la home de la alumna. NULL = se pinta la del producto («¿Qué te apetece hoy?»), no un hueco.';

grant update (subtitulo_heroe) on public.studios to authenticated;
