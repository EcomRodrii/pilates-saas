-- planes_tarifa: la última tabla de dinero cuya política no miraba el rol.
--
-- Venía de 0000_base.sql: `admin_planes_tarifa ... FOR ALL ... USING (studio_id
-- = current_studio_id())`. Solo comprobaba el ESTUDIO, no quién eres dentro de
-- él, así que cualquier instructora podía cambiar el precio de los bonos, crear
-- planes o borrarlos desde la consola del navegador. Ni 0112 (escrituras de
-- dinero) ni 0114 (lecturas) ni 0118 (clientas y citas) la tocaron.
--
-- Mismo patrón que esas tres: LEER lo puede todo el personal —el calendario y
-- la ficha necesitan saber qué planes existen— y ESCRIBIR exige
-- `puede_mover_dinero()`, la función que ya creó 0112 y que es el espejo en SQL
-- de `puedeMoverDinero` en lib/permisos-reglas.ts. Un plan es un precio: quien
-- no puede cobrar tampoco debería poder decidir cuánto se cobra.
drop policy if exists admin_planes_tarifa on public.planes_tarifa;

create policy planes_tarifa_lectura on public.planes_tarifa
  for select to authenticated
  using (studio_id = public.current_studio_id());

create policy planes_tarifa_escritura_insert on public.planes_tarifa
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());

create policy planes_tarifa_escritura_update on public.planes_tarifa
  for update to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero())
  with check (studio_id = public.current_studio_id() and public.puede_mover_dinero());

create policy planes_tarifa_escritura_delete on public.planes_tarifa
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.puede_mover_dinero());
