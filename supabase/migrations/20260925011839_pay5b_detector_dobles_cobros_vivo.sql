-- PAY-5 (auditoría 24-sep): detector de dobles cobros, VIVO.
--
-- La migración 20260919080000_pay5_detector_dobles_cobros figura como aplicada
-- en el registro de producción pero NUNCA creó nada (ni la tabla ni la función):
-- el mismo fallo que dejó a `cobros_intentos` sin existir. Su fichero pasa a ser
-- un comentario y este es el que de verdad lo crea.
--
-- Qué detecta: un mismo recibo con MÁS DE UN PaymentIntent que tomó dinero. En
-- `cobros_intentos` eso son los desenlaces 'cobrado' (el cargo que cerró el
-- recibo) y 'pendiente' (un cargo real que NO lo cerró: otro cargo, recibo ya
-- cobrado o anulado). 'fallido' y 'reintentando' NO mueven dinero y no cuentan:
-- una socia con dos rechazos y un cobro no es un doble cobro.
--
-- Cómo avisa: pg_cron mira cada 30 min y SOLO llama a la ruta cuando hay
-- detecciones sin notificar (mismo patrón "Bucket A" que vigilar_jobs_http:
-- coste cero cuando no hay nada). La ruta avisa a Sentry y marca `notificado_en`;
-- si el aviso falla, la fila sigue sin marcar y se reintenta en la pasada
-- siguiente.

create table if not exists public.dobles_cobros_detectados (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  -- Como `cobros_intentos.recibo_id` (D-5): el cargo es un hecho de Stripe, no
  -- del recibo, y sigue siendo evidencia si el recibo se borra.
  recibo_id text references public.recibos(id) on delete set null,
  payment_intent_ids text[] not null,
  tipo text not null check (tipo in ('multiple_intent_ids')),
  estado text not null default 'DETECTADA'
    check (estado in ('DETECTADA', 'OMITIDA_FALSO_POSITIVO', 'OMITIDA_AUTORIZADO', 'RESUELTO')),
  notas text,
  detectado_en timestamptz not null default now(),
  notificado_en timestamptz,
  resuelto_en timestamptz,
  -- Un recibo se detecta UNA vez por tipo: es lo que hace idempotente al cron.
  constraint dobles_cobros_recibo_tipo_unq unique (recibo_id, tipo)
);

create index if not exists dobles_cobros_sin_notificar_idx
  on public.dobles_cobros_detectados (detectado_en) where notificado_en is null;

-- Solo servidor: RLS activada SIN policies y sin grants a los roles de cliente.
-- (No se abre lectura por estudio: una policy que solo pida studio_id vuelve a
-- abrírsela a INSTRUCTOR, y hoy esto lo lee el operador, no el panel.)
alter table public.dobles_cobros_detectados enable row level security;
revoke all on table public.dobles_cobros_detectados from anon, authenticated;

create or replace function public.vigilar_dobles_cobros()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.dobles_cobros_detectados (studio_id, recibo_id, payment_intent_ids, tipo, notas)
  select d.studio_id, d.recibo_id, d.intents, 'multiple_intent_ids',
         'Detectado: ' || cardinality(d.intents) || ' cargos distintos que tomaron dinero sobre el mismo recibo'
  from (
    select ci.studio_id, ci.recibo_id,
           array_agg(distinct ci.payment_intent_id order by ci.payment_intent_id) as intents
    from public.cobros_intentos ci
    where ci.recibo_id is not null
      and ci.desenlace in ('cobrado', 'pendiente')
      and ci.creado_en > now() - interval '60 days'
    group by ci.studio_id, ci.recibo_id
    having count(distinct ci.payment_intent_id) > 1
  ) d
  on conflict (recibo_id, tipo) do nothing;

  if exists (select 1 from public.dobles_cobros_detectados where notificado_en is null) then
    perform net.http_post(
      url := 'https://www.tentare.app/api/cron/dobles-cobros',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'supabase_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  end if;
end;
$function$;

-- Solo la ejecuta pg_cron (rol postgres). `pg_default_acl` da EXECUTE directo a
-- anon/authenticated en toda función nueva: hay que nombrarlos.
revoke all on function public.vigilar_dobles_cobros() from public, anon, authenticated;
grant execute on function public.vigilar_dobles_cobros() to postgres, service_role;

select cron.schedule(
  'vigilar-dobles-cobros',
  '*/30 * * * *',
  $$select public.vigilar_dobles_cobros();$$
);
