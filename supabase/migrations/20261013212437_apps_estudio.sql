-- Apps de tienda por estudio (piloto, 14-oct-2026): qué bundle id es la app de qué estudio.
--
-- Hoy la app «Tentare» (app.tentare) abre el selector de estudios. Una app de un
-- estudio (nombre, icono y color propios, publicada desde la cuenta de Tentare)
-- necesita saber DE QUÉ estudio es: esta tabla es ese mapa, y nada más.
--
-- ⚠️ `activa = false` por defecto, y es el único interruptor: sin fila activa el
-- endpoint contesta 404, el fichero de enlaces universales no cambia, subscribe
-- sigue aceptando solo `app.tentare` y `/app` se comporta como hasta ahora.
--
-- Solo la lee y escribe el servidor (service-role). `studio_id` como clave: una
-- app por estudio (sede). El Team de Apple vive en `APPLE_TEAM_ID` y hoy es único
-- (la cuenta de Tentare); si algún día hay apps en cuentas de estudio, se añade
-- la columna entonces. Las reglas de `bundle_id` y `nombre_app` replican
-- `lib/nativo/identidad-app.ts`, con el bundle en minúsculas.

create table if not exists public.apps_estudio (
  studio_id  text primary key references public.studios(id) on delete cascade,
  bundle_id  text not null unique,
  nombre_app text not null,
  activa     boolean not null default false,
  creada_en  timestamptz not null default now(),
  -- Cada restricción en UNA línea: `scripts/gen-db-types.py` lee el cuerpo línea a línea y
  -- tomaría las condiciones de varias líneas por columnas (ya pasó: salía una columna `and`).
  constraint apps_estudio_bundle check (bundle_id = lower(bundle_id) and bundle_id <> 'app.tentare' and char_length(bundle_id) <= 155 and bundle_id ~ '^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$'),
  constraint apps_estudio_nombre check (nombre_app = btrim(nombre_app) and char_length(nombre_app) between 1 and 30 and nombre_app !~ '[$]|//')
);

alter table public.apps_estudio enable row level security;
revoke all on table public.apps_estudio from anon, authenticated;

-- La política restrictiva de la verificación en dos pasos va en TODA tabla de
-- `public` con RLS (supabase/tests/rls-doble-factor.test.ts falla sin ella).
create policy exige_doble_factor on public.apps_estudio as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
