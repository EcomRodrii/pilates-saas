-- El self-claim del navegador nunca funcionó. Se retira y se sustituye por
-- POST /api/equipo/reclamar (service-role, reglas en TypeScript).
--
-- POR QUÉ NO FUNCIONABA (verificado en producción, transacción revertida):
-- en Postgres un UPDATE que referencia columnas de la tabla en el WHERE, o que
-- lleva RETURNING, aplica TAMBIÉN las policies de SELECT. La única de SELECT
-- sobre `instructores` es `read_instructores`: studio_id = current_studio_id().
-- Para una cuenta recién creada `current_studio_id()` es NULL ⇒ no ve ninguna
-- fila ⇒ 0 filas actualizadas, sin error. Y `dbClaimInstructorAccount` hacía
-- justo las dos cosas: filtraba por email y pedía .select().maybeSingle().
--
-- ⇒ el self-claim solo funcionaba para quien YA pertenecía a un estudio, o sea
--   exactamente al revés de para quién se escribió. Es lo que dejó a Rosi y a
--   María Soler con la cuenta creada y sin vincular, y hubo que enlazarlas a
--   mano por SQL.
--
-- Se quita la policy en vez de intentar arreglarla, por dos motivos:
--
--  1. Para que ese UPDATE funcionase habría que abrir también el SELECT de
--     `instructores` a filas de estudios ajenos (filtrando por el email del
--     JWT), y eso convierte una tabla con nombres y correos del personal en algo
--     consultable desde fuera del estudio.
--  2. Su condición —`email = auth.jwt() ->> 'email'`— daba por buena la
--     coincidencia de correo COMO SI FUERA una invitación. No lo es: el alta de
--     estudios es pública, así que cualquiera podía crear una ficha con el
--     correo de otra persona y quedarse esperando a que entrara. La vinculación
--     ahora exige el enlace firmado del correo de invitación, que es donde vive
--     el consentimiento (el razonamiento largo, en lib/equipo/reclamar-reglas.ts).
--
-- El servidor con service-role no necesita ninguna de las dos cosas.

drop policy if exists self_claim_instructores on public.instructores;

-- ── El trigger de 0124, ahora sí ─────────────────────────────────────────────
--
-- 0124 puso una red para que el gesto de reclamar no pudiera además ascender de
-- rol ni cambiar de estudio. Su condición incluía `new.auth_user_id = auth.uid()`
-- porque entonces el UPDATE lo lanzaba el navegador. Ahora lo lanza una ruta de
-- servidor con service-role, donde `auth.uid()` es NULL — o sea, la red había
-- dejado de cubrir el único camino que queda vivo.
--
-- Hoy no es explotable (la ruta escribe `auth_user_id` y nada más), pero una red
-- que no cubre nada es peor que no tenerla: se cuenta con ella. Se quita esa
-- condición y se deja la señal que de verdad define el gesto y que ninguna otra
-- escritura reproduce: la fila pasa de auth_user_id NULL a NO NULL.
--
-- Las escrituras legítimas de la propietaria y del manager van sobre filas ya
-- reclamadas (o con auth_user_id nulo a ambos lados) y no entran por esta rama.
create or replace function public.self_claim_no_escala() returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if old.auth_user_id is null and new.auth_user_id is not null then
    -- Vincular una cuenta a su ficha. No asciende ni cambia de estudio.
    new.rol       := old.rol;
    new.studio_id := old.studio_id;
  end if;
  return new;
end;
$$;
