-- ─────────────────────────────────────────────────────────────────────────────
-- Opening OS · etapas de lanzamiento (Fundadora, acceso anticipado…).
--
-- Una etapa usa un plan del propio estudio. Qué pasa al llegar al cupo o a la
-- fecha de fin lo ELIGE el estudio (`al_completar`), con el default que no
-- cambia nada: 'AVISAR' solo cuenta; 'CERRAR' desactiva el plan, y las dos
-- compras online ya rechazan un plan inactivo (`if (!plan.activo)` en
-- /api/stripe/checkout y /api/public/checkout-embebido). Desactivar un plan no
-- corta las cuotas ya vendidas: la renovación no filtra por `activo`.
--
-- Cupo NO exacto, a propósito: dos compras simultáneas pueden vender una de
-- más. Un cupo exacto exige reservar la plaza en las 4 vías de cobro (como
-- reservar_matricula) y es otro diseño.
--
-- El cierre nunca bloquea una venta: el trigger atrapa cualquier error y sigue.
--
-- Quién puede cerrar la venta: desactivar un plan exige puede_mover_dinero()
-- (RLS de planes_tarifa), y una etapa 'CERRAR' lo hace por SECURITY DEFINER.
-- Por eso launch_stages deja de ser escribible desde el cliente (la RLS de la
-- migr base permitía a MANAGER escribirla directo): solo la escribe
-- /api/opening/etapas, que exige puedeMoverDinero para 'CERRAR'.
--
-- Límite conocido: una suscripción importada (CSV) con fecha_inicio dentro de
-- una etapa cuenta como venta de esa etapa.
-- ─────────────────────────────────────────────────────────────────────────────

revoke insert, update, delete on public.launch_stages from authenticated, anon;

alter table public.launch_stages
  add column if not exists al_completar text not null default 'AVISAR'
    check (al_completar in ('AVISAR','CERRAR')),
  add column if not exists cerrada_en timestamptz,
  add column if not exists cerrada_motivo text
    check (cerrada_motivo is null or cerrada_motivo in ('CUPO','FECHA'));

-- Ventas de una etapa: suscripciones de su plan con inicio dentro de la etapa.
-- (suscripciones no tiene fecha de creación; fecha_inicio es la de la venta.)
-- fecha_inicio/fecha_fin de la etapa son medianoche de Madrid (inicioDelDiaEstudio
-- / finDelDiaEstudio en lib/utils.ts): fecha_fin es EXCLUSIVA, el día siguiente.
create or replace function public.opening_ventas_etapa(p_stage_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.launch_stages e
  join public.suscripciones s
    on s.studio_id = e.studio_id and s.plan_id = e.plan_id
   and s.fecha_inicio >= (e.fecha_inicio at time zone 'Europe/Madrid')::date
   and s.fecha_inicio <  (e.fecha_fin    at time zone 'Europe/Madrid')::date
  where e.id = p_stage_id and e.plan_id is not null;
$$;

create or replace function public.opening_cerrar_etapa_si_toca(p_stage_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e public.launch_stages%rowtype;
  v_motivo text;
begin
  select * into v_e from public.launch_stages where id = p_stage_id for update;
  if not found or v_e.estado = 'CERRADA' then
    return null;
  end if;

  if v_e.limite_plazas is not null and public.opening_ventas_etapa(p_stage_id) >= v_e.limite_plazas then
    v_motivo := 'CUPO';
  elsif now() >= v_e.fecha_fin then
    v_motivo := 'FECHA';
  else
    return null;
  end if;

  -- Con 'AVISAR' la etapa se da por completa pero el plan sigue a la venta.
  if v_e.al_completar = 'CERRAR' and v_e.plan_id is not null then
    update public.planes_tarifa set activo = false
     where id = v_e.plan_id and studio_id = v_e.studio_id;
  end if;

  update public.launch_stages
     set estado = 'CERRADA', cerrada_en = now(), cerrada_motivo = v_motivo, updated_at = now()
   where id = p_stage_id;
  return v_motivo;
end;
$$;

create or replace function public.opening_trg_venta_etapa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in
    select e.id from public.launch_stages e
     where e.studio_id = new.studio_id and e.plan_id = new.plan_id
       and e.estado <> 'CERRADA' and e.limite_plazas is not null
  loop
    begin
      perform public.opening_cerrar_etapa_si_toca(v_id);
    exception when others then
      raise warning 'opening: no se pudo cerrar la etapa % (%)', v_id, sqlerrm;
    end;
  end loop;
  return new;
end;
$$;

create trigger trg_suscripciones_opening_etapa
  after insert on public.suscripciones
  for each row execute function public.opening_trg_venta_etapa();

create or replace function public.opening_cerrar_etapas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in
    select id from public.launch_stages where estado <> 'CERRADA' and fecha_fin <= now()
  loop
    begin
      if public.opening_cerrar_etapa_si_toca(v_id) is not null then v_n := v_n + 1; end if;
    exception when others then
      raise warning 'opening: no se pudo cerrar la etapa % (%)', v_id, sqlerrm;
    end;
  end loop;
  return v_n;
end;
$$;

-- Solo las llaman el trigger, el cron y la API con service_role.
revoke execute on function public.opening_ventas_etapa(uuid) from public, anon, authenticated;
revoke execute on function public.opening_cerrar_etapa_si_toca(uuid) from public, anon, authenticated;
revoke execute on function public.opening_trg_venta_etapa() from public, anon, authenticated;
revoke execute on function public.opening_cerrar_etapas_vencidas() from public, anon, authenticated;
grant execute on function public.opening_ventas_etapa(uuid) to service_role, postgres;
grant execute on function public.opening_cerrar_etapa_si_toca(uuid) to service_role, postgres;
grant execute on function public.opening_cerrar_etapas_vencidas() to service_role, postgres;

select cron.schedule('opening-cerrar-etapas', '*/15 * * * *', $$select public.opening_cerrar_etapas_vencidas();$$);
