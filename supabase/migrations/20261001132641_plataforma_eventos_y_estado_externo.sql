-- Conexión por API con las plataformas (primero Urban Sports Club).
--
-- 1) `plataforma_eventos`: qué clase de Tentare es cada evento de la plataforma.
--    USC reserva contra SU id de evento (`event_id`), que les devolvemos al
--    crearlo; para saber a qué sesión va la plaza hace falta este mapa. Uno a uno
--    en los dos sentidos: una sesión es un evento por plataforma, y un id de
--    evento solo existe una vez por plataforma.
--    Solo lo toca el servidor (crear eventos, Instant Booking, webhooks): RLS
--    activa y sin políticas para el navegador.
--
-- 2) `reservas.estado_externo` / `estado_externo_en`: el último estado que la
--    plataforma nos ha contado de una reserva (Cancelled, CheckedIn, NoShow,
--    LateCancellation) y cuándo lo cambió ELLA (`ModifiedDate`). USC no
--    garantiza el orden de sus webhooks: solo se aplica uno si es más reciente
--    que el último aplicado.

create table if not exists public.plataforma_eventos (
  id text primary key default ('pev-' || gen_random_uuid()::text),
  studio_id text not null references public.studios(id) on delete cascade,
  plataforma text not null check (plataforma in ('CLASSPASS', 'URBAN_SPORTS_CLUB', 'WELLHUB')),
  sesion_id text not null references public.sesiones(id) on delete cascade,
  evento_externo_id text not null,
  -- PENDIENTE (por crear allí) · SINCRONIZADO · ERROR · CANCELADO
  estado_sync text not null default 'PENDIENTE'
    check (estado_sync in ('PENDIENTE', 'SINCRONIZADO', 'ERROR', 'CANCELADO')),
  error text,
  sincronizado_en timestamptz,
  creado_en timestamptz not null default now()
);

create unique index if not exists plataforma_eventos_sesion on public.plataforma_eventos (plataforma, sesion_id);
create unique index if not exists plataforma_eventos_externo on public.plataforma_eventos (plataforma, evento_externo_id);
create index if not exists plataforma_eventos_studio on public.plataforma_eventos (studio_id);

alter table public.plataforma_eventos enable row level security;
revoke all on public.plataforma_eventos from anon, authenticated;
grant all on public.plataforma_eventos to service_role;

alter table public.reservas
  add column if not exists estado_externo text,
  add column if not exists estado_externo_en timestamptz;

alter table public.reservas
  add constraint reservas_estado_externo_valido check (
    estado_externo is null
    or estado_externo in ('Booked', 'Cancelled', 'LateCancellation', 'CheckedIn', 'NoShow')
  );

-- El estado que cuenta la plataforma solo lo escribe el servidor (sus
-- webhooks), igual que el resto de campos de origen: se amplía el trigger de
-- 20261001115953 con las dos columnas nuevas. Misma firma, mismos permisos.
create or replace function public.congelar_origen_reserva()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if public.es_llamada_servicio() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.origen is distinct from 'TENTARE'
       or new.estado_externo is not null or new.estado_externo_en is not null then
      raise exception 'ORIGEN_SOLO_SERVIDOR';
    end if;
    return new;
  end if;
  if new.origen is distinct from old.origen
     or new.nombre_externo is distinct from old.nombre_externo
     or new.id_reserva_externa is distinct from old.id_reserva_externa
     or new.id_cliente_externo is distinct from old.id_cliente_externo
     or new.estado_externo is distinct from old.estado_externo
     or new.estado_externo_en is distinct from old.estado_externo_en
     or (old.origen <> 'TENTARE' and new.socio_id is distinct from old.socio_id) then
    raise exception 'ORIGEN_SOLO_SERVIDOR';
  end if;
  return new;
end;
$function$;

revoke all on function public.congelar_origen_reserva() from public, anon, authenticated;
grant execute on function public.congelar_origen_reserva() to service_role, postgres;

do $$
begin
  if has_function_privilege('anon', 'public.congelar_origen_reserva()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.congelar_origen_reserva()', 'EXECUTE') then
    raise exception 'congelar_origen_reserva: permisos distintos de lo previsto';
  end if;
  if has_table_privilege('authenticated', 'public.plataforma_eventos', 'SELECT')
     or has_table_privilege('anon', 'public.plataforma_eventos', 'SELECT') then
    raise exception 'plataforma_eventos: el navegador no debe leerla';
  end if;
end $$;
