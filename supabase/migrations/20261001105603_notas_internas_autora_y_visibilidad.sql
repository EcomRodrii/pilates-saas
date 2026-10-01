-- Notas del equipo sobre una clienta: quién la escribió, para quién es y si va
-- fijada arriba de su ficha.
--
-- Hasta ahora `notas_internas` solo la leía y escribía la propietaria (política
-- `owner_notas_internas`) y no guardaba quién escribía cada nota. Ahora la
-- escriben también gerencia y recepción, cada nota sabe de quién es, y se elige
-- para quién:
--   · EQUIPO  — la lee todo el que gestiona clientas (PROPIETARIO, MANAGER, RECEPCION).
--   · PRIVADA — la leen quien la escribió y la propietaria. La propietaria
--     también porque es la responsable de los datos: tiene que poder atender un
--     derecho de acceso de la clienta, y una nota no puede quedar ilegible para
--     siempre si su autora se va del estudio. La pantalla lo dice tal cual.
--
-- Las notas que ya existen se quedan PRIVADAS y sin autora (no se sabe quién las
-- escribió): las siguen viendo solo las propietarias, como hasta hoy. Nadie
-- empieza a leer de golpe lo que se escribió pensando que solo lo vería ella.
--
-- La autora la pone la base de datos, nunca el navegador: un trigger escribe
-- `auth.uid()` en cada alta que llega con la sesión de alguien del equipo, y la
-- política de alta exige que coincida. Así nadie firma con el nombre de otra.

alter table public.notas_internas add column if not exists autor_uid uuid;
alter table public.notas_internas add column if not exists visibilidad text not null default 'PRIVADA';
alter table public.notas_internas add column if not exists fijada boolean not null default false;
alter table public.notas_internas add column if not exists editada_en timestamptz;

alter table public.notas_internas drop constraint if exists notas_internas_visibilidad_check;
alter table public.notas_internas add constraint notas_internas_visibilidad_check
  check (visibilidad in ('EQUIPO', 'PRIVADA'));
-- `not valid`: no se revisan las que ya hay; las nuevas, de 1 a 4.000 caracteres.
alter table public.notas_internas drop constraint if exists notas_internas_texto_largo;
alter table public.notas_internas add constraint notas_internas_texto_largo
  check (length(btrim(texto)) between 1 and 4000) not valid;

create index if not exists idx_notas_internas_socio on public.notas_internas (socio_id, creado_en desc);

-- Antes de escribir, con la sesión de alguien del equipo: en un alta, la autora
-- es quien escribe, la nota es una nota (no «Automática») y la fecha es la de
-- ahora — lo que mande el navegador en esas columnas no cuenta; en una edición,
-- la autora, la clienta y el estudio no cambian. Si cambia el texto se apunta
-- cuándo. El servidor (service_role: la API OAuth) y las funciones SECURITY
-- DEFINER (restaurar una copia, anonimizar) escriben lo suyo sin que se toque.
create or replace function public.notas_internas_antes_de_escribir() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      new.autor_uid := auth.uid();
      new.tipo := 'NOTA';
      new.creado_en := now();
    end if;
  else
    if current_user = 'authenticated' then
      new.autor_uid := old.autor_uid;
      new.socio_id := old.socio_id;
      new.studio_id := old.studio_id;
    end if;
    if new.texto is distinct from old.texto then
      new.editada_en := now();
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_notas_internas_antes_de_escribir on public.notas_internas;
create trigger trg_notas_internas_antes_de_escribir
  before insert or update on public.notas_internas
  for each row execute function public.notas_internas_antes_de_escribir();

revoke all on function public.notas_internas_antes_de_escribir() from public, anon, authenticated;

-- ── Quién lee y quién escribe ──────────────────────────────────────────────
drop policy if exists owner_notas_internas on public.notas_internas;
drop policy if exists notas_internas_lectura on public.notas_internas;
drop policy if exists notas_internas_alta on public.notas_internas;
drop policy if exists notas_internas_edicion on public.notas_internas;
drop policy if exists notas_internas_borrado on public.notas_internas;

