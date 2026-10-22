-- Modo de alineación al día 1 de las alumnas que YA tiene el estudio
-- (petición real de un estudio, 21-oct-2026).
--
--   ENTERA        (hoy, por defecto): en su renovación paga la cuota entera y queda
--                 cubierta hasta el último día del mes SIGUIENTE (unos días gratis).
--   PROPORCIONAL  (nuevo): en su renovación paga solo la parte de los días que van
--                 hasta fin de mes y su cuota acaba ese día; el día 1 paga la entera.
--
-- Solo tiene efecto con `cobro_dia_1_activo`. Ver lib/billing/alineacion-dia1.ts.
--
-- Aditiva, sin datos que migrar, sin tocar ninguna suscripción: cada una cambia
-- SOLO en su renovación. Se aplica ANTES de desplegar el código (el código lee la
-- columna aparte y, si no existe, trata el estudio como ENTERA).
alter table public.studios
  add column if not exists cobro_dia_1_modo text not null default 'ENTERA';
alter table public.studios drop constraint if exists studios_cobro_dia_1_modo_check;
alter table public.studios add constraint studios_cobro_dia_1_modo_check
  check (cobro_dia_1_modo in ('ENTERA', 'PROPORCIONAL'));

-- ⚠️ SIN `grant update (...) to authenticated`, a propósito: `authenticated` escribe
-- `studios` por lista blanca de columnas (migr 20260910171150) y esta NACE no
-- escribible. Solo la ruta de servidor `/api/cobros/alineacion-dia1` la cambia, y
-- solo a PROPORCIONAL tras haber visto la vista previa (huella). Es dinero: no se
-- activa por un PATCH directo.

-- Apagar «cobrar el día 1» devuelve el modo a ENTERA: volver a encenderlo no puede
-- reactivar el cobro proporcional sin que la propietaria vuelva a ver la lista.
create or replace function public.studios_reset_modo_dia_1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.cobro_dia_1_activo, false) = false then
    new.cobro_dia_1_modo := 'ENTERA';
  end if;
  return new;
end;
$$;

revoke all on function public.studios_reset_modo_dia_1() from public, anon, authenticated;
grant execute on function public.studios_reset_modo_dia_1() to service_role;

drop trigger if exists trg_studios_reset_modo_dia_1 on public.studios;
create trigger trg_studios_reset_modo_dia_1
  before update of cobro_dia_1_activo on public.studios
  for each row execute function public.studios_reset_modo_dia_1();
