-- 20260930013000 · TENTARE — la declaración responsable del SIF, por versión y conservada
--
-- RD 1007/2023, art. 13: la persona o entidad productora certifica, mediante una
-- declaración responsable, que el sistema cumple; debe constar por escrito y de
-- modo visible en el propio sistema EN CADA UNA DE SUS VERSIONES, y el productor
-- «deberá guardar y conservar las declaraciones responsables de todas las
-- versiones». Contenido y orden: Orden HAC/1177/2024, art. 15.
--
-- Esta tabla es ese archivo: una fila por declaración suscrita, con el texto
-- EXACTO que se suscribió y su huella. La suscribe el productor desde
-- /interno/verifactu (solo `admin.full`). La página del panel enseña la vigente
-- para la versión actual del software (`lib/verifactu/sif.ts`, SIF.version); sin
-- una suscrita para esa versión, el cron no transmite nada.
--
-- Solo se añaden filas: una declaración suscrita no se edita ni se borra (si
-- cambia algo, se suscribe otra). Lo garantizan los grants Y un trigger, porque
-- service_role recibe todos los privilegios por defecto en este proyecto.
--
-- ⚠️ Lleva datos personales del productor (nombre, NIF, dirección): sin grants a
-- anon/authenticated; se sirve por /api/verifactu/declaracion-responsable con
-- sesión del panel.

create table if not exists public.verifactu_declaraciones_responsables (
  id uuid primary key default gen_random_uuid(),
  version_sif text not null,
  id_sif text not null,
  texto text not null,
  texto_sha256 text not null check (texto_sha256 ~ '^[0-9a-f]{64}$'),
  productor_nombre text not null,
  productor_nif text not null check (length(productor_nif) = 9),
  productor_direccion text not null,
  fecha_suscripcion text not null check (fecha_suscripcion ~ '^\d{2}-\d{2}-\d{4}$'),
  lugar_suscripcion text not null,
  suscrita_por uuid,
  suscrita_en timestamptz not null default now(),
  constraint verifactu_dr_unica_por_texto unique (version_sif, texto_sha256)
);

create index if not exists idx_verifactu_dr_version on public.verifactu_declaraciones_responsables (version_sif, suscrita_en desc);

comment on table public.verifactu_declaraciones_responsables is
  'Declaraciones responsables del SIF suscritas por el productor (RD 1007/2023 art. 13; Orden HAC/1177/2024 art. 15). Solo se añaden filas. Una por texto y versión.';

alter table public.verifactu_declaraciones_responsables enable row level security;
revoke all on public.verifactu_declaraciones_responsables from public, anon, authenticated;
grant select, insert on public.verifactu_declaraciones_responsables to service_role;
revoke update, delete, truncate on public.verifactu_declaraciones_responsables from service_role;

create or replace function public.verifactu_solo_anadir()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'SOLO_ANADIR: % es un registro que no se modifica ni se borra (%)', tg_table_name, tg_op;
end;
$$;

revoke all on function public.verifactu_solo_anadir() from public, anon, authenticated;

drop trigger if exists trg_verifactu_dr_solo_anadir on public.verifactu_declaraciones_responsables;
create trigger trg_verifactu_dr_solo_anadir
  before update or delete on public.verifactu_declaraciones_responsables
  for each row execute function public.verifactu_solo_anadir();
