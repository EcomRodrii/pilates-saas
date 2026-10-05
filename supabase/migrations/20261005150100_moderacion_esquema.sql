-- ─────────────────────────────────────────────────────────────────────────────
-- Moderación de la app (App Store 1.2): denunciar, bloquear, retirar y cerrar.
-- Solo el esquema y las reglas de la base de datos; todavía sin pantallas.
--
-- Qué añade:
--   · `conversaciones.cerrada_en/_por`: el estudio cierra un hilo
--     instructora–alumna tras una denuncia. Solo ese tipo: el hilo con el
--     estudio no lo cierra nadie (lo exige `resolver_denuncia`).
--   · `conversacion_participantes.bloqueo_en`: esta parte ha bloqueado a la
--     otra en ese hilo.
--   · `mensajes.oculto_en/_por` y `comentarios_comunidad.oculto_en/_por`:
--     retirado por el estudio. Las apps enseñan «Mensaje retirado por el
--     estudio» (lib/moderacion/reglas.ts); el panel ve el texto.
--   · `comentarios_comunidad.socio_id`: la ficha de la alumna que lo escribió.
--     `autor_id` es su cuenta y deja de reconocerla si borra la cuenta y vuelve
--     con otra; la exportación y la supresión la buscan por la ficha.
--   · `denuncias`: denuncias y bloqueos (un bloqueo también avisa a quien
--     modera: motivo BLOQUEO). `socio_id` es la ficha de QUIEN DENUNCIA, si es
--     una alumna; `autor_auth_user_id`, la cuenta de quien escribió lo
--     denunciado. Sin políticas para `authenticated`: solo rutas de servidor.
--   · `normas_comunidad_aceptaciones`: qué versión de las normas aceptó cada
--     cuenta antes de escribir (la pantalla llega con su propio PR).
--   · Un trigger: nadie escribe en un hilo cerrado o bloqueado, venga por la vía
--     que venga (panel con su sesión o apps con service-role). Y quien da
--     clases y atiende también el mostrador no rodea un bloqueo escribiendo a
--     esa alumna por el hilo del estudio (salvo la dueña, que ahí habla como el
--     estudio).
--   · `ocultar_comentario_comunidad`: retirar o volver a mostrar un comentario,
--     con su contador. Un único dueño, que usan la denuncia y el panel.
--   · `resolver_denuncia`: decidir y aplicar en una transacción. Quien revisa
--     nunca es quien escribió lo denunciado. Una denuncia del estudio sin
--     revisar en 24 h la puede resolver Tentare: es una regla de negocio que se
--     calcula en cada llamada, no un reloj (`HORAS_REVISION_ESTUDIO` en
--     lib/moderacion/reglas.ts; un test ata las dos cifras).
--   · Purga diaria de las denuncias RESUELTAS hace más de 12 meses. Las
--     pendientes no se borran nunca: sin contestar, pasan a Tentare.
--     ⚠️ REVISIÓN LEGAL: el plazo de 12 meses es provisional.
--
-- Aditiva: va ANTES de desplegar el código (las rutas nuevas leen
-- `oculto_en`, `cerrada_en` y `bloqueo_en`). Con el código de antes no cambia
-- nada: ninguna fila nace cerrada, bloqueada ni retirada. Se puede repetir.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Columnas ──────────────────────────────────────────────────────────────
alter table public.conversaciones add column if not exists cerrada_en timestamptz;
alter table public.conversaciones add column if not exists cerrada_por uuid references auth.users(id) on delete set null;
alter table public.conversacion_participantes add column if not exists bloqueo_en timestamptz;
alter table public.mensajes add column if not exists oculto_en timestamptz;
alter table public.mensajes add column if not exists oculto_por uuid references auth.users(id) on delete set null;
alter table public.comentarios_comunidad add column if not exists oculto_en timestamptz;
alter table public.comentarios_comunidad add column if not exists oculto_por uuid references auth.users(id) on delete set null;
alter table public.comentarios_comunidad add column if not exists socio_id text references public.socios(id) on delete cascade;