create policy notas_internas_lectura on public.notas_internas
  for select to authenticated
  using (
    studio_id = (select public.current_studio_id())
    and (select public.puede_gestionar_clientas())
    and (visibilidad = 'EQUIPO' or autor_uid = (select auth.uid()) or (select public.current_rol()) = 'PROPIETARIO')
  );

create policy notas_internas_alta on public.notas_internas
  for insert to authenticated
  with check (
    studio_id = (select public.current_studio_id())
    and (select public.puede_gestionar_clientas())
    and autor_uid = (select auth.uid())
    and exists (
      select 1 from public.socios s
       where s.id = notas_internas.socio_id and s.studio_id = (select public.current_studio_id())
         and s.borrado_en is null
    )
  );

-- Editar (texto, para quién, fijarla): la autora. Las antiguas sin autora, la propietaria.
create policy notas_internas_edicion on public.notas_internas
  for update to authenticated
  using (
    studio_id = (select public.current_studio_id())
    and (select public.puede_gestionar_clientas())
    and (autor_uid = (select auth.uid()) or (autor_uid is null and (select public.current_rol()) = 'PROPIETARIO'))
  )
  with check (
    studio_id = (select public.current_studio_id())
    and (select public.puede_gestionar_clientas())
    and (autor_uid = (select auth.uid()) or (autor_uid is null and (select public.current_rol()) = 'PROPIETARIO'))
  );

-- Borrar: la autora, o la propietaria (cualquiera).
create policy notas_internas_borrado on public.notas_internas
  for delete to authenticated
  using (
    studio_id = (select public.current_studio_id())
    and (select public.puede_gestionar_clientas())
    and (autor_uid = (select auth.uid()) or (select public.current_rol()) = 'PROPIETARIO')
  );

-- Hoy es GRANT ALL a authenticated (0000_base.sql): se acota. Alta y edición
-- por columnas, sin la autora, la clienta ni las fechas de edición.
revoke all on table public.notas_internas from public, anon, authenticated;
grant select, delete on table public.notas_internas to authenticated;
grant insert (id, studio_id, socio_id, texto, tipo, creado_en, visibilidad, fijada) on table public.notas_internas to authenticated;
grant update (texto, visibilidad, fijada) on table public.notas_internas to authenticated;
grant all on table public.notas_internas to service_role;

do $$
begin
  if has_table_privilege('anon', 'public.notas_internas', 'SELECT')
     or has_table_privilege('authenticated', 'public.notas_internas', 'INSERT')
     or has_table_privilege('authenticated', 'public.notas_internas', 'UPDATE')
     or has_column_privilege('authenticated', 'public.notas_internas', 'autor_uid', 'INSERT')
     or has_column_privilege('authenticated', 'public.notas_internas', 'autor_uid', 'UPDATE')
     or has_column_privilege('authenticated', 'public.notas_internas', 'socio_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.notas_internas', 'editada_en', 'UPDATE') then
    raise exception 'notas_internas: el cliente podría firmar como otra persona o mover una nota';
  end if;
  if not has_table_privilege('authenticated', 'public.notas_internas', 'SELECT')
     or not has_table_privilege('authenticated', 'public.notas_internas', 'DELETE')
     or not has_column_privilege('authenticated', 'public.notas_internas', 'creado_en', 'INSERT')
     or not has_column_privilege('authenticated', 'public.notas_internas', 'visibilidad', 'INSERT')
     or not has_column_privilege('authenticated', 'public.notas_internas', 'fijada', 'UPDATE') then
    raise exception 'notas_internas: el panel no podría leer, apuntar, fijar o borrar notas';
  end if;
  if has_function_privilege('anon', 'public.notas_internas_antes_de_escribir()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.notas_internas_antes_de_escribir()', 'EXECUTE') then
    raise exception 'notas_internas_antes_de_escribir: ejecutable desde el cliente';
  end if;
end $$;
