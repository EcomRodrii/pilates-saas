-- ─────────────────────────────────────────────────────────────────────────────
-- La separación de roles existía en el menú, no en la base de datos.
--
-- El navegador habla con Supabase con la clave anónima y el JWT del usuario
-- (lib/db/supabase.ts), así que lo único que protege una tabla es su RLS. Y la
-- de la facturación decía, para las cuatro:
--
--     USING (studio_id = current_studio_id())   -- FOR ALL, a `authenticated`
--
-- Es decir: CUALQUIER persona del estudio —las 18 instructoras de una cadena
-- incluidas— podía leer Y ESCRIBIR recibos, facturas, suscripciones y ventas.
-- De las 105 policies, 23 comprueban el rol y NINGUNA mencionaba a RECEPCION:
-- `lib/permisos.ts` era una cortina, no una cerradura.
--
-- No era un agujero solo de API: la ficha de clienta —que las instructoras SÍ
-- tienen— ya enseñaba "Cobrar", "Cobrar todos" y cambiar de plan.
--
-- ALCANCE, a propósito: se cierran las ESCRITURAS, no las lecturas.
--   · Escribir dinero no tiene ningún uso legítimo para una instructora, así
--     que cerrarlo no rompe ningún flujo. Es la mitad grave y se cierra entera.
--   · Leer sí lo tiene a medias (la ficha de una clienta enseña su plan y sus
--     recibos), y cerrarlo dejaría pantallas en blanco en vez de ocultarlas:
--     eso es trabajo de UI y va aparte. Queda anotado, no olvidado.
--
-- Esto NO era una fuga entre estudios: `current_studio_id()` seguía acotando, y
-- es lo que se probó en el pentest. Es escalada DENTRO del inquilino.
-- ─────────────────────────────────────────────────────────────────────────────

-- Quién puede mover dinero. La propietaria y recepción: recepción cobra en
-- mostrador y vende bonos, así que necesita escribir de verdad.
create or replace function public.puede_mover_dinero() returns boolean
  language sql stable security definer
  set search_path = public
  as $$
    select public.current_rol() in ('PROPIETARIO', 'RECEPCION');
  $$;

comment on function public.puede_mover_dinero() is
  'Roles que pueden ESCRIBIR facturación (recibos, suscripciones, ventas). Recepción incluida: cobra en mostrador. Ver migración 0107.';

grant execute on function public.puede_mover_dinero() to authenticated;

-- ── recibos ──────────────────────────────────────────────────────────────────
drop policy if exists admin_recibos on public.recibos;

create policy recibos_lectura on public.recibos
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy recibos_escritura_insert on public.recibos
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());

create policy recibos_escritura_update on public.recibos
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero())
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());

create policy recibos_escritura_delete on public.recibos
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero());

-- ── suscripciones ────────────────────────────────────────────────────────────
-- Ojo: descontar sesión al reservar NO pasa por aquí. `consumirBonoServidor`
-- usa service-role y se salta la RLS, así que el calendario de una instructora
-- sigue funcionando igual. Lo que se cierra es asignar/cambiar plan a mano.
drop policy if exists admin_suscripciones on public.suscripciones;

create policy suscripciones_lectura on public.suscripciones
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy suscripciones_escritura_insert on public.suscripciones
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());

create policy suscripciones_escritura_update on public.suscripciones
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero())
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());

create policy suscripciones_escritura_delete on public.suscripciones
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero());

-- ── ventas_pos ───────────────────────────────────────────────────────────────
drop policy if exists admin_ventas_pos on public.ventas_pos;

create policy ventas_pos_lectura on public.ventas_pos
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy ventas_pos_escritura_insert on public.ventas_pos
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());

create policy ventas_pos_escritura_update on public.ventas_pos
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero())
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());

create policy ventas_pos_escritura_delete on public.ventas_pos
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero());

-- ── facturas ─────────────────────────────────────────────────────────────────
-- Aquí se cierra del TODO, sin excepción de rol: ninguna ruta del navegador
-- escribe facturas (todas salen de servidor con service-role — `facturaToDb`
-- consta como código muerto en el lint). Y una factura sellada por Veri*Factu
-- forma parte de una cadena de hashes: que un navegador pueda tocarla no es un
-- permiso de más, es romper la cadena.
drop policy if exists admin_facturas on public.facturas;

create policy facturas_lectura on public.facturas
  for select to authenticated
  using (studio_id = public.current_studio_id());
