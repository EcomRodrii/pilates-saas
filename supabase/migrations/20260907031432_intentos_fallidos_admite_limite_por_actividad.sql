-- El motivo nuevo tiene que caber en el CHECK, o la fila se pierde SIN RUIDO.
--
-- `registrarIntentoFallido` inserta a propósito sin `await` (fire-and-forget:
-- un fallo al anotar la estadística no debe retrasar el mensaje que ya se le
-- va a dar a la socia). El precio de eso es que un motivo fuera del CHECK no
-- da error en ningún sitio: simplemente no se guarda. Ya pasó dos veces —de
-- ahí los dos comentarios «el CHECK lo amplía…» que hay en el tipo de TS.
--
-- Y merece la pena distinguirlo de LIMITE_SEMANAL a secas: «quiere más Máquina
-- de la que su cuota le da» es una señal de venta, y «ha gastado su cuota
-- entera» no es lo mismo.

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
    'LIMITE_SEMANAL_ACTIVIDAD'
  ));
