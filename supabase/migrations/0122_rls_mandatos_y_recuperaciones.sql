-- ─────────────────────────────────────────────────────────────────────────────
-- Dos tablas más con el patrón que ya costó dos agujeros: `FOR ALL` sin mirar
-- el rol (0112 con la facturación, 0118 con clientas y citas).
--
--     USING (studio_id = current_studio_id())   -- a `authenticated`, FOR ALL
--
-- Como el navegador habla con Supabase con la clave anónima y el JWT del
-- usuario, esa policy es la única cerradura — y no cierra nada por rol.
--
-- ── `mandatos_sepa` ─────────────────────────────────────────────────────────
-- Un mandato SEPA es la autorización de una clienta para que le carguen en su
-- cuenta. Cualquiera del personal podía crear o cancelar uno.
--
-- Corrección posterior (2026-07-29): sí hay pantalla — `ficha-mandato-sepa.tsx`
-- ya llamaba a `ponerMandato`/`quitarMandato` desde el 24-jul, 4 días antes de
-- escribirse el párrafo original de este comentario, que decía lo contrario.
-- No cambia la corrección del fix (la RLS estaba abierta y hacía falta
-- cerrarla), pero el dato de "ninguna pantalla la llama" era falso.
--
-- ── `recuperaciones` ────────────────────────────────────────────────────────
-- Una recuperación es una clase gratis que se le debe a una clienta. Conceder
-- o anular una tiene valor económico, y `FichaRecuperaciones` vive en la ficha
-- de clienta, que una instructora SÍ ve.
--
-- Aquí sí hay pantalla, así que se cierran los dos lados a la vez: la RLS y los
-- botones. Cerrar solo la base de datos dejaría un botón que falla — el mismo
-- error que ya se arregló hoy dos veces.
--
-- ── Qué NO se toca, y por qué ───────────────────────────────────────────────
-- `reservas` y `sesiones` tienen la misma policy abierta y se quedan como
-- están. No es un descuido: una instructora hace check-in y mueve sus clases
-- desde su propio panel, así que cerrarlas por rol le rompería el trabajo del
-- día. Cuáles de esas escrituras son legítimas para ella es una decisión de
-- producto, no un agujero que tapar de madrugada.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── mandatos_sepa: dinero ───────────────────────────────────────────────────
drop policy if exists admin_mandatos_sepa on public.mandatos_sepa;

create policy mandatos_sepa_lectura on public.mandatos_sepa
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy mandatos_sepa_escritura_insert on public.mandatos_sepa
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());

create policy mandatos_sepa_escritura_update on public.mandatos_sepa
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero())
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());

create policy mandatos_sepa_escritura_delete on public.mandatos_sepa
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero());

-- ── recuperaciones: trabajo de mostrador ────────────────────────────────────
-- `puede_gestionar_clientas()` (0118) y no `puede_mover_dinero()`: conceder una
-- recuperación es gestión de clientas, y quien lleva una sede tiene que poder
-- hacerlo cuando cancela una clase.
drop policy if exists admin_recuperaciones on public.recuperaciones;

create policy recuperaciones_lectura on public.recuperaciones
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy recuperaciones_escritura_insert on public.recuperaciones
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

create policy recuperaciones_escritura_update on public.recuperaciones
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());

create policy recuperaciones_escritura_delete on public.recuperaciones
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_clientas());
