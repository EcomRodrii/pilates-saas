-- La fecha de cierre de una consulta la pone la base, no el navegador: con el
-- grant de columna, quien gestiona clientas podía escribir cualquier
-- `atendida_en` y mover la purga de 90 días (el tope de 180 no dependía de
-- ella). No va como `atendida_en <= now()` en el WITH CHECK porque un iPad
-- con el reloj adelantado no podría cerrar ninguna.

create or replace function public.consultas_contacto_sella_atendida()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = 'atendida' and old.estado is distinct from 'atendida' then
    new.atendida_en := now();
  end if;
  return new;
end;
$$;

revoke all on function public.consultas_contacto_sella_atendida() from public, anon, authenticated;

drop trigger if exists trg_consultas_contacto_sella_atendida on public.consultas_contacto;
create trigger trg_consultas_contacto_sella_atendida
  before update on public.consultas_contacto
  for each row execute function public.consultas_contacto_sella_atendida();
