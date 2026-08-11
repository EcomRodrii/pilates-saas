-- Página pública oculta mientras el estudio la prepara.
--
-- Dos columnas en `studios` y NO en el tema (que es donde viven el título y la
-- imagen para compartir, de la tanda anterior): cambiar la visibilidad de tu
-- página no puede exigirte publicar los cambios de tema que tengas a medias.
-- Es un interruptor, no una decisión de diseño — tiene efecto al momento.
--
-- `pagina_publica_clave_hash` guarda un `scrypt$<sal>$<hash>`, nunca la clave
-- en claro (ver lib/publico/acceso-pagina.ts). La RLS de `studios` da todas
-- sus columnas a todo el personal del estudio, así que aunque ellas la sepan
-- igualmente, una clave en claro en una tabla es un patrón que acaba
-- copiándose donde sí importa.
--
-- Puramente aditiva: `false` por defecto = ninguna página existente cambia de
-- comportamiento. Sin RLS nueva — se leen desde el servidor con el cliente de
-- servicio (getStudioSeo) y se escriben por el camino de siempre, la política
-- de UPDATE de `studios` que ya restringe a propietaria/gerencia.

alter table public.studios
  add column if not exists pagina_publica_oculta boolean not null default false,
  add column if not exists pagina_publica_clave_hash text;

comment on column public.studios.pagina_publica_oculta is
  'Si true, /reservar/{slug} no se muestra al público y se sirve con noindex. Oculta la PÁGINA, no los datos: la API pública sigue respondiendo.';
comment on column public.studios.pagina_publica_clave_hash is
  'scrypt$<sal>$<hash> de la clave que abre la página oculta. NULL = oculta sin forma de entrar.';
