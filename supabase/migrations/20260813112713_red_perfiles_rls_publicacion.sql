-- Tentare Network, Fase 3 (publicación) — docs/NETWORK-IMPLEMENTATION-PLAN.md.
--
-- La Fase 1 dejó `red_perfiles_update_propio` sin restringir por `estado`:
-- el dueño podía UPDATE cualquier columna, `estado` incluida. Eso es
-- justo lo que permite publicar/ocultar (correcto), pero también dejaba dos
-- huecos que la validación de la API (capa de negocio, no de seguridad) NO
-- podía cerrar por sí sola, porque `authenticated` puede llamar a la REST de
-- Supabase directamente con su propio JWT, sin pasar por el endpoint:
--
--   1. Un perfil SUSPENDIDO por moderación (Fase 10) podía autorrestaurarse
--      con un UPDATE directo a `estado = 'published'` — la suspensión no
--      tenía cerradura real, solo la promesa de que la UI no ofrecía el
--      botón.
--   2. Cualquiera podía crear su fila ya con `estado = 'published'` en el
--      INSERT, saltándose por completo la validación mínima para publicar
--      (nombre + ciudad + especialidad) que solo vive en
--      app/api/network/perfil/estado/route.ts.
--
-- "La RLS es la cerradura real, la UI/API nunca es el límite de seguridad"
-- (.claude/tentare-os.md) — moderación es justo ese tipo de regla: se aplica
-- aquí, no solo en el endpoint. `service_role` (moderación, Fase 10) sigue
-- pudiendo poner/quitar `suspended` porque bypasa RLS por completo.

drop policy if exists red_perfiles_update_propio on public.red_perfiles;
create policy red_perfiles_update_propio on public.red_perfiles
  for update to authenticated
  using (auth_user_id = auth.uid() and estado <> 'suspended')
  with check (auth_user_id = auth.uid() and estado <> 'suspended');

drop policy if exists red_perfiles_insert_propio on public.red_perfiles;
create policy red_perfiles_insert_propio on public.red_perfiles
  for insert to authenticated
  with check (auth_user_id = auth.uid() and estado = 'draft');
