-- Auditoría 21ª pasada (2-sep-2026), P-3: `consumir_sesion_bono` y
-- `devolver_sesion_bono` son SECURITY DEFINER con GRANT a `authenticated` y
-- solo comprobaban STUDIO_MISMATCH — ningún rol. Una instructora podía
-- llamarlas directo (mismo mecanismo que cualquier RPC, JWT propio) e inflar
-- o vaciar `sesiones_restantes` de cualquier socia de su estudio sin que
-- ninguna capa lo impidiera.
--
-- La duda del informe ("¿rompe el check-in del mostrador si recepción
-- consume bono sin ese permiso?") no aplica: RECEPCION ya tiene
-- `puedeMoverDinero`/`puede_gestionar_calendario()` — nunca estuvo en
-- riesgo. El rol que de verdad faltaba comprobar es INSTRUCTOR (y
-- cualquier rol futuro fuera de calendario).
--
-- Se usa `puede_gestionar_calendario()` como cerradura, NO
-- `puede_mover_dinero()`: MANAGER gestiona el calendario (añadir/cancelar
-- reservas — RLS de `reservas` ya lo confirma: INSERT/DELETE exigen
-- `puede_gestionar_calendario()`, que SÍ incluye MANAGER) pero no puede
-- mover dinero (`puedeMoverDinero` en TS lo excluye, `BLOQUEADO_MANAGER`
-- le cierra /cobros /facturas /pagos). Consumir/devolver una sesión de bono
-- es un EFECTO SECUNDARIO de añadir o cancelar una reserva, no una acción
-- de facturación en sí misma — usar `puede_mover_dinero()` aquí habría roto
-- el flujo normal de MANAGER (añadir una socia a una clase, cancelar una
-- sesión) sin necesidad, la trampa exacta que el informe quería evitar.
--
-- Verificado en vivo con `SET LOCAL "request.jwt.claims"` simulando una
-- instructora real (bloqueada con NO_AUTORIZADO) y la propietaria del mismo
-- estudio (pasa el guard, sigue hasta el siguiente chequeo) antes de
-- aplicar. Los 2 callers admin/service-role (`consumirBonoServidor`/
-- `devolverBonoServidor`, `lib/db/supabase-data-admin.ts`) no llevan
-- `auth.uid()` — el guard no les afecta.
--
-- Misma firma en las dos funciones (solo se añade una comprobación al
-- cuerpo) — `CREATE OR REPLACE` conserva los grants existentes, no hace
-- falta REVOKE/GRANT.

create or replace function public.consumir_sesion_bono(p_suscripcion_id text, p_studio_id text, p_sesion_id text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_saldo int;
  v_plan_id text;
  v_tipo_clase_id text;
  v_acotado boolean;
begin
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;

  if auth.uid() is not null and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_sesion_id is null then
    raise exception 'SESION_REQUERIDA';
  end if;

  select s.plan_id into v_plan_id
    from public.suscripciones s
   where s.id = p_suscripcion_id and s.studio_id = p_studio_id;

  select ss.tipo_clase_id into v_tipo_clase_id
    from public.sesiones ss
   where ss.id = p_sesion_id and ss.studio_id = p_studio_id;

  select exists (
    select 1 from public.plan_tipos_clase ptc
     where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
  ) into v_acotado;

  if v_acotado and v_tipo_clase_id is not null and not exists (
    select 1 from public.plan_tipos_clase ptc
     where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
       and ptc.tipo_clase_id = v_tipo_clase_id
  ) then
    raise exception 'BONO_NO_CUBRE_CLASE';
  end if;

  update public.suscripciones
     set sesiones_restantes = sesiones_restantes - 1
   where id = p_suscripcion_id
     and studio_id = p_studio_id
     and sesiones_restantes > 0
  returning sesiones_restantes into v_saldo;

  return v_saldo;
end;
$$;

create or replace function public.devolver_sesion_bono(p_suscripcion_id text, p_studio_id text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_saldo int;
begin
  if auth.uid() is not null and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;
  if auth.uid() is not null and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;
  update public.suscripciones s set sesiones_restantes = s.sesiones_restantes + 1
    from public.planes_tarifa p
   where s.id = p_suscripcion_id and s.studio_id = p_studio_id
     and p.id = s.plan_id and p.studio_id = p_studio_id
     and s.sesiones_restantes is not null
     and (p.sesiones is null or s.sesiones_restantes < p.sesiones)
  returning s.sesiones_restantes into v_saldo;
  return v_saldo;
end; $$;
