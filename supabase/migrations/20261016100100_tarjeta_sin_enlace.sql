-- «Contenido de tu app» v2, decisión 13 (fundador, 15-oct-2026): una tarjeta de
-- «Descubre» puede NO llevar a ningún sitio, y es lo de serie al crearla. Antes
-- nacía con «Página interna /bonos», un destino que nadie había elegido.
--
-- Hasta ahora la base no lo permitía: `link_valor` es NOT NULL y el CHECK de forma
-- exige `/…` (interno) o `http(s)://…` (externo). Se añade un tercer tipo,
-- `ninguno`, con `link_valor` vacío y nada más: lo que ya era válido lo sigue
-- siendo, y ninguna fila de hoy cambia (todas son `interno` o `externo`).
--
-- La app de la alumna ya pinta una tarjeta sin enlace sin flecha y sin `<a>`
-- (`tarjetasDescubre`: `link_valor` vacío → `enlace: null`), así que no hay que
-- tocar nada allí.
--
-- Aditiva: se puede aplicar antes que el código. Sin funciones, políticas ni
-- permisos nuevos.

alter table public.contenido_portal_banners
  drop constraint contenido_portal_banners_link_tipo_check,
  add constraint contenido_portal_banners_link_tipo_check
    check (link_tipo in ('interno', 'externo', 'ninguno')),
  drop constraint contenido_portal_banners_link_valor_forma,
  add constraint contenido_portal_banners_link_valor_forma check (
    (link_tipo = 'interno' and link_valor like '/%')
    or (link_tipo = 'externo' and (link_valor like 'http://%' or link_valor like 'https://%'))
    or (link_tipo = 'ninguno' and link_valor = '')
  );