create index if not exists idx_conversaciones_cerrada_por on public.conversaciones (cerrada_por) where cerrada_por is not null;
create index if not exists idx_mensajes_oculto_por on public.mensajes (oculto_por) where oculto_por is not null;
create index if not exists idx_comentarios_comunidad_oculto_por on public.comentarios_comunidad (oculto_por) where oculto_por is not null;
create index if not exists idx_comentarios_comunidad_socio on public.comentarios_comunidad (socio_id) where socio_id is not null;

comment on column public.conversaciones.cerrada_en is
  'El estudio cerró este hilo instructora–alumna tras una denuncia: nadie más escribe en él (trigger trg_mensajes_conversacion_abierta). Solo lo escribe el servidor.';
comment on column public.conversacion_participantes.bloqueo_en is
  'Esta parte ha bloqueado a la otra en este hilo ALUMNA_INSTRUCTORA de este estudio. Solo en este estudio: otra sede o una ficha nueva es otra conversación. Solo lo escribe el servidor.';
comment on column public.mensajes.oculto_en is
  'Retirado por el estudio tras una denuncia. Las apps enseñan «Mensaje retirado por el estudio»; el panel ve el texto.';
comment on column public.comentarios_comunidad.oculto_en is
  'Retirado por el estudio. Las apps no se lo enseñan a nadie más que a quien lo escribió; el panel lo ve.';
comment on column public.comentarios_comunidad.socio_id is
  'La ficha de la alumna que lo escribió (NULL si lo escribió el equipo). `autor_id` es su cuenta.';

-- La ficha de la autora en los comentarios que ya existen. Nunca a un comentario
-- del equipo (su cuenta puede ser también la de una ficha de alumna).
update public.comentarios_comunidad cc set socio_id = s.id
  from public.socios s
 where cc.socio_id is null
   and s.studio_id = cc.studio_id
   and (cc.autor_id = s.id or (s.auth_user_id is not null and cc.autor_id = s.auth_user_id::text))
   and not exists (select 1 from public.instructores i
                    where i.studio_id = cc.studio_id and i.auth_user_id::text = cc.autor_id)
   and not exists (select 1 from public.studios st
                    where st.id = cc.studio_id and st.owner_auth_user_id::text = cc.autor_id);

-- ── 2. Denuncias ─────────────────────────────────────────────────────────────
create table if not exists public.denuncias (
  id text primary key default ('den-' || gen_random_uuid()::text),
  studio_id text not null references public.studios(id) on delete cascade,
  ambito text not null check (ambito in ('CHAT_INSTRUCTORA', 'CHAT_ESTUDIO', 'TABLON')),
  motivo text not null default 'DENUNCIA' check (motivo in ('DENUNCIA', 'BLOQUEO')),
  destino text not null check (destino in ('ESTUDIO', 'TENTARE')),
  conversacion_id text references public.conversaciones(id) on delete cascade,
  mensaje_id text references public.mensajes(id) on delete cascade,
  comentario_id text references public.comentarios_comunidad(id) on delete cascade,
  autor_auth_user_id uuid references auth.users(id) on delete set null,
  denunciante_auth_user_id uuid references auth.users(id) on delete set null,
  socio_id text references public.socios(id) on delete set null,
  detalle text check (detalle is null or char_length(detalle) <= 500),
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE', 'MANTENIDA', 'CONTENIDO_OCULTO', 'CONVERSACION_CERRADA')),
  creada_en timestamptz not null default now(),
  resuelta_en timestamptz,
  resuelta_por uuid references auth.users(id) on delete set null,
  revisada_por text check (revisada_por in ('ESTUDIO', 'TENTARE')),
  constraint denuncias_tablon_con_comentario check ((ambito = 'TABLON') = (comentario_id is not null)),
  constraint denuncias_chat_con_conversacion check ((ambito = 'TABLON') = (conversacion_id is null)),
  constraint denuncias_sobre_algo check (motivo = 'BLOQUEO' or mensaje_id is not null or comentario_id is not null),
  constraint denuncias_resuelta_con_fecha check ((estado = 'PENDIENTE') = (resuelta_en is null)),
  constraint denuncias_resuelta_con_revisor check ((estado = 'PENDIENTE') = (revisada_por is null)),
  constraint denuncias_cerrar_solo_instructora check (estado <> 'CONVERSACION_CERRADA' or ambito = 'CHAT_INSTRUCTORA')
);

