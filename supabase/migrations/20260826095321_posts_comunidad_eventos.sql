-- Community & Messaging OS, P2 — "Eventos como entidad propia dentro del
-- Feed". Un post de comunidad puede ser un EVENTO con fecha/aforo/lugar en
-- vez de solo texto, y las socias pueden apuntarse con control de aforo.
--
-- Diseño validado por tentare-arquitecto. Aditiva: el DEFAULT 'TEXTO' deja
-- todo post ya existente exactamente como estaba (mismo criterio que
-- 20260826015923_posts_comunidad_audiencia.sql con 'TODAS').

-- ── 1) posts_comunidad gana tipo EVENTO ──────────────────────────────────
alter table public.posts_comunidad
  add column tipo text not null default 'TEXTO' check (tipo in ('TEXTO','EVENTO')),
  add column evento_fecha timestamptz,
  add column evento_aforo integer,
  add column evento_lugar text;

alter table public.posts_comunidad
  add constraint posts_comunidad_evento_fecha_check
  check (tipo <> 'EVENTO' or evento_fecha is not null);

-- ── 2) Asistentes de un evento ────────────────────────────────────────────
create table public.post_evento_asistentes (
  post_id   text not null references public.posts_comunidad(id) on delete cascade,
  socio_id  text not null references public.socios(id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (post_id, socio_id)
);
create index idx_post_evento_asistentes_post on public.post_evento_asistentes(post_id);

alter table public.post_evento_asistentes enable row level security;

-- Solo lectura para el staff del mismo estudio del post (vía join, la tabla
-- no tiene studio_id propio). Sin INSERT/DELETE para authenticated/anon a
-- propósito: la socia no tiene JWT de negocio (mismo criterio que
-- red_resenas/red_formalizaciones) y el staff "apunta" a través de la RPC de
-- abajo para que la comprobación de aforo sea atómica, no de un INSERT
-- directo con condición de carrera entre dos peticiones simultáneas.
create policy admin_post_evento_asistentes_select on public.post_evento_asistentes
  for select to authenticated
  using (exists (
    select 1 from public.posts_comunidad p
    where p.id = post_evento_asistentes.post_id
      and p.studio_id = public.current_studio_id()
  ));

-- ── 3) RPC transaccional: apuntar a una socia con aforo atómico ──────────
-- `select ... for update` bloquea la fila del post durante la transacción,
-- así que dos llamadas concurrentes para el MISMO post_id se serializan: la
-- segunda espera a que la primera confirme el conteo e inserte (o libere el
-- lock sin insertar) antes de leer `evento_aforo`/contar asistentes. Sin ese
-- lock, un `count(*) < aforo` seguido de INSERT tiene la misma condición de
-- carrera ya vista en overbooking-lista-espera-aforo.
-- Solo invocable con service_role (ver revoke de abajo): el llamador real es
-- una API route con getSupabaseAdmin() que ya validó sesión de socia/staff
-- antes de llegar aquí — mismo patrón que crearReservaPublica.
create or replace function public.apuntarse_evento_comunidad(p_post_id text, p_socio_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_aforo integer;
  v_count integer;
begin
  select tipo, evento_aforo into v_tipo, v_aforo
    from public.posts_comunidad
    where id = p_post_id
    for update;

  if not found then
    raise exception 'POST_NO_ENCONTRADO';
  end if;
  if v_tipo <> 'EVENTO' then
    raise exception 'NO_ES_EVENTO';
  end if;

  if v_aforo is not null then
    select count(*) into v_count from public.post_evento_asistentes where post_id = p_post_id;
    if v_count >= v_aforo then
      return false; -- aforo lleno, sin insertar
    end if;
  end if;

  insert into public.post_evento_asistentes (post_id, socio_id)
    values (p_post_id, p_socio_id)
    on conflict (post_id, socio_id) do nothing;

  return true;
end;
$$;

-- Cierre de acceso explícito (gotcha de pg_default_acl documentado en
-- tentare-os.md: el proyecto da EXECUTE en toda función SECURITY DEFINER
-- nueva DIRECTO a anon/authenticated, no heredado de PUBLIC — hace falta
-- revocar los tres roles uno a uno, nunca solo `FROM PUBLIC`).
revoke execute on function public.apuntarse_evento_comunidad(text, text) from public, anon, authenticated;
grant execute on function public.apuntarse_evento_comunidad(text, text) to service_role;
