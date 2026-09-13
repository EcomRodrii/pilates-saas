-- Campos personalizados de socia: solo la PROPIETARIA define qué se pregunta.
--
-- Auditoría RGPD 2026-09-13, H5. La política `admin_campos_personalizados`
-- (0015) era FOR ALL con `studio_id = current_studio_id()`: cualquier rol,
-- instructora incluida, podía crear un campo — y el copy de Configuración
-- sugería literalmente «Lesiones previas». Lo que se rellena ahí acaba en
-- `socios.campos_extra`, que lee todo el personal, sin consentimiento de salud
-- ni las garantías de la ficha clínica. En prod, 1 de 2 etiquetas era de salud.
--
-- Qué decide cada rol después:
--  · Leer las definiciones: todo el personal del estudio (el alta y la ficha
--    las pintan para cualquier rol que gestione clientas).
--  · Crear / editar / borrar: solo PROPIETARIO. Mismo patrón que
--    `plantillas_cuestionario_salud`.
-- La barrera de UI equivalente es `puedeGestionarCamposPersonalizados`
-- (lib/permisos-reglas.ts).

drop policy if exists admin_campos_personalizados on public.campos_personalizados;
drop policy if exists campos_personalizados_lectura on public.campos_personalizados;
drop policy if exists campos_personalizados_insert on public.campos_personalizados;
drop policy if exists campos_personalizados_update on public.campos_personalizados;
drop policy if exists campos_personalizados_delete on public.campos_personalizados;

create policy campos_personalizados_lectura on public.campos_personalizados
  for select to authenticated
  using (studio_id = current_studio_id());

create policy campos_personalizados_insert on public.campos_personalizados
  for insert to authenticated
  with check (studio_id = current_studio_id() and current_rol() = 'PROPIETARIO');

create policy campos_personalizados_update on public.campos_personalizados
  for update to authenticated
  using (studio_id = current_studio_id() and current_rol() = 'PROPIETARIO')
  with check (studio_id = current_studio_id() and current_rol() = 'PROPIETARIO');

create policy campos_personalizados_delete on public.campos_personalizados
  for delete to authenticated
  using (studio_id = current_studio_id() and current_rol() = 'PROPIETARIO');
