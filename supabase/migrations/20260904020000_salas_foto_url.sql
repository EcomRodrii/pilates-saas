-- Imagen por SALA.
--
-- Por qué hace falta una columna nueva: la app de la alumna enseña una foto en
-- cada clase (héroe de la ficha, tarjeta «tu próxima clase», hoja de reserva) y
-- hasta ahora la resolvía así:
--
--   tipos_clase.foto_url  →  studios.foto_url  →  ''
--
-- Es decir: cuando el tipo de clase no tiene foto —que es lo normal, ninguno la
-- tiene— TODAS las clases del estudio acababan enseñando la MISMA imagen de
-- estudio. En un estudio real esa imagen es a menudo la foto de la propietaria,
-- así que la alumna veía su cara repetida en cada clase.
--
-- La sala es el nivel correcto: una clase ocurre en una sala, y la sala tiene
-- un aspecto reconocible (el reformer, la sala de mat). `salas` NO tenía ningún
-- campo de imagen — solo `id, studio_id, nombre, capacidad, color` — así que no
-- era cuestión de exponer un dato existente: había que crearlo.
--
-- Queda como el PRIMER eslabón de la cadena, no como el único:
--
--   salas.foto_url  →  tipos_clase.foto_url  →  studios.foto_url  →  vacío
--
-- Un estudio que ya haya puesto foto a un tipo de clase la conserva; quien no
-- tenga nada sigue como está.

alter table salas add column if not exists foto_url text;

comment on column salas.foto_url is
  'Imagen de la sala, que la app de la alumna usa como foto de las clases que ocurren en ella. Tiene PRIORIDAD sobre tipos_clase.foto_url y studios.foto_url.';
