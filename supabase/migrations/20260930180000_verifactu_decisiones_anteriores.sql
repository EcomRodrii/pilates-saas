-- Veri*Factu — la decisión sobre las facturas anteriores a la activación.
--
-- La barrera (#2402) impide activar un estudio con registros generados antes de
-- su primera activación que la AEAT no tiene, «hasta que haya criterio escrito».
-- Criterio del fiscalista (30-sep-2026), provisional en su calificación:
--   · son anteriores al inicio efectivo de VERI*FACTU: NO se remiten
--     retroactivamente, «salvo que el criterio definitivo de la AEAT determine
--     otra cosa»;
--   · la cadena CONTINÚA (Orden HAC/1177/2024, art. 7): el primer registro
--     posterior encadena con el último de ellos; nunca una cadena nueva;
--   · no se borra ni se modifica nada, y no se generan ahora XML que nunca se
--     generaron.
--
-- Esta tabla guarda esa decisión, por estudio. Los registros NO se tocan: siguen
-- como estaban (inmutables, con su huella), y la decisión dice cuáles quedan
-- fuera de la remisión (de la posición 1 a `hasta_seq`) y por qué. Solo se
-- añaden filas: la vigente es la última del estudio, y deshacerla es otra fila
-- ('DESHECHA'), así que el historial de decisiones queda entero.
--
-- ⚠️ Solo ANTES de la primera activación del estudio. Después, sus registros
-- posteriores ya encadenan con esos y se han remitido: cambiar de criterio ahí
-- (si la AEAT dijera que hay que remitirlos) es un procedimiento aparte, no
-- deshacer una fila. Lo hace cumplir la base, no la pantalla.

create table if not exists public.verifactu_decisiones_anteriores (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete restrict,
  decision text not null check (decision in ('NO_REMITIR', 'DESHECHA')),
  -- Cubre las posiciones 1..hasta_seq de la cadena del estudio (todas anteriores
  -- a la activación). Una factura posterior a la decisión no queda cubierta sola:
  -- pide otra decisión.
  hasta_seq bigint not null check (hasta_seq > 0),
  motivo text not null check (length(btrim(motivo)) between 10 and 2000),
  -- Referencia al criterio escrito en que se apoya (quién y cuándo).
  criterio text not null check (length(btrim(criterio)) between 5 and 500),
  -- Lo que había al decidir, calculado en el servidor: cuántas, qué posiciones,
  -- fechas de generación, que el envío nunca estuvo activado, si había alguna
  -- declaración responsable suscrita cuando se generaron.
  evidencia jsonb not null,
  decidido_por uuid not null,
  creado_en timestamptz not null default now()
);

create index if not exists idx_verifactu_decisiones_anteriores_estudio
  on public.verifactu_decisiones_anteriores (studio_id, creado_en desc);

comment on table public.verifactu_decisiones_anteriores is
  'Decisión, por estudio, de no remitir las facturas anteriores a su primera activación de VERI*FACTU (criterio del fiscalista, 30-sep-2026). Solo añadir; la vigente es la última. Solo antes de activar.';

-- Solo añadir, y solo antes de la primera activación.
create or replace function public.verifactu_decisiones_anteriores_guardia()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'VERIFACTU_DECISION_INMUTABLE: las decisiones no se modifican ni se borran; se añade otra';
  end if;
  if exists (
    select 1 from verifactu_estudios v
     where v.studio_id = new.studio_id and v.activado_produccion_en is not null
  ) then
    raise exception 'VERIFACTU_DECISION_TRAS_ACTIVACION: el estudio ya ha activado VERI*FACTU; esto se decide antes de activar'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_verifactu_decisiones_anteriores_guardia on public.verifactu_decisiones_anteriores;
create trigger trg_verifactu_decisiones_anteriores_guardia
  before insert or update or delete on public.verifactu_decisiones_anteriores
  for each row execute function public.verifactu_decisiones_anteriores_guardia();

-- Sin lectura ni escritura desde el cliente: la decide Tentare en /interno con
-- service-role. Y ni service-role borra o reescribe (el trigger lo impide igual).
alter table public.verifactu_decisiones_anteriores enable row level security;
revoke all on public.verifactu_decisiones_anteriores from public, anon, authenticated;
grant select, insert on public.verifactu_decisiones_anteriores to service_role;
revoke update, delete, truncate on public.verifactu_decisiones_anteriores from service_role;

revoke execute on function public.verifactu_decisiones_anteriores_guardia() from public, anon, authenticated;

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
begin
  if has_table_privilege('anon', 'public.verifactu_decisiones_anteriores', 'SELECT')
     or has_table_privilege('authenticated', 'public.verifactu_decisiones_anteriores', 'SELECT')
     or has_table_privilege('authenticated', 'public.verifactu_decisiones_anteriores', 'INSERT') then
    raise exception 'verifactu_decisiones_anteriores: el cliente tiene acceso';
  end if;
  if has_table_privilege('service_role', 'public.verifactu_decisiones_anteriores', 'DELETE')
     or has_table_privilege('service_role', 'public.verifactu_decisiones_anteriores', 'UPDATE') then
    raise exception 'verifactu_decisiones_anteriores: service_role puede borrar o reescribir';
  end if;
  if has_function_privilege('anon', 'public.verifactu_decisiones_anteriores_guardia()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.verifactu_decisiones_anteriores_guardia()', 'EXECUTE') then
    raise exception 'la guardia es ejecutable desde el cliente';
  end if;
end $$;
