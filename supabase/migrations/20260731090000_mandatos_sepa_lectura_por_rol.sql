-- mandatos_sepa_lectura (0122) cerró la escritura con puede_mover_dinero() pero
-- dejó la LECTURA abierta a cualquier `authenticated` del estudio — el mismo
-- patrón que ya costó dos agujeros (facturación en 0112, clientas/citas en
-- 0118): la RLS es la cerradura real, y esta puerta seguía sin cerradura por
-- rol. Efecto real: una instructora recibe el IBAN completo de cada socia en
-- la carga masiva de studio-context (dbGetMandatosSepa corre para toda sesión
-- de staff, no solo para /cobros), y puede leerlo también en directo contra
-- el endpoint REST de Supabase con su propio JWT.
--
-- puede_ver_finanzas() (== puede_mover_dinero() hoy, pero es la pregunta
-- correcta: "puede VER la facturación", no "puede tocar dinero") ya existe
-- desde 0112 para este mismo propósito en otras tablas.
drop policy if exists mandatos_sepa_lectura on public.mandatos_sepa;

create policy mandatos_sepa_lectura on public.mandatos_sepa
  for select to authenticated
  using (studio_id = public.current_studio_id() and public.puede_ver_finanzas());
