-- ─────────────────────────────────────────────────────────────────────────────
-- Push por TIPO de aviso, no solo por categoría.
--
-- `notification_preference` guarda una fila por (usuario, categoría) y su
-- interruptor `push` apaga la categoría ENTERA: quien no quería el recordatorio
-- de una hora antes perdía también el de plaza liberada o el de valorar la
-- clase. `push_eventos` guarda las excepciones por tipo dentro de esa misma
-- fila: { "reserva.recordatorio_1h": false, ... }. Un tipo que no aparece
-- hereda el `push` de su categoría.
--
-- Columna en la fila existente y no tabla aparte a propósito: así hereda sin
-- tocar nada la RLS «solo la suya» (`preference_all`), el borrado de
-- `anonimizar_socio`, la purga de estudio y la exportación de datos.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.notification_preference
  add column if not exists push_eventos jsonb not null default '{}'::jsonb;

alter table public.notification_preference
  drop constraint if exists notification_preference_push_eventos_objeto;
alter table public.notification_preference
  add constraint notification_preference_push_eventos_objeto
  check (jsonb_typeof(push_eventos) = 'object');

-- Fija UN tipo sin reescribir los demás. Leer-modificar-escribir desde la ruta
-- perdería un cambio si la persona toca dos interruptores de la misma categoría
-- seguidos; aquí la fusión (`||`) la hace la propia fila, en una sentencia.
-- Si la fila aún no existe se crea con los mismos valores por defecto que la
-- ruta (`POR_DEFECTO`): in-app y push encendidos, email apagado.
create or replace function public.fijar_push_evento(
  p_user_id uuid,
  p_studio_id text,
  p_category text,
  p_event_type text,
  p_push boolean
) returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.notification_preference as np
    (id, studio_id, user_id, category, inapp, push, email, whatsapp, sms, push_eventos, updated_at)
  values
    ('pref-' || p_user_id::text || '-' || p_category, p_studio_id, p_user_id, p_category,
     true, true, false, false, false, jsonb_build_object(p_event_type, p_push), now())
  on conflict (user_id, category) do update
    set push_eventos = np.push_eventos || jsonb_build_object(p_event_type, p_push),
        updated_at = now();
$$;

-- Solo la llama la ruta, con service-role y después de validar la pertenencia
-- al estudio y el tipo. Los tres pasos: el default ACL de este proyecto concede
-- EXECUTE directo a anon/authenticated, así que revocar PUBLIC no basta.
revoke all on function public.fijar_push_evento(uuid, text, text, text, boolean) from public;
revoke all on function public.fijar_push_evento(uuid, text, text, text, boolean) from anon;
revoke all on function public.fijar_push_evento(uuid, text, text, text, boolean) from authenticated;
grant execute on function public.fijar_push_evento(uuid, text, text, text, boolean) to service_role;
