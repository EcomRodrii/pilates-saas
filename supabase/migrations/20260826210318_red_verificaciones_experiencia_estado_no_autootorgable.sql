-- F-34 (auditoría 20ª pasada) — nota de procedencia: recuperada verbatim
-- desde `schema_migrations.statements` (mismo timestamp/nombre aplicado en
-- producción, fichero nunca llegó al repo). Ver
-- 20260821130703_cupo_semanal_ignora_clases_canceladas.sql para el método.
--
-- Mismo criterio que el resto de tablas "red_*_no_autootorgable" (verificar
-- Network): quien inserta una fila de `red_verificaciones_experiencia` no
-- puede autoconcederse su propio estado de verificación — el trigger fuerza
-- 'pendiente' salvo que la escritura venga de service_role (el equipo de
-- Tentare revisando y resolviendo).

create or replace function public.red_verificaciones_proteger_estado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.estado := 'pendiente';
    new.resuelto_en := null;
    new.resuelto_por := null;
  end if;
  return new;
end;
$$;

drop trigger if exists red_verificaciones_proteger_estado_trigger on public.red_verificaciones_experiencia;
create trigger red_verificaciones_proteger_estado_trigger
  before insert on public.red_verificaciones_experiencia
  for each row execute function public.red_verificaciones_proteger_estado();
