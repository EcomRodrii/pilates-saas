-- Seguimientos de una clienta («Recuérdamelo»): una tarea con fecha, sobre una
-- socia, para alguien del equipo. Reutiliza `tareas` (OAuth fase 5), que ya
-- tiene `socio_id`, su estado PENDIENTE/HECHA y `completado_en`, y que la
-- supresión de una socia, la purga de un estudio y la exportación ya tratan.
--
--   · vence_el         — el día que hay que hacerlo (calendario del estudio).
--   · asignada_a       — la CUENTA de quien lo hará (uuid, sin FK): la propietaria
--                        puede no tener ficha en `instructores`, y una FK ahí
--                        obligaría a rehacer la anonimización del equipo.
--   · creada_por / hecha_por — cuentas, igual.
--   · recomendacion_id — si nació de un aviso del Centro de Control.
--
-- Hasta hoy la tabla la escribía solo la API OAuth (service_role) y ninguna
-- pantalla la leía. Desde aquí: el panel LEE (quien gestiona clientas) y el
-- servidor ESCRIBE (app/api/seguimientos), que comprueba rol, estudio y fechas.

alter table public.tareas
  add column if not exists vence_el date,
  add column if not exists asignada_a uuid,
  add column if not exists creada_por uuid,
  add column if not exists hecha_por uuid,
  add column if not exists recomendacion_id text references public.recomendaciones(id) on delete set null;

-- Una tarea hecha tiene su fecha de hecha, y una pendiente no. `not valid`: no
-- se revisan las que ya hay (las de la API OAuth), sí todas las de ahora en adelante.
alter table public.tareas drop constraint if exists tareas_hecha_coherente;
alter table public.tareas add constraint tareas_hecha_coherente
  check ((estado = 'HECHA') = (completado_en is not null)) not valid;
alter table public.tareas drop constraint if exists tareas_titulo_largo;
alter table public.tareas add constraint tareas_titulo_largo
  check (length(btrim(titulo)) between 1 and 200) not valid;

create index if not exists idx_tareas_vencen on public.tareas (studio_id, vence_el)
  where estado = 'PENDIENTE' and vence_el is not null;
create index if not exists idx_tareas_socio on public.tareas (socio_id, creado_en desc)
  where socio_id is not null;

-- El panel lee; escribir, solo el servidor.
drop policy if exists tareas_staff_gestion on public.tareas;
drop policy if exists tareas_lectura on public.tareas;
create policy tareas_lectura on public.tareas
  for select to authenticated
  using (studio_id = (select public.current_studio_id()) and (select public.puede_gestionar_clientas()));

revoke all on table public.tareas from public, anon, authenticated;
grant select on table public.tareas to authenticated;
grant select, insert, update, delete on table public.tareas to service_role;

do $$
begin
  if has_table_privilege('anon', 'public.tareas', 'SELECT')
     or has_table_privilege('authenticated', 'public.tareas', 'INSERT')
     or has_table_privilege('authenticated', 'public.tareas', 'UPDATE')
     or has_table_privilege('authenticated', 'public.tareas', 'DELETE') then
    raise exception 'tareas: el cliente no escribe seguimientos';
  end if;
  if not has_table_privilege('authenticated', 'public.tareas', 'SELECT')
     or not has_table_privilege('service_role', 'public.tareas', 'INSERT')
     or not has_table_privilege('service_role', 'public.tareas', 'UPDATE') then
    raise exception 'tareas: sin la lectura del panel o sin la escritura del servidor y la API OAuth';
  end if;
end $$;
