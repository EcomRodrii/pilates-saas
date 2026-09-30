-- Tope de clases al día por alumna (Fase 2 de «Cómo reservan mis alumnas»).
--
-- `studios.reserva_max_por_dia`: cuántas clases puede tener cada alumna el MISMO
-- día (hora de Madrid). NULL = sin tope, que es lo de siempre: ningún estudio ve
-- un cambio hasta que lo pone. Sin override por tipo de clase: es un tope de la
-- alumna que cruza todos los tipos.
--
-- Lo aplica `crearReservaPublica` (lib/db/supabase-data-admin.ts) al apuntarse:
-- cuenta toda reserva no cancelada en clases no canceladas de ese día
-- (`contarClasesDelDia`, lib/booking-logic.ts). No lo aplican el mostrador ni la
-- reserva tras pagar sin cuenta.

alter table public.studios
  add column if not exists reserva_max_por_dia integer;

comment on column public.studios.reserva_max_por_dia is
  'Clases que cada alumna puede tener el mismo día (hora de Madrid): cuenta toda reserva no cancelada en clases no canceladas. NULL = sin límite. Sin override por tipo. Solo la aplica la reserva de la propia alumna (crearReservaPublica).';

alter table public.studios
  drop constraint if exists studios_reserva_max_por_dia_rango;
alter table public.studios
  add constraint studios_reserva_max_por_dia_rango
    check (reserva_max_por_dia is null or (reserva_max_por_dia >= 1 and reserva_max_por_dia <= 20));

-- `studios` da UPDATE por columnas a authenticated (20260910171150): una columna
-- nueva sin su grant no se podría guardar desde el panel.
grant update (reserva_max_por_dia) on public.studios to authenticated;

-- El motivo nuevo del registro de intentos fallidos. De paso vuelve
-- 'SIN_ENTITLEMENT' (20260918000100): figura como aplicada, pero la restricción
-- viva ya no lo tenía (medido el 30-sep-2026 con pg_get_constraintdef), así que
-- esas filas se perdían al insertarlas.
alter table public.intentos_reserva_fallidos
  drop constraint if exists intentos_reserva_fallidos_motivo_check;
alter table public.intentos_reserva_fallidos
  add constraint intentos_reserva_fallidos_motivo_check
  check (motivo in (
    'AFORO_LLENO_SIN_ESPERA', 'SIN_PLAN', 'PLAN_NO_INCLUYE_TIPO',
    'FUERA_VENTANA_MINIMA', 'FUERA_VENTANA_MAXIMA',
    'LIMITE_SEMANAL', 'MAX_SIMULTANEAS',
    'CONFLICTO_HORARIO', 'NECESITA_AUTORIZACION',
    'RESERVA_BLOQUEADA_IMPAGO', 'LIMITE_SEMANAL_ACTIVIDAD', 'SIN_ENTITLEMENT',
    'MAX_POR_DIA'
  ));

do $verificacion$
begin
  if not has_column_privilege('authenticated', 'public.studios', 'reserva_max_por_dia', 'UPDATE') then
    raise exception 'studios.reserva_max_por_dia: no se podría guardar desde el panel';
  end if;
end
$verificacion$;