comment on table public.denuncias is
  'Denuncias y bloqueos desde la app (App Store 1.2). Sin políticas para authenticated: solo rutas de servidor. Quien revisa nunca es quien escribió lo denunciado (lo comprueba resolver_denuncia).';
comment on column public.denuncias.socio_id is
  'La ficha de QUIEN DENUNCIA, si es una alumna. Sale en su «Descargar mis datos».';
comment on column public.denuncias.autor_auth_user_id is
  'La cuenta de quien escribió lo denunciado (o de quien fue bloqueada). Nunca puede resolver la denuncia.';

-- La misma persona no denuncia dos veces lo mismo mientras siga pendiente.
create unique index if not exists uq_denuncias_pendiente
  on public.denuncias (denunciante_auth_user_id, motivo, coalesce(mensaje_id, comentario_id, conversacion_id))
  where estado = 'PENDIENTE';
create index if not exists idx_denuncias_studio on public.denuncias (studio_id);
create index if not exists idx_denuncias_pendientes on public.denuncias (studio_id, destino, ambito, creada_en) where estado = 'PENDIENTE';
create index if not exists idx_denuncias_conversacion on public.denuncias (conversacion_id) where conversacion_id is not null;
create index if not exists idx_denuncias_mensaje on public.denuncias (mensaje_id) where mensaje_id is not null;
create index if not exists idx_denuncias_comentario on public.denuncias (comentario_id) where comentario_id is not null;
create index if not exists idx_denuncias_socio on public.denuncias (socio_id) where socio_id is not null;
create index if not exists idx_denuncias_denunciante on public.denuncias (denunciante_auth_user_id) where denunciante_auth_user_id is not null;
create index if not exists idx_denuncias_autor on public.denuncias (autor_auth_user_id) where autor_auth_user_id is not null;
create index if not exists idx_denuncias_resuelta_por on public.denuncias (resuelta_por) where resuelta_por is not null;

alter table public.denuncias enable row level security;
revoke all on table public.denuncias from public, anon, authenticated;
grant all on table public.denuncias to service_role;
drop policy if exists exige_doble_factor on public.denuncias;
create policy exige_doble_factor on public.denuncias as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- ── 3. Normas de la comunidad aceptadas ──────────────────────────────────────
create table if not exists public.normas_comunidad_aceptaciones (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  version text not null,
  aceptada_en timestamptz not null default now(),
  primary key (auth_user_id, version)
);

comment on table public.normas_comunidad_aceptaciones is
  'Qué versión de las normas de la comunidad (tolerancia cero) aceptó cada cuenta antes de escribir en el chat o el tablón. Solo la escribe el servidor.';

