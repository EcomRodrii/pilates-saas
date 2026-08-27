-- Community & Messaging OS — P0, pieza 4/4: backfill del chat de equipo.
--
-- `mensajes_equipo`/`canales_equipo` NO se borran ni pierden su RLS —
-- quedan CONGELADAS tal cual (decisión explícita del diseño). Esta migración
-- solo COPIA su contenido al núcleo nuevo para que el chat de equipo entre en
-- el mismo modelo de conversaciones/mensajes que alumna↔instructora y
-- alumna↔mostrador, sin depender de que se apague nada del sistema viejo.
--
-- Un canal de `canales_equipo` = una conversación tipo EQUIPO (`titulo` =
-- `canales_equipo.nombre`); igual que hoy, EQUIPO es studio-wide y no lleva
-- fila de `conversacion_participantes` — cualquier persona de plantilla del
-- estudio la ve por la política `conversaciones_lectura` (tipo = 'EQUIPO').
--
-- ⚠️ Con esto, `abrir_conversacion('EQUIPO', ...)` (migración 3/4) deja de
-- ser "la única fuente de EQUIPO": tras este backfill puede haber varias
-- conversaciones EQUIPO por estudio (una por canal histórico), pero esa RPC
-- solo sabe abrir/reutilizar UNA sin nombre. Crear canales nuevos con nombre
-- propio desde el producto nuevo es trabajo de una pieza posterior, no de
-- este P0 — aquí el objetivo es que el histórico no se pierda al migrar.
--
-- Resolución del autor histórico: mismo criterio que la política
-- `staff_escribe_mensajes_equipo` (20260811015255) — `autor_instructor_id`
-- resuelve su `auth_user_id` vía `instructores`; si es NULL, el mensaje lo
-- escribió la propietaria fundadora y se resuelve vía
-- `studios.owner_auth_user_id`. Un mensaje cuyo autor no tiene NINGUNA cuenta
-- vinculada (ficha de instructor nunca reclamada, o estudio sin
-- `owner_auth_user_id`) no se puede copiar sin violar el NOT NULL de
-- `mensajes.remitente_auth_user_id` — se deja fuera del backfill (se queda
-- consultable en el histórico congelado, `mensajes_equipo`, tal cual).

insert into public.conversaciones (id, studio_id, tipo, titulo, creado_en, ultimo_mensaje_en)
select 'conv-eq-' || ce.id, ce.studio_id, 'EQUIPO', ce.nombre, ce.creado_en, ce.creado_en
  from public.canales_equipo ce
on conflict (id) do nothing;

insert into public.mensajes (id, conversacion_id, studio_id, remitente_auth_user_id, cuerpo, creado_en)
select
  'msg-eq-' || me.id,
  'conv-eq-' || me.canal_id,
  me.studio_id,
  coalesce(
    (select i.auth_user_id from public.instructores i where i.id = me.autor_instructor_id),
    (select s.owner_auth_user_id from public.studios s where s.id = me.studio_id)
  ),
  left(me.texto, 4000),
  coalesce(me.creado_en, now())
from public.mensajes_equipo me
where me.canal_id is not null
  and coalesce(
    (select i.auth_user_id from public.instructores i where i.id = me.autor_instructor_id),
    (select s.owner_auth_user_id from public.studios s where s.id = me.studio_id)
  ) is not null
  and char_length(coalesce(me.texto, '')) > 0
order by me.creado_en asc
on conflict (id) do nothing;
