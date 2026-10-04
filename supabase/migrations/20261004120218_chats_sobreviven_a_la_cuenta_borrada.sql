-- ─────────────────────────────────────────────────────────────────────────────
-- Los chats con el estudio sobreviven a que la alumna borre su cuenta.
--
-- «Borrar mi cuenta de Tentare» (App Store 5.1.1(v), /api/public/cuenta/borrar)
-- borra la cuenta de Auth y deja la ficha del estudio. Hasta ahora la fila de la
-- alumna en `conversacion_participantes` caía en cascada con la cuenta (su
-- `auth_user_id` era NOT NULL, ON DELETE CASCADE y parte de la clave primaria):
-- el estudio se quedaba con conversaciones que no decían de quién eran, porque la
-- bandeja la identifica por el `socio_id` de esa fila. Decisión del fundador
-- (4-oct-2026): se quedan con su nombre.
--
-- · La fila se queda con `auth_user_id = null` (ON DELETE SET NULL) y su
--   `socio_id`, que es lo que pinta el nombre. Nadie puede volver a leerla como
--   suya (las políticas comparan con `auth.uid()`, y null no casa con nada).
-- · Clave primaria nueva (`id`): una PK no admite nulos. La unicidad de siempre
--   sigue como UNIQUE (conversacion_id, auth_user_id); con nulos no choca.
-- · El resumen de no leídos agrupaba por cuenta: sin el filtro, saldría un grupo
--   con cuenta nula al que no hay a quién avisar.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.conversacion_participantes drop constraint conversacion_participantes_pkey;
alter table public.conversacion_participantes add column id bigint generated always as identity;
alter table public.conversacion_participantes add constraint conversacion_participantes_pkey primary key (id);
alter table public.conversacion_participantes
  add constraint conversacion_participantes_conversacion_usuario_key unique (conversacion_id, auth_user_id);

alter table public.conversacion_participantes alter column auth_user_id drop not null;
alter table public.conversacion_participantes
  drop constraint conversacion_participantes_auth_user_id_fkey,
  add constraint conversacion_participantes_auth_user_id_fkey
    foreign key (auth_user_id) references auth.users(id) on delete set null;

create or replace function public.mensajes_no_leidos_para_digest()
 returns table(auth_user_id uuid, studio_id text, studio_slug text, conversaciones bigint)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select cp.auth_user_id, c.studio_id, s.slug, count(*)::bigint as conversaciones
    from conversacion_participantes cp
    join conversaciones c on c.id = cp.conversacion_id
    join studios s on s.id = c.studio_id
   where cp.leido_hasta < c.ultimo_mensaje_en
     and cp.auth_user_id is not null
   group by cp.auth_user_id, c.studio_id, s.slug;
$function$;

-- Solo la llama el cron del resumen (service_role); nadie del cliente.
revoke all on function public.mensajes_no_leidos_para_digest() from public, anon, authenticated;
grant execute on function public.mensajes_no_leidos_para_digest() to service_role;
