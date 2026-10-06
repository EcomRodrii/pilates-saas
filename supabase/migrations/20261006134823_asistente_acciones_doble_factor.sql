-- La restrictiva de 20261003102845 en toda tabla con RLS (supabase/tests/rls-doble-factor.test.ts).
create policy exige_doble_factor on public.asistente_acciones as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
