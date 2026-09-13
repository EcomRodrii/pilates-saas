-- ─────────────────────────────────────────────────────────────────────────────
-- Registro de supresiones + FKs hacia auth.users que impedían borrar una cuenta.
--
-- 1) `supresiones`: una fila por socia suprimida. Sirve para dos cosas:
--    · que una RESTAURACIÓN de copia vuelva a aplicar la supresión
--      (`restaurar_backup` → `anonimizar_socio`, migr 20260913170200);
--    · dejar constancia de qué terceros (cuenta de acceso, cliente de Stripe)
--      quedaron pendientes, en vez de fingir que todo se borró.
--    `auth_user_id` se guarda porque, tras la primera pasada, la ficha ya no
--    apunta a la cuenta, y una copia restaurada puede traer publicaciones de
--    comunidad firmadas con ella (`posts_comunidad.autor_id`). Si la cuenta se
--    llega a borrar, el uuid se queda sin nada detrás.
--    RLS sin políticas de escritura: solo la escribe service_role (la ruta y
--    la función). La propietaria del estudio puede leer las suyas.
--
-- 2) FKs NO ACTION hacia auth.users, fuera de `red_*` (esas las cambia otra
--    migración), que harían fallar `auth.admin.deleteUser` con 23503:
--    · mensajes.remitente_auth_user_id  → SET NULL (+ DROP NOT NULL). La RLS
--      `mensajes_escritura` sigue exigiendo remitente = auth.uid() al insertar,
--      así que un cliente no puede crear mensajes sin remitente.
--    · documentos_socio.subido_por      → SET NULL (+ DROP NOT NULL). Es quién
--      del staff subió el documento; si esa cuenta se borra, el documento de la
--      socia no debe desaparecer ni bloquear el borrado.
--    · plataforma_permiso.concedido_por → SET NULL (ya era nullable).
--    · studios.suspendido_por           → SET NULL (ya era nullable).
--    Se deja NO ACTION a propósito:
--    · cadenas.owner_auth_user_id: borrar a la dueña de una cadena no debe
--      poder ocurrir en silencio; la ruta de supresión nunca borra una cuenta
--      que sea dueña de nada (`lib/socios/borrado-cuenta.ts`).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.supresiones (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null,
  auth_user_id uuid,
  solicitada_en timestamptz not null default now(),
  ejecutada_en timestamptz,
  ejecutada_por uuid,
  origen text not null default 'panel'
    constraint supresiones_origen_valido check (origen in ('panel', 'restauracion', 'backfill')),
  terceros_pendientes jsonb not null default '[]'::jsonb
    constraint supresiones_terceros_es_lista check (jsonb_typeof(terceros_pendientes) = 'array'),
  reaplicada_en timestamptz,
  constraint supresiones_studio_socio_key unique (studio_id, socio_id)
);

comment on table public.supresiones is
  'Socias suprimidas (art. 17). La lee restaurar_backup para reaplicar anonimizar_socio. Solo service_role escribe.';

alter table public.supresiones enable row level security;

revoke all on table public.supresiones from anon, authenticated;
grant select on table public.supresiones to authenticated;
grant all on table public.supresiones to service_role;

drop policy if exists supresiones_propietaria_lee on public.supresiones;
create policy supresiones_propietaria_lee on public.supresiones
  for select to authenticated
  using (current_rol() = 'PROPIETARIO' and studio_id = current_studio_id());

-- ── FKs ──────────────────────────────────────────────────────────────────────
alter table public.mensajes alter column remitente_auth_user_id drop not null;
alter table public.mensajes
  drop constraint mensajes_remitente_auth_user_id_fkey,
  add constraint mensajes_remitente_auth_user_id_fkey
    foreign key (remitente_auth_user_id) references auth.users(id) on delete set null;

alter table public.documentos_socio alter column subido_por drop not null;
alter table public.documentos_socio
  drop constraint documentos_socio_subido_por_fkey,
  add constraint documentos_socio_subido_por_fkey
    foreign key (subido_por) references auth.users(id) on delete set null;

alter table public.plataforma_permiso
  drop constraint plataforma_permiso_concedido_por_fkey,
  add constraint plataforma_permiso_concedido_por_fkey
    foreign key (concedido_por) references auth.users(id) on delete set null;

alter table public.studios
  drop constraint studios_suspendido_por_fkey,
  add constraint studios_suspendido_por_fkey
    foreign key (suspendido_por) references auth.users(id) on delete set null;

-- ── La migración se comprueba a sí misma ─────────────────────────────────────
do $$
declare
  v_fk record;
begin
  for v_fk in
    select c.conname, c.confdeltype
      from pg_constraint c
     where c.conname in (
       'mensajes_remitente_auth_user_id_fkey', 'documentos_socio_subido_por_fkey',
       'plataforma_permiso_concedido_por_fkey', 'studios_suspendido_por_fkey')
  loop
    if v_fk.confdeltype <> 'n' then
      raise exception 'La FK % no quedó en ON DELETE SET NULL', v_fk.conname;
    end if;
  end loop;

  if (select count(*) from pg_constraint where conname in (
       'mensajes_remitente_auth_user_id_fkey', 'documentos_socio_subido_por_fkey',
       'plataforma_permiso_concedido_por_fkey', 'studios_suspendido_por_fkey')) <> 4 then
    raise exception 'Falta alguna de las 4 FKs recreadas';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.supresiones'::regclass) then
    raise exception 'supresiones sin RLS';
  end if;
  if has_table_privilege('anon', 'public.supresiones', 'SELECT') then
    raise exception 'anon no debe poder leer supresiones';
  end if;
  if has_table_privilege('authenticated', 'public.supresiones', 'INSERT')
     or has_table_privilege('authenticated', 'public.supresiones', 'UPDATE')
     or has_table_privilege('authenticated', 'public.supresiones', 'DELETE') then
    raise exception 'authenticated no debe poder escribir supresiones';
  end if;
end
$$;
