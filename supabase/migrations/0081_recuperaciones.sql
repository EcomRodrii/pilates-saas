-- F2 · Paso 5a — Recuperaciones caducables (informe B2.3).
--
-- Crédito de "clase a recuperar" que la dueña concede a una socia (dueña-first: si
-- solo naciera en la app, el sistema se vacía en 2 semanas). Caduca según la
-- política del estudio (D2 por defecto FIN_MES_SIGUIENTE). Tope de vivas por socia
-- = 4 (D3). El CANJE en la reserva es el Paso 5b; esto es el modelo + la concesión.
--
-- Caducidad dinámica: una recuperación está "viva" si estado='DISPONIBLE' y
-- caduca_el >= hoy. No hace falta cron para marcarlas CADUCADA (se trata por fecha).

create table if not exists public.recuperaciones (
  id                 text primary key,
  studio_id          text not null references public.studios(id),
  socio_id           text not null references public.socios(id),
  origen_reserva_id  text,                 -- reserva de plaza fija que la generó (null = concesión manual)
  motivo             text,
  caduca_el          date not null,
  estado             text not null default 'DISPONIBLE',  -- DISPONIBLE / USADA / CADUCADA / ANULADA
  usada_en_reserva_id text,
  creada_en          timestamptz not null default now()
);

alter table public.recuperaciones enable row level security;

create policy admin_recuperaciones on public.recuperaciones
  for all to authenticated
  using (studio_id = current_studio_id())
  with check (studio_id = current_studio_id());

create index if not exists idx_recuperaciones_socio
  on public.recuperaciones (socio_id, estado, caduca_el);

-- Política de caducidad por estudio (columnas en studios, como el resto de política).
alter table public.studios
  add column if not exists recuperacion_caducidad_tipo text not null default 'FIN_MES_SIGUIENTE',  -- DIAS | FIN_MES | FIN_MES_SIGUIENTE
  add column if not exists recuperacion_caducidad_dias integer;                                     -- solo si tipo='DIAS'

-- Fecha de caducidad a partir de una fecha base y la política.
create or replace function public.calcular_caduca_recuperacion(p_desde date, p_tipo text, p_dias int)
  returns date
  language sql immutable
as $$
  select case p_tipo
    when 'DIAS'             then p_desde + coalesce(p_dias, 30)
    when 'FIN_MES'          then (date_trunc('month', p_desde) + interval '1 month'  - interval '1 day')::date
    else /* FIN_MES_SIGUIENTE */ (date_trunc('month', p_desde) + interval '2 month' - interval '1 day')::date
  end;
$$;

-- Concede una recuperación respetando el tope de vivas por socia (4). Devuelve
-- 'CREADA' o 'TOPE' (si ya tiene 4 vivas). La caducidad sale de la política del estudio.
create or replace function public.crear_recuperacion(
  p_id text, p_studio_id text, p_socio_id text, p_origen_reserva_id text, p_motivo text
) returns text
  language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_tipo text;
  v_dias int;
  v_vivas int;
  v_caduca date;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  select recuperacion_caducidad_tipo, recuperacion_caducidad_dias into v_tipo, v_dias
    from studios where id = p_studio_id;

  select count(*) into v_vivas
    from recuperaciones
   where socio_id = p_socio_id and studio_id = p_studio_id
     and estado = 'DISPONIBLE' and caduca_el >= current_date;
  if v_vivas >= 4 then
    return 'TOPE';
  end if;

  v_caduca := calcular_caduca_recuperacion(current_date, coalesce(v_tipo, 'FIN_MES_SIGUIENTE'), v_dias);

  insert into recuperaciones (id, studio_id, socio_id, origen_reserva_id, motivo, caduca_el, estado)
    values (p_id, p_studio_id, p_socio_id, p_origen_reserva_id, p_motivo, v_caduca, 'DISPONIBLE');
  return 'CREADA';
end;
$$;

revoke execute on function public.crear_recuperacion(text, text, text, text, text) from anon, public;
grant  execute on function public.crear_recuperacion(text, text, text, text, text) to authenticated, service_role;
