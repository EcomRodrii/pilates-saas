-- Cuántas plazas de una clase cede el estudio a cada plataforma.
--
-- Mismo patrón «hereda» que el resto de reglas por clase: se fija por tipo de
-- clase y se puede cambiar para una sesión concreta. `cupo_plataforma` resuelve
-- sesión → tipo de clase → NULL.
--
-- ⚠️ NULL es «sin configurar», no «cero».
-- ⚠️ El cupo es un TECHO compartido, no plazas apartadas: si la plataforma no
--    las vende, las socias del estudio pueden ocuparlas. Apartarlas restaría
--    reservas propias y obligaría a cambiar todos los contadores de aforo.
--
-- Sin nivel «serie»: el tipo de clase cubre las series y la sesión cubre las
-- excepciones (decisión de diseño del 1-oct, a confirmar con el fundador).

create table if not exists public.plataforma_cupos (
  id text primary key default ('pcu-' || gen_random_uuid()::text),
  studio_id text not null references public.studios(id) on delete cascade,
  plataforma text not null check (plataforma in ('CLASSPASS', 'URBAN_SPORTS_CLUB', 'WELLHUB')),
  tipo_clase_id text references public.tipos_clase(id) on delete cascade,
  sesion_id text references public.sesiones(id) on delete cascade,
  plazas integer not null check (plazas >= 0 and plazas <= 1000),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint plataforma_cupos_un_nivel check (num_nonnulls(tipo_clase_id, sesion_id) = 1)
);

create unique index if not exists plataforma_cupos_por_tipo
  on public.plataforma_cupos (plataforma, tipo_clase_id) where tipo_clase_id is not null;
create unique index if not exists plataforma_cupos_por_sesion
  on public.plataforma_cupos (plataforma, sesion_id) where sesion_id is not null;
create index if not exists plataforma_cupos_studio on public.plataforma_cupos (studio_id);

alter table public.plataforma_cupos enable row level security;

-- Lectura: el personal del estudio, MENOS la instructora. Una política que solo
-- mire `studio_id = current_studio_id()` se lo vuelve a abrir todo (tentare-os).
create policy plataforma_cupos_lectura on public.plataforma_cupos
  for select to authenticated
  using (studio_id = current_studio_id() and current_rol() is distinct from 'INSTRUCTOR');

-- Por tipo de clase es una decisión comercial (propietaria y gerencia); por
-- sesión, una excepción de calendario (también recepción). En los dos casos la
-- fila referida tiene que ser del mismo estudio.
create policy plataforma_cupos_escritura_tipo on public.plataforma_cupos
  for all to authenticated
  using (studio_id = current_studio_id() and tipo_clase_id is not null and puede_gestionar_sede())
  with check (
    studio_id = current_studio_id() and tipo_clase_id is not null and puede_gestionar_sede()
    and exists (select 1 from tipos_clase tc where tc.id = tipo_clase_id and tc.studio_id = plataforma_cupos.studio_id)
  );

create policy plataforma_cupos_escritura_sesion on public.plataforma_cupos
  for all to authenticated
  using (studio_id = current_studio_id() and sesion_id is not null and puede_gestionar_calendario())
  with check (
    studio_id = current_studio_id() and sesion_id is not null and puede_gestionar_calendario()
    and exists (select 1 from sesiones s where s.id = sesion_id and s.studio_id = plataforma_cupos.studio_id)
  );

grant select, insert, update, delete on public.plataforma_cupos to authenticated;
grant all on public.plataforma_cupos to service_role;

create or replace function public.cupo_plataforma(p_sesion_id text, p_plataforma text)
 returns integer
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    (select c.plazas from plataforma_cupos c
      where c.sesion_id = p_sesion_id and c.plataforma = p_plataforma),
    (select c.plazas from plataforma_cupos c
       join sesiones s on s.id = p_sesion_id
      where c.tipo_clase_id = s.tipo_clase_id and c.plataforma = p_plataforma
        and c.studio_id = s.studio_id)
  );
$function$;

revoke all on function public.cupo_plataforma(text, text) from public, anon, authenticated;
grant execute on function public.cupo_plataforma(text, text) to service_role, postgres;

do $$
begin
  if has_function_privilege('anon', 'public.cupo_plataforma(text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.cupo_plataforma(text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.cupo_plataforma(text,text)', 'EXECUTE') then
    raise exception 'cupo_plataforma: permisos distintos de lo previsto';
  end if;
end $$;