alter table public.normas_comunidad_aceptaciones enable row level security;
revoke all on table public.normas_comunidad_aceptaciones from public, anon, authenticated;
grant all on table public.normas_comunidad_aceptaciones to service_role;
drop policy if exists exige_doble_factor on public.normas_comunidad_aceptaciones;
create policy exige_doble_factor on public.normas_comunidad_aceptaciones as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- ── 4. Nadie escribe en un hilo cerrado o bloqueado ──────────────────────────
-- SECURITY DEFINER: tiene que ver los participantes de los dos hilos aunque quien
-- escribe (el panel, con su sesión) no pueda leerlos. Los códigos los traduce
-- `errorDeModeracion` (lib/moderacion/reglas.ts) a un 409.
create or replace function public.mensajes_conversacion_abierta()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if exists (select 1 from public.conversaciones c
              where c.id = new.conversacion_id and c.cerrada_en is not null) then
    raise exception 'CONVERSACION_CERRADA' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.conversacion_participantes cp
              where cp.conversacion_id = new.conversacion_id and cp.bloqueo_en is not null) then
    raise exception 'CONVERSACION_BLOQUEADA' using errcode = 'P0001';
  end if;
  -- El hilo del estudio con una alumna, escrito por alguien del equipo que tiene un
  -- bloqueo con ella en su hilo instructora–alumna (lo puso cualquiera de las dos).
  -- La dueña sí: ahí habla como el estudio.
  if exists (
    select 1
      from public.conversaciones c
      join public.conversacion_participantes alumna
        on alumna.conversacion_id = c.id and alumna.rol_en_conversacion = 'SOCIO'
      join public.conversacion_participantes s2
        on s2.socio_id = alumna.socio_id and s2.rol_en_conversacion = 'SOCIO'
      join public.conversaciones c2
        on c2.id = s2.conversacion_id and c2.tipo = 'ALUMNA_INSTRUCTORA'
      join public.conversacion_participantes t2
        on t2.conversacion_id = c2.id and t2.rol_en_conversacion = 'STAFF'
     where c.id = new.conversacion_id
       and c.tipo = 'ALUMNA_MOSTRADOR'
       and t2.auth_user_id = new.remitente_auth_user_id
       and (s2.bloqueo_en is not null or t2.bloqueo_en is not null)
       and not exists (select 1 from public.studios st
                        where st.id = c.studio_id and st.owner_auth_user_id = new.remitente_auth_user_id)
  ) then
    raise exception 'CONVERSACION_BLOQUEADA' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_mensajes_conversacion_abierta on public.mensajes;
create trigger trg_mensajes_conversacion_abierta
  before insert on public.mensajes
  for each row execute function public.mensajes_conversacion_abierta();

-- ── 5. Retirar o volver a mostrar un comentario ──────────────────────────────
-- Un único dueño: lo usan la denuncia (resolver_denuncia) y, más adelante, el botón
-- del panel. Al retirar, cierra también las denuncias pendientes de ese comentario.
create or replace function public.ocultar_comentario_comunidad(
  p_comentario_id text, p_studio_id text, p_ocultar boolean, p_por uuid, p_revisor text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_post text;
  v_cerradas jsonb := '[]'::jsonb;
begin
  if p_revisor is null or p_revisor not in ('ESTUDIO', 'TENTARE') or p_ocultar is null then
    raise exception 'ACCION_INVALIDA' using errcode = '22023';
  end if;

  update public.comentarios_comunidad cc
     set oculto_en = case when p_ocultar then now() end,
         oculto_por = case when p_ocultar then p_por end
   where cc.id = p_comentario_id and cc.studio_id = p_studio_id
     and (cc.oculto_en is null) = p_ocultar
  returning cc.post_id into v_post;

  if v_post is null then
    return jsonb_build_object('cambiado', false, 'cerradas', v_cerradas);
  end if;

  perform public.ajustar_comentarios_count(v_post, p_studio_id, case when p_ocultar then -1 else 1 end);

  if p_ocultar then
    with cerradas as (
      update public.denuncias d
         set estado = 'CONTENIDO_OCULTO', resuelta_en = now(), resuelta_por = p_por, revisada_por = p_revisor
       where d.studio_id = p_studio_id and d.comentario_id = p_comentario_id and d.estado = 'PENDIENTE'
      returning d.id, d.motivo, d.denunciante_auth_user_id
    )
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'motivo', x.motivo, 'denunciante', x.denunciante_auth_user_id)), '[]'::jsonb)
      into v_cerradas
      from cerradas x;
  end if;

  return jsonb_build_object('cambiado', true, 'cerradas', v_cerradas);
end;
$function$;

