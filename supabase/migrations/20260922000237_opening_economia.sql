-- ─────────────────────────────────────────────────────────────────────────────
-- Opening OS · simulador económico («¿Cuánto necesito aguantar?»).
--
-- Las dos cifras que solo sabe la propietaria: gastos fijos del mes (alquiler y
-- demás, en una sola cifra) y el colchón con el que abre. Todo lo demás
-- (precios, IVA, tarifas del equipo, horario) se lee de donde ya vive; aquí no
-- se copia nada.
--
-- Tabla aparte y NO columnas de opening_config: la RLS de opening_config la
-- abre a MANAGER, y el dinero del estudio es solo de la propietaria (MANAGER no
-- ve finanzas, puedeVerFinanzas). NULL = aún no lo ha dicho: se pide, no se
-- rellena con un defecto.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.opening_economia (
  studio_id text primary key references public.studios(id) on delete cascade,
  fijos_mes_eur numeric(12,2) check (fijos_mes_eur is null or fijos_mes_eur >= 0),
  colchon_eur numeric(12,2) check (colchon_eur is null or colchon_eur >= 0),
  updated_at timestamptz not null default now()
);
alter table public.opening_economia enable row level security;

create policy propietaria_opening_economia on public.opening_economia
  for all to authenticated
  using (studio_id = public.current_studio_id() and public.current_rol() = 'PROPIETARIO')
  with check (studio_id = public.current_studio_id() and public.current_rol() = 'PROPIETARIO');
