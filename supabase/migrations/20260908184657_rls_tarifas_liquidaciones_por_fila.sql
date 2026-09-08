-- ═══════════════════════════════════════════════════════════════════════════
-- 30ª pasada de auditoría — la RLS de tarifas/liquidaciones no distinguía
-- fila, igual que la app SÍ lo hace desde la auditoría del 2026-08-21.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `app/api/equipo/{tarifas,liquidaciones}` y las Server Actions equivalentes
-- comprueban `puedeGestionarFichaDe(rolActor, rolFicha)` (lib/permisos-reglas.ts)
-- antes de dejar a un MANAGER tocar la tarifa/liquidación de otra persona: un
-- MANAGER puede gestionar RECEPCION/INSTRUCTOR, pero NUNCA a la PROPIETARIA
-- ni a otro MANAGER. Ese guard vive en las Server Actions, que llaman a
-- `getSupabaseAdmin()` (service_role) — la RLS de `instructor_tarifas` y
-- `liquidaciones_instructoras` seguía siendo `puede_gestionar_equipo()` a
-- secas (PROPIETARIO o MANAGER, SIN distinguir fila). La app estaba bien; la
-- cerradura real —la RLS, que sí se aplica a `authenticated` con su propio
-- JWT llamando directo a PostgREST, sin pasar por la app— no.
--
-- Con esto, un MANAGER con su token podía leer o escribir directo por REST
-- la tarifa/liquidación de la propietaria u otro manager, incluida la
-- transición a PAGADA con una `referencia_pago` inventada — el mismo dato
-- salarial que `instructor_tarifas` se separó de `instructores` para no
-- filtrar (comentario de 20260731110000), filtrado igual por el otro lado.
--
-- `puede_gestionar_ficha_instructor` es el espejo SQL exacto de
-- `puedeGestionarFichaDe`, parametrizado por `instructor_id` para poder
-- usarlo en `USING`/`WITH CHECK`.
CREATE OR REPLACE FUNCTION public.puede_gestionar_ficha_instructor(p_instructor_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_rol() = 'PROPIETARIO'
    OR (
      public.current_rol() = 'MANAGER'
      AND EXISTS (
        SELECT 1 FROM public.instructores i
         WHERE i.id = p_instructor_id
           AND i.studio_id = public.current_studio_id()
           AND i.rol IN ('RECEPCION', 'INSTRUCTOR')
      )
    );
$$;

COMMENT ON FUNCTION public.puede_gestionar_ficha_instructor(text) IS
  'Espejo SQL de lib/permisos-reglas.ts:puedeGestionarFichaDe. Un MANAGER no gestiona la ficha (tarifa/liquidación) de la PROPIETARIA ni de otro MANAGER — mismo criterio que ya cerró la escalada en /api/equipo/{tarifas,liquidaciones} el 2026-08-21, extendido aquí a RLS (30ª pasada de auditoría, 2026-09-08).';

GRANT EXECUTE ON FUNCTION public.puede_gestionar_ficha_instructor(text) TO authenticated;

-- `instructor_tarifas`: reemplaza el guard de estudio-entero por el de fila.
DROP POLICY IF EXISTS tarifas_gestion ON public.instructor_tarifas;
CREATE POLICY tarifas_gestion ON public.instructor_tarifas FOR ALL TO authenticated
  USING (studio_id = public.current_studio_id() AND public.puede_gestionar_ficha_instructor(instructor_id))
  WITH CHECK (studio_id = public.current_studio_id() AND public.puede_gestionar_ficha_instructor(instructor_id));

-- `liquidaciones_instructoras`: mismo criterio.
DROP POLICY IF EXISTS liquidaciones_gestion ON public.liquidaciones_instructoras;
CREATE POLICY liquidaciones_gestion ON public.liquidaciones_instructoras FOR ALL TO authenticated
  USING (studio_id = public.current_studio_id() AND public.puede_gestionar_ficha_instructor(instructor_id))
  WITH CHECK (studio_id = public.current_studio_id() AND public.puede_gestionar_ficha_instructor(instructor_id));
