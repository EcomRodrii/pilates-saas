-- ─────────────────────────────────────────────────────────────────────────────
-- API pública: `Idempotency-Key` en los POST (lib/api-publica/idempotencia.ts).
--
-- Un programa que crea una clienta o una reserva y no recibe la respuesta no
-- sabe si se hizo; si reintenta a ciegas, duplica. Con la misma clave, el
-- reintento recibe la respuesta del primero sin ejecutar nada. Aquí se aparta
-- la clave antes de ejecutar (EN_CURSO) y se guarda la respuesta al terminar
-- (COMPLETADA). Un 5xx no se guarda: se borra la fila y el reintento vuelve a
-- ejecutarse.
--
-- La clave es de (estudio, credencial): `clave:<id>` para una clave de API,
-- `app:<id>` para una app OAuth (no su token, que cambia cada hora).
--
-- Se guarda 24 h: lo borra el cron horario de abajo. Por eso no va en
-- `purgar_estudio_vencido`: un estudio que se purga lleva 90 días sin uso y no
-- puede tener ninguna fila viva.
--
-- Solo de SERVIDOR, como el resto de tablas de la API: RLS sin políticas y sin
-- grants para anon/authenticated. `respuesta` puede llevar lo que devolvió el
-- POST (p. ej. el nombre y el email de la clienta creada): no sale de aquí y
-- desaparece en 24 h.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.api_idempotencia (
  studio_id     text not null references public.studios(id) on delete cascade,
  credencial    text not null check (credencial ~ '^(clave|app):.+$'),
  clave         text not null check (char_length(clave) between 1 and 255),
  ruta          text not null,
  huella        text not null check (huella ~ '^[0-9a-f]{64}$'),
  estado        text not null default 'EN_CURSO' check (estado in ('EN_CURSO', 'COMPLETADA')),
  status_http   integer,
  respuesta     jsonb,
  creado_en     timestamptz not null default now(),
  completado_en timestamptz,
  primary key (studio_id, credencial, clave)
);

create index if not exists api_idempotencia_creado_idx on public.api_idempotencia (creado_en);

alter table public.api_idempotencia enable row level security;
revoke all on table public.api_idempotencia from public, anon, authenticated;
grant all on table public.api_idempotencia to service_role;

-- Cada hora, lo de más de 24 h. Solo SQL: no llama a la app.
select cron.unschedule('api-idempotencia-purgar')
 where exists (select 1 from cron.job where jobname = 'api-idempotencia-purgar');
select cron.schedule(
  'api-idempotencia-purgar',
  '17 * * * *',
  $$delete from public.api_idempotencia where creado_en < now() - interval '24 hours'$$
);

do $$
begin
  if has_table_privilege('authenticated', 'public.api_idempotencia', 'SELECT')
     or has_table_privilege('anon', 'public.api_idempotencia', 'SELECT')
     or has_table_privilege('authenticated', 'public.api_idempotencia', 'INSERT') then
    raise exception 'api_idempotencia no puede tocarse desde el cliente';
  end if;
end $$;
