-- Historial de logros: una fila por socia y logro, y la escriben solo quien
-- gestiona clientas o el servidor.
--
-- Hasta hoy `achievement_history` tenía una única política FOR ALL filtrada solo
-- por estudio: cualquier rol del personal podía insertar, editar o borrar filas
-- del historial desde el navegador. Y sin un UNIQUE por (socio_id,
-- achievement_id), dos evaluaciones simultáneas del mismo logro dejaban la fila
-- repetida (5 pares en producción, todos creados con 1-2 ms de diferencia).
--
-- Quién escribe a partir de aquí:
--  · el panel (`dbInsertAchievementHistory`), al desbloquear un logro, con
--    INSERT ... ON CONFLICT DO NOTHING: solo PROPIETARIO/MANAGER/RECEPCION
--    (`puede_gestionar_clientas()`, el mismo criterio que ya decide quién puede
--    marcar `achievement_progress.completado`), y solo si el progreso de ESE
--    logro consta completado en la base;
--  · el servidor (`evaluarLogrosServidor`, service_role), igual de idempotente;
--  · `anonimizar_socio`, `purgar_estudio_vencido` y `restaurar_backup`, que son
--    SECURITY DEFINER y no dependen de estos permisos.
-- Nadie actualiza ni borra historial desde el navegador: esos privilegios se van.
--
-- ⚠️ `restaurar_backup` repone esta tabla con un INSERT sin ON CONFLICT (modo
-- «reemplazar»). Una copia hecha ANTES de esta migración que contenga uno de los
-- pares repetidos fallaría con 23505 al restaurarse. Afecta a un solo estudio y la
-- restauración está desactivada para `authenticated`; si hiciera falta, se quita
-- el duplicado de la copia antes de restaurar.
--
-- Los créditos no dependen de esta tabla: `otorgar_credito_disparador` mira
-- `achievement_progress.completado`, no el historial.

-- 1. Duplicados: se queda la fila más antigua de cada par.
delete from public.achievement_history h
using (
  select id, row_number() over (partition by socio_id, achievement_id order by creado_en, id) as n
  from public.achievement_history
) d
where h.id = d.id and d.n > 1;

-- 2. Una fila por socia y logro.
create unique index if not exists uq_achievement_history_socio_logro
  on public.achievement_history (socio_id, achievement_id);

-- Queda cubierto por el índice único (columna inicial).
drop index if exists public.idx_achievement_history_socio;

-- 3. Políticas: lectura para el estudio; alta acotada por rol y por logro completado.
drop policy if exists admin_achievement_history on public.achievement_history;
drop policy if exists achievement_history_lectura on public.achievement_history;
drop policy if exists achievement_history_insert on public.achievement_history;

create policy achievement_history_lectura on public.achievement_history
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy achievement_history_insert on public.achievement_history
  for insert to authenticated
  with check (
    studio_id = public.current_studio_id()
    and public.puede_gestionar_clientas()
    and exists (
      select 1 from public.achievement_progress ap
      where ap.studio_id = achievement_history.studio_id
        and ap.socio_id = achievement_history.socio_id
        and ap.achievement_id = achievement_history.achievement_id
        and ap.completado
    )
  );

-- 4. Privilegios de tabla: sin UPDATE/DELETE/TRUNCATE para el navegador.
revoke all on public.achievement_history from authenticated;
grant select, insert on public.achievement_history to authenticated;

do $$
begin
  if exists (
    select 1 from public.achievement_history
    group by socio_id, achievement_id having count(*) > 1
  ) then
    raise exception 'quedan filas repetidas en achievement_history';
  end if;
  if not exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indexrelid
    where i.indrelid = 'public.achievement_history'::regclass
      and c.relname = 'uq_achievement_history_socio_logro'
      and i.indisunique and i.indpred is null
  ) then
    raise exception 'falta el índice único (socio_id, achievement_id)';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'achievement_history' and cmd in ('ALL', 'UPDATE', 'DELETE')
  ) then
    raise exception 'achievement_history conserva una política de escritura amplia';
  end if;
  if has_table_privilege('authenticated', 'public.achievement_history', 'UPDATE')
     or has_table_privilege('authenticated', 'public.achievement_history', 'DELETE')
     or has_table_privilege('authenticated', 'public.achievement_history', 'TRUNCATE') then
    raise exception 'authenticated sigue pudiendo modificar o borrar historial';
  end if;
  if not has_table_privilege('authenticated', 'public.achievement_history', 'SELECT')
     or not has_table_privilege('authenticated', 'public.achievement_history', 'INSERT') then
    raise exception 'authenticated ha perdido la lectura o el alta del historial: el panel dejaría de funcionar';
  end if;
  if has_table_privilege('anon', 'public.achievement_history', 'SELECT')
     or has_table_privilege('anon', 'public.achievement_history', 'INSERT') then
    raise exception 'anon tiene acceso a achievement_history';
  end if;
  if not has_table_privilege('service_role', 'public.achievement_history', 'INSERT')
     or not has_table_privilege('service_role', 'public.achievement_history', 'DELETE') then
    raise exception 'service_role ha perdido la escritura del historial';
  end if;
end $$;
