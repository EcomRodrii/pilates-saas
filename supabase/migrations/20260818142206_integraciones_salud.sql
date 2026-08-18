-- La salud REAL de una integración, no "tiene los campos rellenos".
--
-- Hoy la pantalla de Integraciones dice «conectado» en cuanto hay un token
-- guardado. Si ese token caduca o lo revocan en Meta, el cron de recordatorios
-- cuenta el fallo (`fallidosWhatsapp++`), lo devuelve a los logs y ahí muere:
-- la propietaria sigue viendo «conectado» mientras sus clientas dejan de
-- recibir recordatorios, indefinidamente y sin un solo aviso.
--
-- Estas tres columnas son lo mínimo para que el estado deje de ser decorativo:
-- cuándo funcionó por última vez, cuándo falló por última vez y por qué. Quién
-- gana (y por tanto qué se pinta) lo decide `lib/integraciones/salud.ts`, no
-- este esquema — aquí solo se guardan los hechos.
--
-- Aditiva y sin política nueva: `owner_integraciones` ya cubre todas las
-- columnas de la tabla y sigue acotada a PROPIETARIO del propio estudio.
alter table public.integraciones
  add column if not exists ultimo_ok_en timestamptz,
  add column if not exists ultimo_error text,
  add column if not exists ultimo_error_en timestamptz;

comment on column public.integraciones.ultimo_ok_en is
  'Última vez que el servicio externo respondió bien (envío real o prueba de conexión).';
comment on column public.integraciones.ultimo_error is
  'Mensaje del último fallo, tal cual lo devolvió el servicio. Se enseña a la propietaria: es lo que le dice si el problema es el token o el número.';
comment on column public.integraciones.ultimo_error_en is
  'Cuándo fue ese fallo. Más reciente que ultimo_ok_en = la integración está caída AHORA.';
