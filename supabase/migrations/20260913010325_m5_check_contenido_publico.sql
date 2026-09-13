-- M-5 (auditoría 58ª pasada): "Descubre" (contenido_portal_banners/
-- novedades_estudio) y los campos nuevos del estudio (lema, frase
-- manuscrita, frase del héroe, subtítulo) se guardaban con cada pulsación
-- sin ninguna validación de FORMA ni de LONGITUD en servidor -- solo un
-- aviso client-side que nunca bloqueaba el guardado (contenido-portal-
-- editor.tsx). La RLS ya limita QUIÉN escribe (PROPIETARIO/MANAGER); esto
-- limita QUÉ se puede escribir, que es la otra mitad de "la RLS/el CHECK es
-- la cerradura real, la UI nunca es el límite".
--
-- Comprobado contra producción antes de escribir esto (dwqvdycjcffqwfkzapvi):
-- 0 filas de contenido_portal_banners violarían el check de forma de
-- link_valor, y todos los campos de texto de las tres tablas están vacíos o
-- muy por debajo de los topes de aquí (uso real todavía mínimo) -- no hace
-- falta backfill.

alter table public.contenido_portal_banners
  add constraint contenido_portal_banners_link_valor_forma check (
    (link_tipo = 'interno' and link_valor like '/%')
    or (link_tipo = 'externo' and (link_valor like 'http://%' or link_valor like 'https://%'))
  ),
  add constraint contenido_portal_banners_longitudes check (
    length(link_valor) <= 2000
    and (titulo is null or length(titulo) <= 200)
    and (texto is null or length(texto) <= 2000)
  );

alter table public.contenido_portal
  add constraint contenido_portal_mensaje_destacado_longitud check (
    mensaje_destacado is null or length(mensaje_destacado) <= 280
  );

alter table public.novedades_estudio
  add constraint novedades_estudio_longitudes check (
    length(titulo) <= 200
    and (texto is null or length(texto) <= 2000)
    and (emoji is null or length(emoji) <= 16)
  );

alter table public.studios
  add constraint studios_lema_longitud check (lema is null or length(lema) <= 200),
  add constraint studios_frase_manuscrita_longitud check (frase_manuscrita is null or length(frase_manuscrita) <= 200),
  add constraint studios_frase_heroe_longitud check (frase_heroe is null or length(frase_heroe) <= 300),
  add constraint studios_subtitulo_heroe_longitud check (subtitulo_heroe is null or length(subtitulo_heroe) <= 300);
