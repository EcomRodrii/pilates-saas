-- La reserva se abre a una hora fija (Fase 2 de «Cómo reservan mis alumnas»).
--
-- `studios.reserva_antelacion_hora`: con valor, la reserva se abre a esa hora
-- (Europe/Madrid) del día que marca `reserva_antelacion_maxima_dias` —del
-- estudio o del tipo de clase—: «la del jueves 18:00 se abre el martes a las
-- 20:00», igual para todas. NULL = a la misma hora que la clase, que es lo de
-- siempre: ningún estudio ve un cambio hasta que la pone. Sin días (siempre
-- abierta) no se usa.
--
-- Sin override por tipo de clase a propósito: el tipo cambia los DÍAS y la hora
-- es siempre la del estudio (un solo momento, igual para todas). Si algún día
-- hace falta, `tipos_clase.reserva_antelacion_hora` nullable = hereda.
--
-- Se llama así, y no «apertura», para no confundirla con `studios.hora_apertura`
-- (el eje del calendario) ni con la apertura suave.
--
-- Lo aplican `crearReservaPublica` y la reserva tras pagar
-- (lib/db/supabase-data-admin.ts) con `instanteDeApertura` (lib/booking-logic.ts),
-- y las dos puertas de pago lo comprueban ANTES de cobrar.

alter table public.studios
  add column if not exists reserva_antelacion_hora time;

comment on column public.studios.reserva_antelacion_hora is
  'NULL = la reserva se abre a la hora de la clase (lo de siempre). Con valor: a esa hora (Europe/Madrid) del día que marca reserva_antelacion_maxima_dias, del estudio o del tipo de clase. Sin días (siempre abierta) no se usa. Sin override por tipo.';

alter table public.studios
  drop constraint if exists studios_reserva_antelacion_hora_en_punto;
alter table public.studios
  add constraint studios_reserva_antelacion_hora_en_punto
    check (reserva_antelacion_hora is null or extract(second from reserva_antelacion_hora) = 0);

-- `studios` da UPDATE por columnas a authenticated (20260910171150).
grant update (reserva_antelacion_hora) on public.studios to authenticated;

do $verificacion$
begin
  if not has_column_privilege('authenticated', 'public.studios', 'reserva_antelacion_hora', 'UPDATE') then
    raise exception 'studios.reserva_antelacion_hora: no se podría guardar desde el panel';
  end if;
end
$verificacion$;
