-- TENTARE — dos textos de marca que hoy no existen como dato: el lema del
-- estudio y la frase del héroe de la app de la alumna.
--
-- Vienen de una maqueta de la home que pinta «CUERPO · MENTE · EQUILIBRIO»
-- bajo el nombre del estudio y «A STRONGER CALMER HAPPIER YOU» en vertical
-- dentro del héroe. Los escribe cada estudio: el portal es MARCA BLANCA y una
-- frase fija en el código diría lo mismo, en inglés, en los trece — que es la
-- misma trampa que ya documenta `identidad-visual-oliva`. Vacío = esas líneas
-- no se pintan y el héroe se queda como está hoy.
--
-- ⚠️ El GRANT no es opcional ni decorativo. Desde
-- `20260910171150_studios_cadenas_revoca_columnas_billing.sql`, `authenticated`
-- YA NO tiene UPDATE sobre la tabla `studios` entera: tiene una lista blanca
-- de columnas. Una columna nueva NO entra sola en esa lista. Verificado en
-- vivo con BEGIN/ROLLBACK antes de aplicar esto:
--
--   tras el ALTER, sin GRANT → has_column_privilege(...,'lema','UPDATE') = false
--   tras el GRANT            → true
--
-- O sea que sin estas dos líneas, Configuración habría enseñado su toast de
-- guardado y no habría escrito nada — el bug de «lista blanca de columnas:
-- alta ≠ edición», otra vez. El SELECT ya lo tenían (es de tabla).

alter table public.studios
  add column if not exists lema text,
  add column if not exists frase_heroe text;

comment on column public.studios.lema is
  'Lema corto bajo el nombre del estudio en la app de la alumna (p. ej. «CUERPO · MENTE · EQUILIBRIO»). NULL = no se pinta.';
comment on column public.studios.frase_heroe is
  'Frase del héroe de la home de la alumna, en vertical al costado. NULL = no se pinta.';

grant update (lema, frase_heroe) on public.studios to authenticated;
