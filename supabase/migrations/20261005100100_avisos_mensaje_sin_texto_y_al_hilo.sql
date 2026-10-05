-- ─────────────────────────────────────────────────────────────────────────────
-- Avisos de mensajes ya emitidos: sin el texto y llevando al hilo.
--
-- ⚠️ SOLO DATOS, y va DESPUÉS de desplegar el código que deja de emitirlos con
-- texto (`previsualizacionParaAviso`, lib/mensajeria/presentacion.ts). Aplicada
-- antes, los avisos que se emitieran entre medias seguirían llevando el texto.
-- Se puede repetir: cada paso solo toca lo que aún no está como debe. Medir el
-- recuento de `mensaje.recibido` antes y después (y que quedan 0 con
-- 'previsualizacion' en hilos con alumna).
--
-- Por qué: el aviso de un mensaje nuevo llevaba el principio del mensaje
-- («Lucía te ha escrito: "Me duele la rodilla…"»), y en los hilos con una alumna
-- se habla de salud (guía 4.5.4 de Apple). El aviso se queda en la campana y en
-- Avisos, así que no basta con dejar de emitirlo: hay que limpiar lo emitido.
-- El canal EQUIPO no se toca (está congelado).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Avisos de conversaciones que ya no existen (las borró una supresión). Llevan
--    el nombre y el principio del mensaje de alguien que ya no está.
delete from public.notification n
 where n.event_type = 'mensaje.recibido'
   and coalesce(n.data->>'conversacionId', '') <> ''
   and not exists (select 1 from public.conversaciones c where c.id = n.data->>'conversacionId');

-- 2. Hilos con alumna. El tipo real sale de la conversación, no de `data.tipo`,
--    que es NULL en los avisos antiguos (filtrar por él no filtraba nada). Se
--    reescribe la frase entera —título incluido— y se quita la vista previa.
--    A la alumna, en el hilo con el estudio, le escribe el estudio; y su aviso
--    abre el hilo.
update public.notification n
   set title = 'Nuevo mensaje',
       body = case when n.recipient_role = 'SOCIA'
                then coalesce(case when c.tipo = 'ALUMNA_MOSTRADOR' then nullif(btrim(s.nombre), '') end,
                              nullif(btrim(n.data->>'remitente'), ''), 'Tu estudio') || ' te ha escrito.'
                else coalesce(nullif(btrim(n.data->>'remitente'), ''), 'Alguien') || ' te ha escrito.' end,
       data = (n.data - 'previsualizacion') || jsonb_build_object('tipo', c.tipo),
       deep_link = case when n.recipient_role = 'SOCIA' and coalesce(n.data->>'slug', '') <> ''
                     then '/portal/' || (n.data->>'slug') || '/mensajes/' || c.id
                     else n.deep_link end
  from public.conversaciones c
  join public.studios s on s.id = c.studio_id
 where n.event_type = 'mensaje.recibido'
   and c.id = n.data->>'conversacionId'
   and c.tipo in ('ALUMNA_MOSTRADOR', 'ALUMNA_INSTRUCTORA')
   and (n.data ? 'previsualizacion'
        or (n.recipient_role = 'SOCIA' and coalesce(n.data->>'slug', '') <> ''
            and n.deep_link is distinct from '/portal/' || (n.data->>'slug') || '/mensajes/' || c.id));

-- 3. El resumen de no leídos de la alumna lleva a Mensajes, donde está el punto
--    de cada hilo sin leer (antes, a Avisos).
update public.notification n
   set deep_link = '/portal/' || (n.data->>'slug') || '/mensajes'
 where n.event_type = 'mensaje.digest_no_leido'
   and n.recipient_role = 'SOCIA'
   and coalesce(n.data->>'slug', '') <> ''
   and n.deep_link is distinct from '/portal/' || (n.data->>'slug') || '/mensajes';
