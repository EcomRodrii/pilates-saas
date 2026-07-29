-- Lo que el estudio cuenta de sí mismo en su página pública de reservas.
--
-- El diseño de /reservar abre la pestaña «El estudio» con un párrafo de
-- presentación y una volanta tipo «MARBELLA · DESDE 2016». Ninguna de las dos
-- cosas existía, y las dos son de la dueña: no se pueden deducir de los datos
-- de operación.
--
-- Lo que SÍ se deduce y por eso NO lleva columna:
--   · El horario se calcula de las clases reales (primera y última de cada día
--     de la semana). Un horario escrito a mano se desactualiza en cuanto se
--     mueve una clase, y ahí la página pública pasa a mentirle a una clienta
--     que está decidiendo si viene.
--   · El bono «más elegido» sale del que más se contrata de verdad, no de una
--     casilla. Si el más vendido no es el que la dueña destacaría, el dato es
--     justo el que le interesa ver.
--
-- Las dos columnas admiten null a propósito: sin rellenar, esos bloques
-- sencillamente no se pintan. Nada de textos de relleno en la página por la
-- que entra una clienta nueva.

alter table public.studios
  add column if not exists descripcion text,
  add column if not exists anio_fundacion smallint;

-- Un año de fundación fuera de rango es un dedazo, no un dato. El tope alto se
-- deja abierto por arriba con un margen razonable en vez de clavar el año en
-- curso, que envejecería mal en una restricción.
alter table public.studios
  drop constraint if exists studios_anio_fundacion_razonable;
alter table public.studios
  add constraint studios_anio_fundacion_razonable
  check (anio_fundacion is null or (anio_fundacion between 1900 and 2200));

comment on column public.studios.descripcion is
  'Presentación del estudio en su página pública de reservas. Null = no se pinta el bloque.';
comment on column public.studios.anio_fundacion is
  'Año en que abrió el estudio (lo teclea la dueña). NO es studios.creado_en, que es el alta en Tentare.';
