-- El widget anónimo también escucha el aforo.
--
-- `/reservar/{slug}` y `public/widget.js` son la pantalla que un estudio
-- incrusta en SU PROPIA web: quien la mira no tiene cuenta ni sesión de
-- Supabase, así que la policy de `aforo_broadcast_lectura` —`to authenticated`—
-- los dejaba fuera. Se quedaban con una recarga cada 60 s.
--
-- POLICY APARTE, no una condición más dentro de la otra. Es deliberado: esto
-- es la única puerta abierta a `anon` de todo el canal, y así se ve de un
-- vistazo y se cierra con UNA línea (`drop policy`) si algún día molesta.
--
-- ⚠️ QUÉ SE ESTÁ ACEPTANDO, dicho claro. Un anónimo puede suscribirse al canal
-- de CUALQUIER estudio cuyo id conozca —y el id viaja en el payload público, o
-- sea que es averiguable— y ver CUÁNDO cambia algo. No ve quién, ni qué, ni
-- cuántos: el mensaje es `{"sesionId": "..."}` y nada más. Lo que sí queda
-- expuesto es el RITMO de actividad de un estudio: una competidora podría
-- contar cuántos movimientos de reserva tiene al día y a qué horas. Es
-- inteligencia de negocio, no datos personales, y se acepta a cambio de que la
-- visitante vea las plazas de verdad. Decisión del fundador, tomada con esto
-- delante.
--
-- Lo que NO se abre: sigue acotado a `extension = 'broadcast'` y a los topics
-- que empiezan por `aforo:`. Los canales de mensajería (`conversacion:`) y del
-- feed (`feed:`) tienen sus propias policies, las dos `to authenticated`, y
-- esta no los toca. Verificado en vivo: un anónimo casa `aforo:{id}` y NO casa
-- `feed:{id}`, `conversacion:{id}` ni un topic parecido como `aforox:{id}`.
--
-- Y no hay nada que escribir: esta policy es solo `for select`. Publicar en el
-- canal sigue siendo cosa del trigger, que es SECURITY DEFINER y ejecutable
-- únicamente por `service_role`.

drop policy if exists aforo_broadcast_lectura_anonima on realtime.messages;
create policy aforo_broadcast_lectura_anonima on realtime.messages
  for select
  to anon
  using (
    extension = 'broadcast'
    and split_part(realtime.topic(), ':', 1) = 'aforo'
  );