-- ── 6. Resolver una denuncia ─────────────────────────────────────────────────
-- Devuelve jsonb, no RETURNS TABLE: así ninguna columna de salida choca con las de
-- `denuncias` (el 42702 de la Fase 2b). Las 24 h son HORAS_REVISION_ESTUDIO.
create or replace function public.resolver_denuncia(
  p_denuncia_id text, p_studio_id text, p_accion text, p_revisor text, p_por uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d public.denuncias%rowtype;
  v_tipo text;
  v_resultado text;
  v_cerradas jsonb;
begin
  if p_accion is null or p_accion not in ('MANTENER', 'OCULTAR', 'CERRAR_CONVERSACION')
     or p_revisor is null or p_revisor not in ('ESTUDIO', 'TENTARE') then
    raise exception 'ACCION_INVALIDA' using errcode = '22023';
  end if;

  -- Solo la puede resolver quien le toca (el estudio las suyas; Tentare las suyas y las
  -- del estudio sin revisar en 24 h) y nunca quien escribió lo denunciado.
  select d.* into v_d
    from public.denuncias d
   where d.id = p_denuncia_id
     and d.studio_id = p_studio_id
     and (d.destino = p_revisor or (p_revisor = 'TENTARE' and d.creada_en < now() - interval '24 hours'))
     and d.autor_auth_user_id is distinct from p_por
   for update;
  if v_d.id is null then
    raise exception 'DENUNCIA_NO_EXISTE' using errcode = 'P0002';
  end if;
  if v_d.estado <> 'PENDIENTE' then
    raise exception 'DENUNCIA_YA_RESUELTA' using errcode = 'P0001';
  end if;
  if p_accion = 'OCULTAR' and v_d.mensaje_id is null and v_d.comentario_id is null then
    raise exception 'ACCION_INVALIDA' using errcode = '22023';
  end if;
  if p_accion = 'CERRAR_CONVERSACION' then
    select c.tipo into v_tipo
      from public.conversaciones c
     where c.id = v_d.conversacion_id and c.studio_id = p_studio_id;
    if v_tipo is distinct from 'ALUMNA_INSTRUCTORA' then
      raise exception 'ACCION_INVALIDA' using errcode = '22023';
    end if;
  end if;

  v_resultado := case p_accion
    when 'MANTENER' then 'MANTENIDA'
    when 'OCULTAR' then 'CONTENIDO_OCULTO'
    else 'CONVERSACION_CERRADA'
  end;

  -- Esta y las demás pendientes del mismo contenido (o del mismo hilo, si se cierra):
  -- una decisión, una vez. Las mismas reglas de quién puede que arriba.
  with cerradas as (
    update public.denuncias d
       set estado = v_resultado, resuelta_en = now(), resuelta_por = p_por, revisada_por = p_revisor
     where d.studio_id = p_studio_id
       and d.estado = 'PENDIENTE'
       and (d.destino = p_revisor or (p_revisor = 'TENTARE' and d.creada_en < now() - interval '24 hours'))
       and d.autor_auth_user_id is distinct from p_por
       and (d.id = v_d.id
            or (v_d.mensaje_id is not null and d.mensaje_id = v_d.mensaje_id)
            or (v_d.comentario_id is not null and d.comentario_id = v_d.comentario_id)
            or (p_accion = 'CERRAR_CONVERSACION' and d.conversacion_id = v_d.conversacion_id))
    returning d.id, d.motivo, d.denunciante_auth_user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'motivo', x.motivo, 'denunciante', x.denunciante_auth_user_id)), '[]'::jsonb)
    into v_cerradas
    from cerradas x;

  if p_accion = 'OCULTAR' and v_d.mensaje_id is not null then
    update public.mensajes m
       set oculto_en = now(), oculto_por = p_por
     where m.id = v_d.mensaje_id and m.studio_id = p_studio_id and m.oculto_en is null;
  elsif p_accion = 'OCULTAR' then
    perform public.ocultar_comentario_comunidad(v_d.comentario_id, p_studio_id, true, p_por, p_revisor);
  elsif p_accion = 'CERRAR_CONVERSACION' then
    update public.conversaciones c
       set cerrada_en = now(), cerrada_por = p_por
     where c.id = v_d.conversacion_id and c.studio_id = p_studio_id and c.cerrada_en is null;
  end if;

  return jsonb_build_object(
    'resultado', v_resultado,
    'ambito', v_d.ambito,
    'motivo', v_d.motivo,
    'mensajeId', v_d.mensaje_id,
    'comentarioId', v_d.comentario_id,
    'conversacionId', v_d.conversacion_id,
    'autor', v_d.autor_auth_user_id,
    'cerradas', v_cerradas
  );
