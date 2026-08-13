-- «Normas del centro» para la pantalla de información del portal (tema Tentada).
--
-- ⚠️ Solo NORMAS. El «Horario del centro» de la misma pantalla NO necesita
-- columna: ya existe `studio_horario` (migr 20260804213940), con apertura y
-- cierre por día de la semana y su propia RLS. Añadir aquí un texto de horario
-- habría creado una segunda fuente del mismo dato, que es como se acaba con el
-- panel diciendo una cosa y el portal otra.
--
-- Texto libre y no una tabla de filas: las normas de un estudio son una lista
-- de frases ("Llega 5 minutos antes", "Calcetines antideslizantes"), no pares
-- clave/valor. Una línea por norma; el portal las pinta como lista.
--
-- NULL = el estudio no las ha escrito, y entonces la pantalla no enseña la
-- sección en vez de un bloque vacío.
alter table public.studios
  add column if not exists normas_texto text;

comment on column public.studios.normas_texto is
  'Normas del centro que ve la socia en el portal. Una línea por norma. NULL = sin escribir, la sección no se pinta.';
