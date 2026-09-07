-- Un interruptor para que la propietaria pueda APAGAR un correo automático.
-- Petición literal de una propietaria: no quiere que se envíe la confirmación
-- de reserva.
--
-- ⚠️ `activa` NO servía para esto, y reaprovecharla habría sido peor que no
-- tener nada: `activa = false` significa «ignora mi personalización y manda el
-- correo de fábrica» —`resolverPlantilla` descarta la fila entera y el emisor
-- cae a los textos por defecto—, no «no lo mandes». Son dos decisiones
-- distintas y ahora son dos columnas distintas.
--
-- Default `true`: para los estudios de hoy no cambia absolutamente nada.
-- Apagar un correo es siempre un acto explícito.
alter table public.plantillas_email
  add column if not exists enviar boolean not null default true;

comment on column public.plantillas_email.enviar is
  'false = este correo NO se envia a las clientas de este estudio. Distinto de `activa`, que solo decide si se aplica la personalizacion del estudio sobre el texto de fabrica.';

-- Sin política ni grant nuevos a propósito: `plantillas_email` ya tiene una
-- única policy FOR ALL acotada a PROPIETARIO + su studio_id
-- (admin_plantillas_email), y los GRANT de authenticated/service_role son de
-- TABLA, no por columna — una columna nueva los hereda. Verificado contra
-- information_schema.role_table_grants antes de escribir esto (el repo ya se
-- comió una fuga por dar por hecho lo contrario).
