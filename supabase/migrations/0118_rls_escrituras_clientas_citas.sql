-- ─────────────────────────────────────────────────────────────────────────────
-- Mismo agujero que 0112 (facturación), esta vez en clientas y citas.
--
-- Reportado por el usuario mirando el panel con rol INSTRUCTOR: le aparecían
-- botones para borrar clienta, editar su perfil, dar de alta una nueva, crear
-- una cita... Antes de tocar nada se probó EN VIVO (transacción deshecha,
-- instructora real de studio-1) si el servidor de verdad lo rechazaba o si
-- solo era un botón que la app no debería enseñar. Resultado: INSERT/UPDATE/
-- DELETE en `socios` y `citas` se ejecutaban sin ningún rechazo.
--
--     USING (studio_id = current_studio_id())   -- FOR ALL, a `authenticated`
--
-- La misma frase que tenía `recibos` antes de 0112: comprueba el estudio,
-- nunca el rol. `lib/permisos-reglas.ts` ya tenía la regla correcta
-- (`puedeGestionarClientas` = PROPIETARIO/RECEPCION/MANAGER) — solo la UI la
-- aplicaba, nunca la base de datos.
--
-- Que la baja de una socia SÍ pasara por /api/socios/eliminar (que comprueba
-- el rol) no bastaba: la tabla en crudo seguía abierta, así que cualquiera con
-- la consola del navegador podía saltarse esa ruta y escribir directo con el
-- cliente de Supabase ya autenticado en la página.
--
-- ALCANCE: se cierran las ESCRITURAS. Las LECTURAS se quedan como están —una
-- instructora necesita ver a sus alumnas (ficha, salud, contacto) y su propia
-- agenda de citas; cerrarlo dejaría pantallas en blanco, que es peor que el
-- problema (mismo criterio que 0112 con recibos/suscripciones).
--
-- Probado EN VIVO tras aplicar esta migración: el mismo INSERT/UPDATE/DELETE
-- que antes se ejecutaba ahora sale con 42501 (row-level security policy).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.puede_gestionar_clientas() returns boolean
  language sql stable security definer
  set search_path = public
  as $$
    select public.current_rol() in ('PROPIETARIO', 'RECEPCION', 'MANAGER');
  $$;

comment on function public.puede_gestionar_clientas() is
  'Roles que pueden ESCRIBIR clientas y citas (alta, edición, baja, importación). Espejo de puedeGestionarClientas en lib/permisos-reglas.ts. Ver migración 0118.';

grant execute on function public.puede_gestionar_clientas() to authenticated;

-- ── socios (clientas) ────────────────────────────────────────────────────────
drop policy if exists admin_socios on public.socios;

create policy socios_lectura on public.socios
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy socios_escritura_insert on public.socios
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

create policy socios_escritura_update on public.socios
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

create policy socios_escritura_delete on public.socios
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

-- ── citas ────────────────────────────────────────────────────────────────────
drop policy if exists admin_citas on public.citas;

create policy citas_lectura on public.citas
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy citas_escritura_insert on public.citas
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

create policy citas_escritura_update on public.citas
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

create policy citas_escritura_delete on public.citas
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
