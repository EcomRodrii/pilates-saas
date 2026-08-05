-- Horario de apertura/cierre del estudio, por día de la semana.
--
-- Antes `studios.hora_apertura`/`hora_cierre` (migr. 20260731125841) era un
-- único horario para los 7 días, y encima el calendario nunca lo usaba para
-- decidir si el estudio estaba "cerrado" un día concreto: `vacio` en
-- lib/calendario-columnas.ts se calculaba solo por ausencia de sesiones, así
-- que un día sin clases se pintaba "Cerrado" aunque el estudio SÍ trabajara
-- ese día — el dato real (horario configurado) nunca cruzaba con el día de
-- la semana. Esta tabla es el dato que faltaba; la corrección de
-- lib/calendario-columnas.ts (que distingue "Cerrado" de "Sin clases") va en
-- el mismo cambio, no en una migración aparte.
--
-- Mismo patrón que `instructora_disponibilidad` (0037): rejilla día×horario,
-- RLS por fila, sin JSONB (para poder hacer WHERE/constraints por día). Las
-- columnas viejas de `studios` NO se tocan (siguen siendo el fallback de
-- app/api/calendario/route.ts si un estudio no tuviera ninguna fila aquí).
CREATE TABLE IF NOT EXISTS public.studio_horario (
  studio_id       text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  dia_semana      smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=domingo..6=sábado (EXTRACT(DOW), mismo criterio que lib/sustituciones/franjas.ts)
  abierto         boolean NOT NULL DEFAULT true,
  hora_apertura   time,  -- NULL si abierto=false
  hora_cierre     time,  -- NULL si abierto=false
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (studio_id, dia_semana),
  CONSTRAINT studio_horario_horas_si_abierto CHECK (abierto = false OR (hora_apertura IS NOT NULL AND hora_cierre IS NOT NULL)),
  CONSTRAINT studio_horario_rango CHECK (abierto = false OR hora_apertura < hora_cierre)
);

ALTER TABLE public.studio_horario ENABLE ROW LEVEL SECURITY;

-- Lectura: todo el personal del estudio (INSTRUCTOR incluida, ve el calendario).
CREATE POLICY studio_horario_lectura ON public.studio_horario FOR SELECT TO authenticated
  USING (studio_id = public.current_studio_id());

-- Escritura: solo PROPIETARIO — es configuración de negocio, no operación del
-- día a día del calendario (mismo criterio que el resto de `/configuracion`,
-- ver BLOQUEADO_RECEPCION/BLOQUEADO_MANAGER en lib/permisos-reglas.ts).
CREATE POLICY studio_horario_escritura ON public.studio_horario FOR ALL TO authenticated
  USING (studio_id = public.current_studio_id() AND public.current_rol() = 'PROPIETARIO')
  WITH CHECK (studio_id = public.current_studio_id() AND public.current_rol() = 'PROPIETARIO');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_horario TO authenticated, service_role;

-- Backfill: todo estudio existente queda con los 7 días abiertos, al horario
-- que ya tenía configurado (o el default 08:00–22:00) — cero pérdida de dato,
-- ningún estudio amanece "cerrado" por sorpresa tras este cambio.
INSERT INTO public.studio_horario (studio_id, dia_semana, abierto, hora_apertura, hora_cierre)
SELECT s.id, d.dia, true, s.hora_apertura, s.hora_cierre
FROM public.studios s CROSS JOIN generate_series(0, 6) AS d(dia)
ON CONFLICT (studio_id, dia_semana) DO NOTHING;
