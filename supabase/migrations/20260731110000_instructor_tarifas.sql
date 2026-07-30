-- Tarifa por hora de una instructora (freelance o no) — dato opcional, lo
-- fija quien gestiona el equipo (PROPIETARIO/MANAGER), lo lee la propia
-- instructora sobre SU ficha. Tabla aparte de `instructores` (no una
-- columna) porque supabase-data.ts hace select('*') sobre `instructores` en
-- varios sitios compartidos por toda la app (carga masiva client-side de
-- studio-context, catálogo público) — la RLS de `instructores` da todas las
-- columnas a todo `authenticated` del estudio sin distinción de fila, así que
-- una columna ahí filtraría el dato salarial en el JSON crudo a cualquier
-- compañera, aunque el mapper de React no la use. Mismo motivo que ya
-- separó `mandatos_sepa` (IBAN) del resto de tablas compartidas.

CREATE TABLE IF NOT EXISTS public.instructor_tarifas (
  instructor_id   text PRIMARY KEY REFERENCES public.instructores(id) ON DELETE CASCADE,
  studio_id       text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  tarifa_hora     numeric(5,2),           -- null = sin fijar (dato opcional); tope 999.99
  moneda          text NOT NULL DEFAULT 'EUR',
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid,                    -- auth_user_id de quien la fijó (auditoría mínima)
  CONSTRAINT instructor_tarifas_rango CHECK (tarifa_hora IS NULL OR (tarifa_hora >= 0 AND tarifa_hora <= 999.99))
);

CREATE INDEX IF NOT EXISTS idx_instructor_tarifas_studio ON public.instructor_tarifas (studio_id);

ALTER TABLE public.instructor_tarifas ENABLE ROW LEVEL SECURITY;

-- Espejo SQL de lib/permisos-reglas.ts:puedeGestionarEquipo (hoy no existe en
-- SQL). Mismo patrón que puede_mover_dinero()/puede_ver_finanzas().
CREATE OR REPLACE FUNCTION public.puede_gestionar_equipo() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT public.current_rol() IN ('PROPIETARIO', 'MANAGER');
  $$;

COMMENT ON FUNCTION public.puede_gestionar_equipo() IS
  'Roles que pueden dar de alta/editar al equipo (incl. tarifas). Espejo SQL de lib/permisos-reglas.ts:puedeGestionarEquipo.';

GRANT EXECUTE ON FUNCTION public.puede_gestionar_equipo() TO authenticated;

-- Propietaria/manager: control total sobre las tarifas de su estudio.
CREATE POLICY tarifas_gestion ON public.instructor_tarifas FOR ALL TO authenticated
  USING (studio_id = public.current_studio_id() AND public.puede_gestionar_equipo())
  WITH CHECK (studio_id = public.current_studio_id() AND public.puede_gestionar_equipo());

-- Instructora: SOLO LECTURA de su propia fila. Nunca escritura — la tarifa
-- la fija quien gestiona el equipo, no ella misma.
CREATE POLICY tarifas_propia_lectura ON public.instructor_tarifas FOR SELECT TO authenticated
  USING (studio_id = public.current_studio_id() AND instructor_id = public.current_instructor_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instructor_tarifas TO authenticated, service_role;
