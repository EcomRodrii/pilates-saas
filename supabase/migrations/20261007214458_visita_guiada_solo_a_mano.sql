-- Hasta que el fundador la vea, la visita guiada NO se impone a los estudios nuevos:
-- el trigger los deja con tour_obligatorio = false y solo se activa a mano
-- (`update studios set tour_obligatorio = true, tour_progreso = '{}', tour_completado_en = null where id = …`).
-- Cuando se apruebe, una migración nueva devuelve a `marcar_tour_obligatorio` la regla de
-- 20261007211202 (sedes de cadena y demos fuera, el resto dentro).
create or replace function public.marcar_tour_obligatorio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.tour_obligatorio := false;
  new.tour_progreso := '{}'::jsonb;
  new.tour_completado_en := null;
  return new;
end
$$;

revoke execute on function public.marcar_tour_obligatorio() from public;
revoke execute on function public.marcar_tour_obligatorio() from anon;
revoke execute on function public.marcar_tour_obligatorio() from authenticated;
grant execute on function public.marcar_tour_obligatorio() to service_role;
