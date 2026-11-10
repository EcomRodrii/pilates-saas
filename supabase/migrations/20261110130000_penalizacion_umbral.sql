-- ─────────────────────────────────────────────────────────────────────────────
-- Penalización por cancelación tardía / no-show: «a partir de la falta N».
--
-- Hasta hoy el cargo era el mismo desde la PRIMERA falta. Un estudio que quiere ser amable («la primera vez te lo
-- perdonamos») no tenía cómo. Ahora elige a partir de qué falta se cobra y cuántos días hacia atrás cuenta las faltas.
--
-- Decisiones:
--   · La DETECCIÓN no cambia: cada falta sigue quedando registrada en `penalizaciones` (la crea `cancelar_reserva_plaza` o
--     el trigger de no-show, en la misma transacción que la reserva). Lo que se decide después es solo si se COBRA.
--   · Lo decide el cron de penalizaciones, como ya decide «sin cuota» o «sin consentimiento»: una falta de las primeras
--     queda `OMITIDA_FRANQUICIA` (auditable: se ve por qué no se cobró). Solo puede cobrar MENOS que antes, nunca más.
--   · De serie 1 = cobra desde la primera falta: cero cambio de comportamiento para los estudios que hoy tienen regla.
--   · El contrato de la alumna dice «si cancelas tarde o no vienes, X €»; perdonar las primeras queda DENTRO de lo que
--     aceptó, así que no hace falta cambiar el texto legal ni vuelve a pedir su consentimiento a nadie.
--   · Cuenta las faltas registradas de la alumna en esa ventana, menos las revertidas. Una falta de cuando la regla estaba
--     apagada no existe como fila y no cuenta.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.studios add column if not exists penalizacion_umbral_faltas smallint not null default 1;
alter table public.studios add column if not exists penalizacion_umbral_ventana_dias smallint not null default 90;

alter table public.studios drop constraint if exists studios_penalizacion_umbral_faltas_check;
alter table public.studios add constraint studios_penalizacion_umbral_faltas_check
  check (penalizacion_umbral_faltas between 1 and 10);
alter table public.studios drop constraint if exists studios_penalizacion_umbral_ventana_check;
alter table public.studios add constraint studios_penalizacion_umbral_ventana_check
  check (penalizacion_umbral_ventana_dias in (30, 60, 90, 180, 365));

comment on column public.studios.penalizacion_umbral_faltas is
  'Se cobra a partir de la falta N de la alumna (1 = desde la primera, como siempre). Las anteriores quedan OMITIDA_FRANQUICIA.';
comment on column public.studios.penalizacion_umbral_ventana_dias is
  'Cuántos días hacia atrás cuentan las faltas de una alumna para el umbral (solo se usa con umbral > 1).';

-- Estado auditable de la falta que no se cobra por ser de las primeras. Los 11 valores de hoy + OMITIDA_FRANQUICIA.
alter table public.penalizaciones drop constraint if exists penalizaciones_estado_check;
alter table public.penalizaciones
  add constraint penalizaciones_estado_check
  check (estado in (
    'DETECTADA', 'OMITIDA_SIN_TARJETA', 'OMITIDA_SIN_CONSENTIMIENTO', 'OMITIDA_COMPENSADA', 'OMITIDA_REVERTIDA',
    'OMITIDA_SIN_CUOTA', 'OMITIDA_FRANQUICIA', 'PENDIENTE_APROBACION', 'RECIBO_CREADO', 'COBRADA', 'FALLIDA', 'REEMBOLSADA'
  ));
