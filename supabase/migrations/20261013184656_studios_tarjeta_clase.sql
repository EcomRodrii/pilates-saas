-- P3.11 — qué se ve de cada alumna en la lista de una clase (diseño 22).
--
-- NULL = lo de siempre: el punto de color de salud y nada más. Aditiva y sin
-- valor por defecto, así que ningún estudio nota nada hasta que la propietaria
-- lo cambie (y solo puede con `TARJETA_CLASE` encendido para su estudio).
--
-- La ACTUALIZA solo el servidor (PUT /api/estudio/tarjeta-clase, solo la
-- propietaria, con service-role): a propósito NO hay GRANT UPDATE de la columna
-- a authenticated, cuyos UPDATE en studios van por columnas. El alta de un
-- estudio (INSERT de tabla) podría traerla rellena, pero solo en el suyo, y se
-- lee con tolerancia: no amplía lo que ve nadie. El panel la lee con el SELECT
-- de tabla que ya tiene authenticated. anon no la ve: sus grants en studios son
-- por columnas y esta no está entre ellas.
--
-- El CHECK solo fija la forma (un objeto pequeño). Qué claves valen lo decide
-- lib/calendario/tarjeta-clienta.ts, que al leer devuelve lo de serie ante
-- cualquier cosa que no entienda.

alter table public.studios add column if not exists tarjeta_clase jsonb;

alter table public.studios drop constraint if exists studios_tarjeta_clase_objeto;

alter table public.studios add constraint studios_tarjeta_clase_objeto
  check (tarjeta_clase is null or (jsonb_typeof(tarjeta_clase) = 'object' and pg_column_size(tarjeta_clase) <= 1024));

comment on column public.studios.tarjeta_clase is
  'P3.11: qué se ve de cada alumna en la lista de una clase. NULL = lo de serie. Solo la actualiza el servidor.';
