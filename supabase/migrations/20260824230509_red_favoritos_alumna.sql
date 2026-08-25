-- Tentare Network F3 — favoritos bidireccionales de la ALUMNA (estudio o
-- instructora que ella marca). Tabla nueva y separada de `red_favoritos`
-- (esa es unidireccional estudio→instructora, y el ESTUDIO sí puede leerla:
-- no se toca ni se reutiliza aquí). Mismo criterio que F0 con `red_perfiles`
-- vs alumna: RLS es por fila, no por columna.
--
-- ⚠️ Riesgo de seguridad explícito: esta tabla NUNCA debe ser legible por el
-- estudio favoriteado ni por la instructora favoriteada — a diferencia de
-- `red_favoritos`. Solo la propia alumna (auth_user_id = auth.uid()) puede
-- leer/escribir su lista. Verificado en vivo con execute_sql+ROLLBACK: otra
-- alumna y un tercero no ven ni pueden tocar filas ajenas.
create table public.red_favoritos_alumna (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('estudio', 'instructora')),
  studio_id text references public.studios(id) on delete cascade,
  perfil_id text references public.red_perfiles(id) on delete cascade,
  creado_en timestamptz not null default now(),
  check ((tipo = 'estudio') = (studio_id is not null)),
  check ((tipo = 'instructora') = (perfil_id is not null)),
  unique (auth_user_id, tipo, studio_id, perfil_id)
);

-- Cubre las lecturas típicas (WHERE auth_user_id = ? AND tipo = ?); el
-- índice del UNIQUE ya cubriría esto también, pero uno explícito documenta
-- la intención y no depende de que el UNIQUE conserve ese orden de columnas.
create index idx_red_favoritos_alumna_auth_user_tipo
  on public.red_favoritos_alumna (auth_user_id, tipo);

alter table public.red_favoritos_alumna enable row level security;

-- (select auth.uid()) desde el principio: ya hace falta corregir auth_rls_initplan
-- dos veces en fases anteriores por no hacerlo así a la primera.
create policy red_favoritos_alumna_propio on public.red_favoritos_alumna
  for all to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));
