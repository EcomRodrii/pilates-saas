-- Reservas que vende otra plataforma (ClassPass, Urban Sports Club, Wellhub).
--
-- Una reserva externa ocupa plaza en la clase, pero la persona NO es socia del
-- estudio: no tiene ficha, no paga en Tentare y no consume bono. Por eso va en
-- `reservas` con `socio_id = null`, el `origen` que la vendió y el nombre tal
-- como lo da la plataforma (o lo apunta recepción). Las vías propias (alumna,
-- pago, mostrador, plazas fijas, importador) quedan todas como 'TENTARE'.
--
-- Ninguna socia mínima en `socios`: contaría en el tope del plan, en el estado
-- de clienta y en las reglas por socia del Decision OS (campañas sin
-- consentimiento), y el 1-oct se decidió dejar fuera de `socios` a quien no es
-- clienta.
--
-- Lo que esta migración deja garantizado en la base de datos, no en TS:
--  · una externa no tiene socia, tiene nombre y NUNCA lleva bono rastreado. Lo
--    del bono es crítico: el barrido `reparar-bono-sin-decidir` coge las
--    reservas «rastreadas y sin decisión de bono», y con el default `true` de
--    la columna una externa se repararía y se le intentaría cobrar un bono;
--  · un id externo solo existe una vez por estudio y plataforma (idempotencia:
--    una plataforma que repite la llamada no crea dos reservas);
--  · solo el servidor (service_role, vía la RPC `reservar_plaza_externa`) crea
--    o transforma una externa. La política de UPDATE sigue abierta al panel
--    para pasar lista, y sin esto recepción podría convertir una externa en una
--    reserva de socia sin bono.

alter table public.reservas
  add column if not exists origen text not null default 'TENTARE',
  add column if not exists nombre_externo text,
  add column if not exists id_reserva_externa text,
  add column if not exists id_cliente_externo text;

alter table public.reservas
  add constraint reservas_origen_valido
    check (origen in ('TENTARE', 'CLASSPASS', 'URBAN_SPORTS_CLUB', 'WELLHUB'));

alter table public.reservas
  add constraint reservas_origen_coherente check (
    (origen = 'TENTARE'
       and nombre_externo is null and id_reserva_externa is null and id_cliente_externo is null)
    or
    (origen <> 'TENTARE'
       and socio_id is null
       and nombre_externo is not null and length(btrim(nombre_externo)) between 1 and 200
       and bono_consumo_rastreado is not true
       and bono_suscripcion_id is null)
  );

create unique index if not exists reservas_id_externo_unico
  on public.reservas (studio_id, origen, id_reserva_externa)
  where id_reserva_externa is not null;

-- Contar las externas de una clase (cupo por plataforma) bajo el candado de la
-- sesión, sin recorrer todas sus reservas.
create index if not exists reservas_sesion_origen_externo
  on public.reservas (sesion_id, origen)
  where origen <> 'TENTARE';

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
    if new.origen is distinct from 'TENTARE' then
      raise exception 'ORIGEN_SOLO_SERVIDOR';
    end if;
    return new;
  end if;
  if new.origen is distinct from old.origen
     or new.nombre_externo is distinct from old.nombre_externo
     or new.id_reserva_externa is distinct from old.id_reserva_externa
     or new.id_cliente_externo is distinct from old.id_cliente_externo
     or (old.origen <> 'TENTARE' and new.socio_id is distinct from old.socio_id) then
    raise exception 'ORIGEN_SOLO_SERVIDOR';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_congelar_origen_reserva on public.reservas;
create trigger trg_congelar_origen_reserva
  before insert or update on public.reservas
  for each row execute function public.congelar_origen_reserva();

-- Función de trigger: nadie la llama directamente.
revoke all on function public.congelar_origen_reserva() from public, anon, authenticated;
grant execute on function public.congelar_origen_reserva() to service_role, postgres;

do $$
begin
  if has_function_privilege('anon', 'public.congelar_origen_reserva()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.congelar_origen_reserva()', 'EXECUTE') then
    raise exception 'congelar_origen_reserva: permisos distintos de lo previsto';
  end if;
end $$;
