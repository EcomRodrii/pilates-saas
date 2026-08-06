-- notification_update permitía a CUALQUIER staff del estudio marcar
-- leída/archivar la notificación de OTRA persona del mismo estudio (el OR
-- studio_id = current_studio_id() en el UPDATE, copiado del SELECT sin pensar
-- que leer y escribir no son la misma pregunta). No hay ningún caso de uso
-- legítimo de "marcar leída la notificación de otra persona" — cada quien
-- gestiona su propio centro de notificaciones. El SELECT amplio (ver
-- notification de todo el estudio) sí es intencional, no se toca.
drop policy if exists notification_update on notification;
create policy notification_update on notification
  for update
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());
