-- `plazas_fijas` era la única tabla de su familia cuya RLS no miraba el rol.
--
-- Tenía UNA política `for all to authenticated` con `studio_id =
-- current_studio_id()` y nada más, así que cualquier persona autenticada del
-- estudio —INSTRUCTOR incluida— podía crear, mover, pausar o dar de baja la
-- plaza fija de cualquier socia. Y una plaza fija no es un apunte: reserva
-- aforo automáticamente cada semana (`materializar_plazas_fijas`), o sea que es
-- un compromiso con peso económico.
--
-- Sus hermanas ya lo hacían bien, cada una con la guarda que le toca:
--   suscripciones  → puede_mover_dinero()
--   reservas       → puede_gestionar_calendario()
--   recuperaciones → puede_gestionar_clientas()
--
-- Se elige `puede_gestionar_clientas()` (PROPIETARIO, MANAGER, RECEPCION) por
-- dos motivos: la plaza fija vive en la FICHA DE LA SOCIA
-- (components/socios/ficha-plaza-fija.tsx), igual que las recuperaciones; y
-- cubre exactamente los mismos tres roles que `puede_gestionar_calendario()`,
-- así que no cambia quién puede trabajar hoy — solo deja fuera a INSTRUCTOR,
-- que es el agujero.
--
-- ⚠️ LA LECTURA SIGUE ABIERTA a todo el estudio, y es deliberado: una
-- instructora necesita ver quién tiene plaza fija en su clase para saber a
-- quién espera. Lo que se cierra es la escritura.
--
-- No afecta al autoservicio de la alumna: `crearPlazaFijaPropia` va por
-- `/api/public/plaza-fija`, una ruta de servidor con service-role, que no pasa
-- por RLS. Tampoco al cron: `materializar_plazas_fijas` es SECURITY DEFINER.

drop policy if exists admin_plazas_fijas on public.plazas_fijas;

drop policy if exists plazas_fijas_lectura on public.plazas_fijas;
create policy plazas_fijas_lectura on public.plazas_fijas
  for select to authenticated
  using (studio_id = public.current_studio_id());

drop policy if exists plazas_fijas_escritura_insert on public.plazas_fijas;
create policy plazas_fijas_escritura_insert on public.plazas_fijas
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

drop policy if exists plazas_fijas_escritura_update on public.plazas_fijas;
create policy plazas_fijas_escritura_update on public.plazas_fijas
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

drop policy if exists plazas_fijas_escritura_delete on public.plazas_fijas;
create policy plazas_fijas_escritura_delete on public.plazas_fijas
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
