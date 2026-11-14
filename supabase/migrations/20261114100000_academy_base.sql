-- ═══════════════════════════════════════════════════════════════════════════
-- Tentare Academy (base): vídeos de las guías, búsquedas sin resultado y «desactualizada».
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Decisiones del fundador (14-nov-2026): el texto de las guías sigue en código (con sus tests: que un
-- botón citado exista, que nada congelado se enseñe), y SOLO los vídeos y sus metadatos viven en la base
-- de datos, para poder publicarlos sin desplegar. Vídeos en Vimeo. Las búsquedas sin resultado se guardan
-- anonimizadas 90 días, con su frecuencia.
--
-- Las dos tablas son GLOBALES (el contenido de la ayuda es el mismo para todos los estudios): ninguna lleva
-- `studio_id` ni datos de nadie. Solo servidor, como `ayuda_feedback`: RLS activa y sin ninguna política
-- para anon/authenticated; las rutas con service-role son el único camino. Lleva igualmente la política
-- restrictiva `exige_doble_factor` que este repo exige a toda tabla con RLS.

-- ── 1. Vídeos ───────────────────────────────────────────────────────────────
create table if not exists public.ayuda_videos (
  -- 'categoria/slug' de la guía del registro (lib/ayuda/registro.ts). Una guía, un vídeo.
  articulo text primary key check (articulo ~ '^[a-z0-9-]+/[a-z0-9-]+$'),
  proveedor text not null default 'vimeo' check (proveedor = 'vimeo'),
  -- El id numérico de Vimeo, y el hash de un vídeo «no listado» (el parámetro h= de su reproductor).
  video_id text not null check (video_id ~ '^[0-9]{5,12}$'),
  hash_privado text check (hash_privado is null or hash_privado ~ '^[a-f0-9]{6,40}$'),
  titulo text not null check (char_length(titulo) between 3 and 120),
  duracion_seg integer not null check (duracion_seg between 5 and 3600),
  nivel text not null check (nivel in ('principiante', 'intermedio', 'avanzado')),
  -- «Lo que vas a conseguir»: una frase.
  resultado text check (resultado is null or char_length(resultado) between 5 and 200),
  destacado boolean not null default false,
  -- Un vídeo sin publicar no se ve en ninguna parte: «pendiente de producción» no se enseña.
  publicado boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table public.ayuda_videos enable row level security;
create policy exige_doble_factor on public.ayuda_videos as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
revoke all on public.ayuda_videos from anon, authenticated;
grant all on public.ayuda_videos to service_role;
comment on table public.ayuda_videos is
  'Vídeo (Vimeo) de una guía del Centro de ayuda. Global, solo servidor: lo escribe /interno/ayuda (permiso content.write) y lo lee la web pública. Un vídeo sin `publicado` no se enseña.';

-- ── 2. Búsquedas sin resultado (anonimizadas, 90 días) ──────────────────────
create table if not exists public.ayuda_busquedas (
  -- El día en Madrid, no en UTC.
  dia date not null,
  -- Ya normalizado y filtrado en servidor (lib/ayuda/busquedas-sin-resultado.ts): minúsculas, sin acentos, sin
  -- correos, teléfonos ni enlaces. Sin usuario, sin estudio, sin IP: solo qué se buscó y cuántas veces.
  termino text not null check (char_length(termino) between 3 and 60),
  veces integer not null default 1 check (veces >= 1),
  primary key (dia, termino)
);
alter table public.ayuda_busquedas enable row level security;
create policy exige_doble_factor on public.ayuda_busquedas as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
revoke all on public.ayuda_busquedas from anon, authenticated;
grant all on public.ayuda_busquedas to service_role;
comment on table public.ayuda_busquedas is
  'Búsquedas del Centro de ayuda que no dieron ningún resultado, anonimizadas, con su frecuencia por día. Se purgan a los 90 días (pg_cron `purgar-ayuda-busquedas`). Solo servidor.';

-- Sumar una vez, sin carreras: dos búsquedas iguales a la vez no se pisan.
create or replace function public.registrar_busqueda_sin_resultado(p_termino text)
returns void
language sql
security definer
set search_path to ''
as $$
  insert into public.ayuda_busquedas (dia, termino)
  values ((now() at time zone 'Europe/Madrid')::date, p_termino)
  on conflict (dia, termino) do update set veces = public.ayuda_busquedas.veces + 1;
$$;
revoke all on function public.registrar_busqueda_sin_resultado(text) from public, anon, authenticated;
grant execute on function public.registrar_busqueda_sin_resultado(text) to service_role;

-- La purga a los 90 días: SQL directo por pg_cron, sin HTTP ni Inngest (mismo patrón que `purgar-consultas-contacto`).
select cron.unschedule('purgar-ayuda-busquedas')
where exists (select 1 from cron.job where jobname = 'purgar-ayuda-busquedas');
select cron.schedule(
  'purgar-ayuda-busquedas',
  '35 4 * * *',
  $$delete from public.ayuda_busquedas where dia < ((now() at time zone 'Europe/Madrid')::date - 90)$$
);

-- ── 3. «Esta guía está desactualizada» ──────────────────────────────────────
-- Un valor más en la valoración existente: no hay tabla nueva ni otro botón que mantener.
alter table public.ayuda_feedback drop constraint if exists ayuda_feedback_valoracion_check;
alter table public.ayuda_feedback add constraint ayuda_feedback_valoracion_check
  check (valoracion in ('MALO', 'REGULAR', 'BUENO', 'DESACTUALIZADA'));

-- ── Comprobaciones: que nada quede abierto al cliente ───────────────────────
do $$
begin
  if has_table_privilege('anon', 'public.ayuda_videos', 'SELECT') or has_table_privilege('authenticated', 'public.ayuda_videos', 'SELECT') then
    raise exception 'ayuda_videos: el cliente no debe poder leerla (solo servidor)';
  end if;
  if has_table_privilege('anon', 'public.ayuda_busquedas', 'SELECT') or has_table_privilege('authenticated', 'public.ayuda_busquedas', 'SELECT') then
    raise exception 'ayuda_busquedas: el cliente no debe poder leerla (solo servidor)';
  end if;
  if has_function_privilege('anon', 'public.registrar_busqueda_sin_resultado(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.registrar_busqueda_sin_resultado(text)', 'EXECUTE') then
    raise exception 'registrar_busqueda_sin_resultado: solo service_role';
  end if;
end $$;
