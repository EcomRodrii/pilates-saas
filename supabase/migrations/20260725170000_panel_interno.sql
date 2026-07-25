-- ─────────────────────────────────────────────────────────────────────────────
-- Panel interno de Tentare (backoffice). Cimientos: quiénes somos, qué puede
-- hacer cada uno, y registro inmutable de todo lo que hacemos.
--
-- Esto NO son usuarios de un estudio. Un `instructor` con rol PROPIETARIO manda
-- en SU estudio; un `plataforma_admin` es alguien de Tentare que ve TODOS. Son
-- dos ejes distintos y a propósito no comparten tabla: mezclarlos convertiría
-- cualquier error de permisos de estudio en un acceso a toda la plataforma.
--
-- Modelo de acceso: DENY BY DEFAULT. Las tres tablas llevan RLS activo y CERO
-- políticas permisivas → ni `anon` ni `authenticated` leen nada, pase lo que
-- pase. Solo el service-role (servidor) entra, y siempre después de comprobar
-- en TypeScript que quien pide es admin y tiene el permiso concreto.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Quiénes somos ────────────────────────────────────────────────────────────
create table if not exists plataforma_admin (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  nombre       text not null,
  cargo        text,
  activo       boolean not null default true,
  creado_en    timestamptz not null default now()
);

comment on table plataforma_admin is
  'Personas de Tentare con acceso al panel interno. Nada que ver con el staff de un estudio.';

-- ── Qué puede hacer cada uno ─────────────────────────────────────────────────
-- Por PERMISO, no por rol. Un rol es un atajo para conceder permisos, no la
-- unidad de autorización: en cuanto entra la tercera persona con un encargo que
-- no encaja en "CEO" o "marketing", los roles obligan a inventar roles nuevos.
create table if not exists plataforma_permiso (
  auth_user_id  uuid not null references plataforma_admin(auth_user_id) on delete cascade,
  permiso       text not null,
  concedido_en  timestamptz not null default now(),
  concedido_por uuid references auth.users(id),
  primary key (auth_user_id, permiso)
);

-- ── Qué ha hecho cada uno ────────────────────────────────────────────────────
-- Append-only de verdad: el trigger de abajo rechaza UPDATE y DELETE incluso
-- para el service-role. Un log que el propio panel puede reescribir no sirve
-- como auditoría — y sin auditoría, entrar como un cliente (impersonate) no es
-- defendible ante el RGPD.
create table if not exists plataforma_auditoria (
  id                  bigint generated always as identity primary key,
  ocurrido_en         timestamptz not null default now(),
  actor_auth_user_id  uuid,
  actor_nombre        text not null,
  accion              text not null,          -- 'estudio.plan.cambiado'
  objetivo_tipo       text,                   -- 'studio' | 'plataforma_admin' | …
  objetivo_id         text,
  resumen             text not null,          -- legible: "Business → Enterprise"
  antes               jsonb,
  despues             jsonb,
  ip                  text,
  user_agent          text
);

create index if not exists idx_auditoria_ocurrido on plataforma_auditoria (ocurrido_en desc);
create index if not exists idx_auditoria_objetivo on plataforma_auditoria (objetivo_tipo, objetivo_id, ocurrido_en desc);
create index if not exists idx_auditoria_actor    on plataforma_auditoria (actor_auth_user_id, ocurrido_en desc);

create or replace function plataforma_auditoria_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'plataforma_auditoria es inmutable: % no está permitido', tg_op;
end;
$$;

drop trigger if exists trg_auditoria_inmutable on plataforma_auditoria;
create trigger trg_auditoria_inmutable
  before update or delete on plataforma_auditoria
  for each row execute function plataforma_auditoria_inmutable();

-- ── Cierre de acceso ─────────────────────────────────────────────────────────
alter table plataforma_admin     enable row level security;
alter table plataforma_permiso   enable row level security;
alter table plataforma_auditoria enable row level security;

-- Sin políticas: RLS activo y ninguna política = nadie pasa salvo service-role.
revoke all on plataforma_admin     from anon, authenticated;
revoke all on plataforma_permiso   from anon, authenticated;
revoke all on plataforma_auditoria from anon, authenticated;

-- ── Alta de los dos fundadores ───────────────────────────────────────────────
-- Por email, para que sea idempotente y no dependa de uuids escritos a mano.
do $$
declare
  id_marcos uuid;
  id_meri   uuid;
begin
  select id into id_marcos from auth.users where email = 'marcosrocarodriguezbussines@gmail.com';
  select id into id_meri   from auth.users where email = 'meri@gmail.com';

  if id_marcos is not null then
    insert into plataforma_admin (auth_user_id, nombre, cargo)
    values (id_marcos, 'Marcos', 'Fundador y CEO')
    on conflict (auth_user_id) do update set nombre = excluded.nombre, cargo = excluded.cargo;

    -- admin.full es un comodín: lo entiende la capa de permisos en TS.
    insert into plataforma_permiso (auth_user_id, permiso)
    values (id_marcos, 'admin.full')
    on conflict do nothing;
  end if;

  if id_meri is not null then
    insert into plataforma_admin (auth_user_id, nombre, cargo)
    values (id_meri, 'Meri', 'Cofundadora y Jefa de Equipo de Marketing')
    on conflict (auth_user_id) do update set nombre = excluded.nombre, cargo = excluded.cargo;

    -- Lo acordado: ve estudios y facturación, lleva marketing y CRM, lee los
    -- logs. NO borra estudios, NO toca cobros ni planes.
    insert into plataforma_permiso (auth_user_id, permiso)
    select id_meri, p
    from unnest(array['studios.read','billing.read','marketing.send','crm.update','logs.read']) as p
    on conflict do nothing;
  end if;
end $$;
