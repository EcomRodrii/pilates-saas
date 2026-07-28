-- 0096: Notification Engine 1b — RECEPCIÓN como destinatario de notificaciones.
-- El CHECK de recipient_role solo admitía PROPIETARIO/INSTRUCTOR/SOCIA, así que el
-- motor no podía crear notificaciones para el staff de mostrador (su campana
-- quedaba siempre vacía). Se amplía el dominio permitido para incluir RECEPCION.
-- Verificado con tx revertida sobre prod: antes RECEPCION → check_violation;
-- después RECEPCION aceptado y un valor inválido sigue rechazado.
ALTER TABLE public.notification DROP CONSTRAINT notification_recipient_role_check;
ALTER TABLE public.notification ADD CONSTRAINT notification_recipient_role_check
  CHECK (recipient_role IN ('PROPIETARIO','INSTRUCTOR','RECEPCION','SOCIA'));