end;
$function$;

-- ── 7. Las tres funciones, solo para el servidor ─────────────────────────────
-- `pg_default_acl` da EXECUTE directo a anon y authenticated en toda función nueva:
-- revocar PUBLIC no basta (tentare-os.md).
revoke all on function public.mensajes_conversacion_abierta() from public;
revoke all on function public.mensajes_conversacion_abierta() from anon;
revoke all on function public.mensajes_conversacion_abierta() from authenticated;
grant execute on function public.mensajes_conversacion_abierta() to service_role;

revoke all on function public.ocultar_comentario_comunidad(text, text, boolean, uuid, text) from public;
revoke all on function public.ocultar_comentario_comunidad(text, text, boolean, uuid, text) from anon;
revoke all on function public.ocultar_comentario_comunidad(text, text, boolean, uuid, text) from authenticated;
grant execute on function public.ocultar_comentario_comunidad(text, text, boolean, uuid, text) to service_role;

revoke all on function public.resolver_denuncia(text, text, text, text, uuid) from public;
revoke all on function public.resolver_denuncia(text, text, text, text, uuid) from anon;
revoke all on function public.resolver_denuncia(text, text, text, text, uuid) from authenticated;
grant execute on function public.resolver_denuncia(text, text, text, text, uuid) to service_role;

-- ── 8. Conservación de las resueltas ─────────────────────────────────────────
-- ⚠️ REVISIÓN LEGAL: 12 meses es provisional. Las PENDIENTES no se purgan.
select cron.unschedule('purgar-denuncias-resueltas')
 where exists (select 1 from cron.job where jobname = 'purgar-denuncias-resueltas');
select cron.schedule(
  'purgar-denuncias-resueltas',
  '23 4 * * *',
  $$delete from public.denuncias where estado <> 'PENDIENTE' and resuelta_en < now() - interval '12 months'$$
);

-- ── 9. Comprobación al aplicar (no fiarse del comentario SQL) ────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.mensajes_conversacion_abierta()',
    'public.ocultar_comentario_comunidad(text, text, boolean, uuid, text)',
    'public.resolver_denuncia(text, text, text, text, uuid)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE')
       or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'permisos de %: solo service_role', f;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.denuncias', 'SELECT')
     or has_table_privilege('authenticated', 'public.denuncias', 'INSERT')
     or has_table_privilege('authenticated', 'public.denuncias', 'UPDATE')
     or has_table_privilege('authenticated', 'public.denuncias', 'DELETE')
     or has_table_privilege('anon', 'public.denuncias', 'SELECT')
     or has_table_privilege('authenticated', 'public.normas_comunidad_aceptaciones', 'SELECT')
     or has_table_privilege('authenticated', 'public.normas_comunidad_aceptaciones', 'INSERT')
     or has_table_privilege('anon', 'public.normas_comunidad_aceptaciones', 'SELECT') then
    raise exception 'una tabla nueva de moderación está abierta al navegador';
  end if;

  -- El estado de moderación lo escribe solo el servidor.
  if has_column_privilege('authenticated', 'public.conversacion_participantes', 'bloqueo_en', 'UPDATE')
     or has_column_privilege('authenticated', 'public.conversaciones', 'cerrada_en', 'UPDATE')
     or has_column_privilege('authenticated', 'public.conversaciones', 'cerrada_por', 'UPDATE')
     or has_column_privilege('authenticated', 'public.mensajes', 'oculto_en', 'UPDATE')
     or has_column_privilege('authenticated', 'public.mensajes', 'oculto_en', 'INSERT')
     or has_column_privilege('authenticated', 'public.comentarios_comunidad', 'oculto_en', 'UPDATE') then
    raise exception 'el navegador podría escribir el estado de moderación';
  end if;

  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.mensajes'::regclass
                    and tgname = 'trg_mensajes_conversacion_abierta' and not tgisinternal) then
    raise exception 'falta el trigger trg_mensajes_conversacion_abierta';
  end if;
end $$;
