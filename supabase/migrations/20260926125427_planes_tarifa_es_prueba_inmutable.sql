-- «Clase de prueba»: una vez vendida, una tarifa no cambia de «prueba» a
-- «normal» ni al revés. El panel ya lo impide (Paquetes), pero la UI nunca es
-- la cerradura: marcarla hacia atrás cambiaría quién ha pagado ya matrícula
-- (`primeraVezConPlan` resta las suscripciones de prueba) y bloquearía
-- `renovar-plan` a quien ya la tenía como bono normal.
--
-- SECURITY INVOKER a propósito: quien puede actualizar `planes_tarifa`
-- (`puede_mover_dinero()`: PROPIETARIO/RECEPCION) ya lee `suscripciones` por
-- RLS, y así no hay una función DEFINER más con EXECUTE para `anon` por los
-- privilegios por defecto del esquema.
create or replace function public.planes_tarifa_es_prueba_inmutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.es_prueba is distinct from old.es_prueba
     and exists (select 1 from public.suscripciones s where s.plan_id = old.id) then
    raise exception 'Esta tarifa ya se ha vendido: no se puede cambiar si es clase de prueba'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.planes_tarifa_es_prueba_inmutable() from public, anon, authenticated;

drop trigger if exists trg_planes_tarifa_es_prueba_inmutable on public.planes_tarifa;
create trigger trg_planes_tarifa_es_prueba_inmutable
  before update of es_prueba on public.planes_tarifa
  for each row execute function public.planes_tarifa_es_prueba_inmutable();
