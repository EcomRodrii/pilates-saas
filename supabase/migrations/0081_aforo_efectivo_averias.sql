-- F2 · Paso 2 — Máquina como recurso: avería + aforo_efectivo() (informe B2.7).
--
-- El aforo deja de ser un entero fijo. aforo_efectivo(sesion) = aforo_maximo − nº
-- de máquinas averiadas de esa sala que solapan la sesión. Sin averías,
-- aforo_efectivo ≡ aforo_maximo (100% compatible). reservar_plaza pasa a usarlo
-- como única fuente de verdad de capacidad → una avería reduce plazas de verdad.
--
-- Modelo robusto para TODOS los estudios: la avería se cuelga de la SALA (spot
-- opcional). Un estudio sin mapa de spots dice "1 máquina de la Sala Reformer
-- averiada del 23 al 30" y el aforo baja 1; uno con spots la fija a un reformer.

-- 1) Bloqueos de máquina (avería / mantenimiento) ──────────────────────────────
create table if not exists public.bloqueos_maquina (
  id         text primary key,
  studio_id  text not null references public.studios(id),
  sala_id    text not null references public.salas(id),
  spot_id    text references public.spots(id),   -- opcional: reformer concreto
  desde      timestamptz not null,
  hasta      timestamptz,                         -- null = avería abierta (sin fecha de arreglo)
  motivo     text,
  creado_en  timestamptz not null default now()
);

alter table public.bloqueos_maquina enable row level security;

create policy admin_bloqueos_maquina on public.bloqueos_maquina
  for all to authenticated
  using (studio_id = current_studio_id())
  with check (studio_id = current_studio_id());

create index if not exists idx_bloqueos_maquina_sala
  on public.bloqueos_maquina (sala_id, desde);

-- 2) aforo_efectivo() ──────────────────────────────────────────────────────────
-- STABLE, sin SECURITY DEFINER (lo llama reservar_plaza, que ya corre como definer;
-- si lo llama la app corre bajo RLS del invocador). aforo_maximo es NOT NULL, así
-- que sin averías devuelve exactamente aforo_maximo.
create or replace function public.aforo_efectivo(p_sesion_id text)
  returns integer
  language sql stable
  set search_path to 'public', 'pg_temp'
as $$
  select greatest(0, s.aforo_maximo - (
    select count(*)::int
      from bloqueos_maquina b
     where b.sala_id = s.sala_id
       and tstzrange(b.desde, coalesce(b.hasta, 'infinity')) && tstzrange(s.inicio, s.fin)
  ))
  from sesiones s
  where s.id = p_sesion_id;
$$;

-- 3) reservar_plaza usa aforo_efectivo ─────────────────────────────────────────
-- Idéntica a la versión anterior salvo: el lock de la sesión pasa a PERFORM (solo
-- serializa) y el aforo se toma de aforo_efectivo() en vez de aforo_maximo directo.
create or replace function public.reservar_plaza(p_studio_id text, p_sesion_id text, p_socio_id text, p_reserva_id text)
  returns table(estado text, posicion_espera integer)
  language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_aforo int;
  v_ocupadas int;
  v_espera int;
  v_estado text;
  v_pos int;
begin
  if auth.uid() is not null and p_studio_id is distinct from current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  -- Serializa las reservas concurrentes de ESTA sesión (lock de fila).
  perform 1 from sesiones where id = p_sesion_id and studio_id = p_studio_id for update;
  if not found then
    raise exception 'SESION_NO_ENCONTRADA';
  end if;

  -- Aforo efectivo = aforo_maximo − máquinas averiadas que solapan (F2 B2.7).
  v_aforo := aforo_efectivo(p_sesion_id);

  if exists (
    select 1 from reservas
    where sesion_id = p_sesion_id and socio_id = p_socio_id
      and estado in ('CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA')
  ) then
    raise exception 'YA_RESERVADA';
  end if;

  select count(*) into v_ocupadas
    from reservas
    where sesion_id = p_sesion_id and estado in ('CONFIRMADA', 'ASISTIDA');

  if v_aforo is null or v_ocupadas < v_aforo then
    v_estado := 'CONFIRMADA';
    v_pos := null;
  else
    select count(*) into v_espera
      from reservas where sesion_id = p_sesion_id and estado = 'LISTA_ESPERA';
    v_estado := 'LISTA_ESPERA';
    v_pos := v_espera + 1;
  end if;

  insert into reservas (id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, check_in_en, creado_en)
    values (p_reserva_id, p_studio_id, p_sesion_id, p_socio_id, v_estado, null, v_pos, null, now());

  return query select v_estado, v_pos;
end;
$function$;