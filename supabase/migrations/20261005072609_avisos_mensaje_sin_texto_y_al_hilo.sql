-- ─────────────────────────────────────────────────────────────────────────────
-- Avisos de mensajes ya emitidos: sin el texto, llevando al hilo y con la
-- alumna anotada para que su supresión los borre.
--
-- ⚠️ SOLO DATOS, y va DESPUÉS de desplegar el código que deja de emitirlos con
-- texto (`previsualizacionParaAviso`, lib/mensajeria/presentacion.ts). Aplicada
-- antes, los avisos que se emitieran entre medias seguirían llevando el texto.
-- Se puede repetir: cada paso solo toca lo que aún no está como debe. Medir el
-- recuento de `mensaje.recibido` antes y después.
--
-- Por qué: el aviso de un mensaje nuevo llevaba el principio del mensaje
-- («Lucía te ha escrito: "Me duele la rodilla…"»), y en los hilos con una alumna
-- se habla de salud (guía 4.5.4 de Apple). El aviso se queda en la campana y en
-- Avisos, así que no basta con dejar de emitirlo: hay que limpiar lo emitido.
-- El canal EQUIPO no se toca (está congelado).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Avisos de conversaciones que ya no existen (las borró una supresión). Llevan
--    el nombre y el principio del mensaje de alguien que ya no está. Desde el
--    código nuevo esto no vuelve a pasar: los avisos de un hilo con alumna llevan
--    `data.socioId`, y `anonimizar_socio` ya borra los que la nombran así.
delete from public.notification n
 where n.event_type = 'mensaje.recibido'
   and coalesce(n.data->>'conversacionId', '') <> ''
   and not exists (select 1 from public.conversaciones c where c.id = n.data->>'conversacionId');

-- 2. Hilos con alumna. El tipo real sale de la conversación, no de `data.tipo`,
--    que es NULL en los avisos antiguos (filtrar por él no filtraba nada).
--    · Quién es «la alumna» lo dice la fila SOCIO del hilo (su cuenta, o la de su
--      ficha si volvió a vincularla), NO `recipient_role`: una cuenta que es
--      socia y además del equipo recibía esos avisos como SOCIA en hilos en los
--      que estaba como equipo. Esa persona conserva su enlace y lee quién
--      escribió de verdad.
--    · A la alumna, en el hilo con el estudio, le escribe el estudio; y su aviso
--      abre el hilo. El slug, el del aviso o, si no lo guardó (los emitidos
--      antes del 14-sep), el actual del estudio.
--    · Se reescribe la frase entera —título incluido— y se quita la vista previa.
--    · `data.socioId` = la alumna del hilo: con él, `anonimizar_socio` (cláusula
--      `data->>'socioId'`) borra también los avisos del equipo que la nombran.
with hilo as (
  select c.id, c.tipo, s.nombre as estudio, s.slug as slug_actual,
         sp.socio_id, sp.auth_user_id as cuenta_fila, so.auth_user_id as cuenta_ficha
    from public.conversaciones c
    join public.studios s on s.id = c.studio_id
    left join public.conversacion_participantes sp
      on sp.conversacion_id = c.id and sp.rol_en_conversacion = 'SOCIO'
    left join public.socios so on so.id = sp.socio_id
   where c.tipo in ('ALUMNA_MOSTRADOR', 'ALUMNA_INSTRUCTORA')
), aviso as (
  select n.id,
         h.tipo, h.estudio, h.socio_id, h.id as conversacion_id,
         coalesce(n.recipient_user_id in (h.cuenta_fila, h.cuenta_ficha), false) as es_alumna,
         coalesce(nullif(n.data->>'slug', ''), h.slug_actual) as slug
    from public.notification n
    join hilo h on h.id = n.data->>'conversacionId'
   where n.event_type = 'mensaje.recibido'
)
update public.notification n
   set title = 'Nuevo mensaje',
       body = case when a.es_alumna
                then coalesce(case when a.tipo = 'ALUMNA_MOSTRADOR' then nullif(btrim(a.estudio), '') end,
                              nullif(btrim(n.data->>'remitente'), ''), 'Tu estudio') || ' te ha escrito.'
                else coalesce(nullif(btrim(n.data->>'remitente'), ''), 'Alguien') || ' te ha escrito.' end,
       data = (n.data - 'previsualizacion')
              || jsonb_build_object('tipo', a.tipo)
              || case when a.socio_id is not null then jsonb_build_object('socioId', a.socio_id) else '{}'::jsonb end,
       deep_link = case when a.es_alumna and coalesce(a.slug, '') <> ''
                     then '/portal/' || a.slug || '/mensajes/' || a.conversacion_id
                     else n.deep_link end
  from aviso a
 where a.id = n.id
   and (n.data ? 'previsualizacion'
        or (a.socio_id is not null and n.data->>'socioId' is distinct from a.socio_id)
        or (a.es_alumna and coalesce(a.slug, '') <> ''
            and n.deep_link is distinct from '/portal/' || a.slug || '/mensajes/' || a.conversacion_id));

-- 3. El resumen de no leídos de la alumna lleva a Mensajes, donde está el punto
--    de cada hilo sin leer (antes, a Avisos). Solo si de verdad es alumna en
--    algún hilo de ese estudio (la misma cuenta pudo recibirlo como SOCIA siendo
--    solo equipo en sus hilos: a esa no se la manda a una bandeja que no es la suya).
update public.notification n
   set deep_link = '/portal/' || coalesce(nullif(n.data->>'slug', ''), s.slug) || '/mensajes'
  from public.studios s
 where s.id = n.studio_id
   and n.event_type = 'mensaje.digest_no_leido'
   and n.recipient_role = 'SOCIA'
   and coalesce(nullif(n.data->>'slug', ''), s.slug, '') <> ''
   and n.deep_link is distinct from '/portal/' || coalesce(nullif(n.data->>'slug', ''), s.slug) || '/mensajes'
   and exists (select 1
                 from public.conversacion_participantes cp
                 join public.conversaciones c on c.id = cp.conversacion_id
                 left join public.socios so on so.id = cp.socio_id
                where c.studio_id = n.studio_id
                  and cp.rol_en_conversacion = 'SOCIO'
                  and (cp.auth_user_id = n.recipient_user_id or so.auth_user_id = n.recipient_user_id));
