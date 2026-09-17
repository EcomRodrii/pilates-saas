-- RES-4: Agregar 'SIN_ENTITLEMENT' al CHECK de intentos_reserva_fallidos.
-- Ahora que la verificación de entitlement ocurre DENTRO de reservar_plaza
-- (dentro del lock transaccional), registramos ese motivo cuando falla.

alter table public.intentos_reserva_fallidos
  drop constraint if exists intentos_reserva_fallidos_motivo_check;

alter table public.intentos_reserva_fallidos
  add constraint intentos_reserva_fallidos_motivo_check
  check (motivo in (
    'AFORO_LLENO_SIN_ESPERA', 'SIN_PLAN', 'PLAN_NO_INCLUYE_TIPO',
    'FUERA_VENTANA_MINIMA', 'FUERA_VENTANA_MAXIMA',
    'LIMITE_SEMANAL', 'MAX_SIMULTANEAS',
    'CONFLICTO_HORARIO', 'NECESITA_AUTORIZACION',
    'RESERVA_BLOQUEADA_IMPAGO',
    'LIMITE_SEMANAL_ACTIVIDAD',
    'SIN_ENTITLEMENT'
  ));
