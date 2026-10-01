-- ─────────────────────────────────────────────────────────────────────────────
-- Altas de estudio sin terminar: dónde se queda cada una, en el SERVIDOR.
--
-- Hasta aquí el único registro de por dónde iba un alta era PostHog, que no
-- carga con bloqueadores ni sin consentimiento, y `user_metadata.pending_studio`,
-- que gotrue BORRA en cuanto `/login` la limpia (un `null` en `updateUser`
-- elimina la clave). Así no se podía contestar «¿en qué paso se quedó esta
-- persona?» ni «¿terminó después del aviso?».
--
-- La SEÑAL de que alguien empezó un alta de estudio es explícita, nunca por
-- exclusión: un usuario de Auth sin estudio puede ser una socia del portal, una
-- instructora invitada o una cuenta de Network. Solo entra aquí:
--   · `registro`  → la cuenta se creó desde /crear-estudio: es el único sitio
--     que manda `pending_studio` en el `signUp`. Lo apunta un TRIGGER sobre
--     auth.users, así que vale aunque el navegador no vuelva a hablar con
--     nosotros (cierra la pestaña antes de escribir el código).
--   · `con_sesion` → alguien con la sesión ya abierta (entró con Google) y sin
--     estudio llega a /crear-estudio. Lo apunta `/api/alta/progreso` tras
--     comprobar en servidor que no tiene estudio ni ficha de equipo.
--
-- Lo que ya vive en otra tabla NO se copia aquí: la confirmación del email es
-- `auth.users.email_confirmed_at` y el estudio creado es
-- `studios.owner_auth_user_id`. `altas_estudio_detalle()` los cruza al leer.
-- El paso se DERIVA en `lib/alta/abandono.ts` (`pasoDeAlta`), no se guarda.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.altas_estudio (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  origen text not null check (origen in ('registro', 'con_sesion')),
  -- El nombre que escribió en el paso 1: es con lo que se le habla en el correo.
  estudio_nombre text check (estudio_nombre is null or char_length(estudio_nombre) <= 120),
  iniciada_en timestamptz not null default now(),
  -- Con sesión: pasó del paso 1 (escribió el nombre) al de elegir plan.
  plan_en timestamptz,
  -- Intentó montar el estudio y `dbCreateStudio` devolvió null.
  error_estudio_en timestamptz,
  error_estudio_intentos integer not null default 0,
  -- El recordatorio de las 24 h. `reclamado` es el cerrojo (compare-and-set
  -- antes de llamar a Resend); `enviado` solo se escribe si Resend dijo que sí.
  recordatorio_reclamado_en timestamptz,
  recordatorio_enviado_en timestamptz,
  recordatorio_paso text,
  recordatorio_intentos integer not null default 0,
  recordatorio_error text,
  -- Por qué no se le manda nunca (ya terminó, es del equipo, fuera de plazo…).
  -- Con valor, el cron deja de mirarla.
  recordatorio_descartado text,
  actualizado_en timestamptz not null default now()
);

comment on table public.altas_estudio is
  'Una fila por cuenta que empezó un alta de estudio (/crear-estudio). Solo service_role. Ver lib/alta/abandono.ts.';

-- El cron pregunta por las pendientes cada hora: índice sobre lo que filtra.
create index if not exists altas_estudio_pendientes_idx
  on public.altas_estudio (iniciada_en)
  where recordatorio_enviado_en is null and recordatorio_reclamado_en is null and recordatorio_descartado is null;

-- RLS como cerradura real: activada y SIN políticas → ni anon ni authenticated
-- leen ni escriben nada. Además, fuera los grants de tabla que `pg_default_acl`
-- da por defecto a los roles del cliente.
alter table public.altas_estudio enable row level security;
revoke all on table public.altas_estudio from public, anon, authenticated;
grant select, insert, update, delete on table public.altas_estudio to service_role;

-- ── Trigger: la cuenta nace desde /crear-estudio ───────────────────────────
-- ⚠️ Primer trigger del repo sobre auth.users. Un error aquí NO puede tumbar un
-- registro: todo va dentro de un bloque con EXCEPTION que lo convierte en un
-- WARNING. Perder una fila de diagnóstico es aceptable; perder un alta, no.
create or replace function public.altas_estudio_registrar_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if jsonb_typeof(new.raw_user_meta_data -> 'pending_studio') = 'object' then
      insert into public.altas_estudio (auth_user_id, origen, estudio_nombre, iniciada_en)
      values (
        new.id,
        'registro',
        nullif(left(btrim(new.raw_user_meta_data -> 'pending_studio' ->> 'nombre'), 120), ''),
        coalesce(new.created_at, now())
      )
      on conflict (auth_user_id) do nothing;
    end if;
  exception when others then
    raise warning 'altas_estudio_registrar_cuenta: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke execute on function public.altas_estudio_registrar_cuenta() from public;
