-- F2 · Paso 1 — Bonos con validez, límite semanal y congelación (informe B2.1/B2.8).
--
-- El plan (planes_tarifa) define la POLÍTICA; la suscripción materializa las
-- FECHAS. "Caducidad por instancia comprada, no por plan": al comprar un bono,
-- fecha_fin := fecha_inicio + validez_dias (lo hace la app; aquí solo el dato).
--
-- Congelación: NO es un concepto nuevo. Reutiliza suscripciones.estado='PAUSADA'
-- (I7) — mientras está PAUSADA, tieneEntitlementActivo ya devuelve false, así que
-- reservar queda bloqueado gratis. Lo ÚNICO que añade F2 es que los días
-- congelados no consuman la validez del bono: al descongelar se empuja fecha_fin.
-- La tabla `congelaciones` guarda la ventana (historial) y los días aplicados.

-- 1) Política del plan ────────────────────────────────────────────────────────
alter table public.planes_tarifa
  add column if not exists validez_dias   integer,  -- BONO/PUNTUAL: caduca a los N días de la compra (null = sin caducidad)
  add column if not exists limite_semanal integer;   -- máx. sesiones/semana ISO (null = sin tope). Se aplica en el canje (Paso 3, reservar_plaza).

-- 2) Ventana de congelación ───────────────────────────────────────────────────
create table if not exists public.congelaciones (
  id             text primary key,
  studio_id      text not null references public.studios(id),
  suscripcion_id text not null references public.suscripciones(id),
  desde          date not null,
  hasta          date,             -- null = congelación abierta (aún activa)
  dias_aplicados integer,          -- se fija al descongelar: días empujados a fecha_fin
  motivo         text,
  creada_en      timestamptz not null default now()
);

alter table public.congelaciones enable row level security;

-- Mismo patrón que suscripciones (policy admin_suscripciones): la propietaria/
-- staff gestiona las de su propio estudio; aislada por current_studio_id().
create policy admin_congelaciones on public.congelaciones
  for all to authenticated
  using (studio_id = current_studio_id())
  with check (studio_id = current_studio_id());

-- "¿Congelación abierta de esta suscripción?" + listado por suscripción.
create index if not exists idx_congelaciones_suscripcion
  on public.congelaciones (suscripcion_id, desde);

-- 3) Congelar (atómico: ventana + PAUSADA) ────────────────────────────────────
create or replace function public.congelar_suscripcion(
  p_id text, p_suscripcion_id text, p_studio_id text, p_motivo text
) returns void
  language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  -- Aislamiento por negocio en llamadas autenticadas (panel); service-role se salta.
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  -- Sin doble congelación abierta.
  if exists (select 1 from congelaciones
             where suscripcion_id = p_suscripcion_id and studio_id = p_studio_id and hasta is null) then
    return;
  end if;

  insert into congelaciones (id, studio_id, suscripcion_id, desde, motivo)
    values (p_id, p_studio_id, p_suscripcion_id, current_date, p_motivo);

  update suscripciones set estado = 'PAUSADA'
    where id = p_suscripcion_id and studio_id = p_studio_id and estado = 'ACTIVA';
end;
$$;

-- 4) Descongelar (atómico: cierra ventana + empuja fecha_fin + ACTIVA) ─────────
-- Devuelve la nueva fecha_fin para que la app repinte el estado sin recargar.
create or replace function public.descongelar_suscripcion(
  p_suscripcion_id text, p_studio_id text
) returns date
  language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_dias int;
  v_fin  date;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  update congelaciones
     set hasta = current_date, dias_aplicados = (current_date - desde)
   where suscripcion_id = p_suscripcion_id and studio_id = p_studio_id and hasta is null
   returning dias_aplicados into v_dias;

  update suscripciones
     set estado = 'ACTIVA',
         -- los días congelados no cuentan contra la validez del bono
         fecha_fin = case when fecha_fin is not null and v_dias is not null
                          then fecha_fin + v_dias else fecha_fin end
   where id = p_suscripcion_id and studio_id = p_studio_id
   returning fecha_fin into v_fin;

  return v_fin;
end;
$$;

-- No públicas: solo panel autenticado / service-role (mismo criterio que B1).
revoke execute on function public.congelar_suscripcion(text, text, text, text)  from anon, public;
revoke execute on function public.descongelar_suscripcion(text, text)           from anon, public;
grant  execute on function public.congelar_suscripcion(text, text, text, text)  to authenticated, service_role;
grant  execute on function public.descongelar_suscripcion(text, text)           to authenticated, service_role;
