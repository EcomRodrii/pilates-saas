-- El check-in por QR (`hoja-pase.tsx` en el portal, escáner en
-- /calendario/pase) hasta hoy era obligatorio para todo estudio: sin
-- alguien escaneando o marcando asistencia a mano, una reserva se quedaba
-- en CONFIRMADA para siempre. Para un estudio pequeño donde nadie quiere
-- estar pendiente de la puerta, eso es fricción sin beneficio real: el
-- bono/cobro YA se descontó al reservar (consumirBonoServidor), así que el
-- check-in aquí es solo un registro de presencia física, no de dinero.
--
-- default true: nada cambia para ningún estudio existente hasta que la
-- propietaria lo desactive explícitamente desde Configuración.
alter table studios
  add column if not exists requiere_checkin_qr boolean not null default true;

comment on column studios.requiere_checkin_qr is
  'Si es false, las reservas confirmadas se marcan ASISTIDA solas al terminar la clase (cron checkin-automatico), sin pedir QR ni check-in manual. El check-in/no-show manual desde Asistentes sigue disponible siempre como excepción, con o sin este flag.';