revoke execute on function public.altas_estudio_registrar_cuenta() from anon;
revoke execute on function public.altas_estudio_registrar_cuenta() from authenticated;
grant execute on function public.altas_estudio_registrar_cuenta() to service_role;

drop trigger if exists trg_altas_estudio_registrar_cuenta on auth.users;
create trigger trg_altas_estudio_registrar_cuenta
  after insert on auth.users
  for each row execute function public.altas_estudio_registrar_cuenta();

-- ── Lectura: el alta cruzada con auth.users y studios ──────────────────────
-- La usan el cron (`p_solo_pendientes = true`) y /interno. SECURITY DEFINER
-- porque lee auth.users; por eso mismo solo la ejecuta service_role.
-- ⚠️ La condición de «pendiente» es la misma que el `where exists` del cron
-- (migración siguiente) y NUNCA más estrecha que `decidirRecordatorio()`:
-- lo que aquí se descarte no llega a evaluarse.
create or replace function public.altas_estudio_detalle(
  p_solo_pendientes boolean default false,
  p_limite integer default 200
)
returns table (
  auth_user_id uuid,
  email text,
  origen text,
  estudio_nombre text,
  iniciada_en timestamptz,
  email_confirmado_en timestamptz,
  plan_en timestamptz,
  error_estudio_en timestamptz,
  error_estudio_intentos integer,
  estudio_creado_en timestamptz,
  es_equipo boolean,
  avisado_antes boolean,
  recordatorio_reclamado_en timestamptz,
  recordatorio_enviado_en timestamptz,
  recordatorio_paso text,
  recordatorio_intentos integer,
  recordatorio_descartado text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.auth_user_id,
    u.email::text,
    a.origen,
    a.estudio_nombre,
    a.iniciada_en,
    u.email_confirmed_at,
    a.plan_en,
    a.error_estudio_en,
    a.error_estudio_intentos,
    (select min(s.creado_en) from public.studios s where s.owner_auth_user_id = a.auth_user_id),
    exists (select 1 from public.instructores i where i.auth_user_id = a.auth_user_id),
    -- El aviso que mandaba antes el barrido diario de Inngest dejaba esta
    -- marca en la metadata: quien ya lo recibió no recibe otro.
    coalesce(u.raw_user_meta_data ? 'embudo_alta_avisado_en', false),
    a.recordatorio_reclamado_en,
    a.recordatorio_enviado_en,
    a.recordatorio_paso,
    a.recordatorio_intentos,
    a.recordatorio_descartado
  from public.altas_estudio a
  join auth.users u on u.id = a.auth_user_id
  where not p_solo_pendientes
     or (
       a.recordatorio_enviado_en is null
       and a.recordatorio_reclamado_en is null
       and a.recordatorio_descartado is null
       and a.iniciada_en <= now() - interval '24 hours'
       and (a.origen = 'registro' or a.plan_en is not null or a.error_estudio_en is not null)
     )
  order by a.iniciada_en desc
  limit greatest(1, least(coalesce(p_limite, 200), 1000));
$$;

revoke execute on function public.altas_estudio_detalle(boolean, integer) from public;
revoke execute on function public.altas_estudio_detalle(boolean, integer) from anon;
revoke execute on function public.altas_estudio_detalle(boolean, integer) from authenticated;
grant execute on function public.altas_estudio_detalle(boolean, integer) to service_role;

-- ── Relleno: las altas a medias que ya existen ─────────────────────────────
-- Quien aún lleva `pending_studio` (o ya recibió el aviso antiguo) entra con
-- su fecha real. El aviso antiguo cuenta como enviado: nadie recibe dos.
insert into public.altas_estudio (
  auth_user_id, origen, estudio_nombre, iniciada_en, recordatorio_enviado_en, recordatorio_paso
)
select
  u.id,
  'registro',
  nullif(left(btrim(u.raw_user_meta_data -> 'pending_studio' ->> 'nombre'), 120), ''),
  u.created_at,
  case when u.raw_user_meta_data ? 'embudo_alta_avisado_en' then coalesce(u.updated_at, u.created_at) end,
  case when u.raw_user_meta_data ? 'embudo_alta_avisado_en' then 'aviso_antiguo' end
from auth.users u
where jsonb_typeof(u.raw_user_meta_data -> 'pending_studio') = 'object'
   or u.raw_user_meta_data ? 'embudo_alta_avisado_en'
on conflict (auth_user_id) do nothing;
