-- ═══════════════════════════════════════════════════════════════════════════
-- Personalización total de las plantillas de email + cierre de rol
--
-- Hasta ahora la propietaria solo podía tocar dos cosas de un correo: el asunto
-- y el párrafo de introducción. Todo lo demás —el cuerpo, el botón, la banda de
-- color, el logo, el pie, la tipografía— venía fijo del producto. Esto abre las
-- seis plantillas editables de par en par.
--
-- Mismo patrón "hereda" que ya usan tipos_clase.ventana_cancelacion_horas y las
-- reglas de reserva: TODA columna nueva es nullable y NULL significa "usa lo de
-- siempre". Una fila existente sin tocar se comporta exactamente igual que
-- antes de esta migración; no hay backfill ni valor por defecto que cambie nada.
--
-- ⚠️ SEGUNDA PARTE, no cosmética: la política de esta tabla era
--   admin_plantillas_email TO authenticated USING (studio_id = current_studio_id())
-- sin distinguir rol, y la escritura va DIRECTA desde el cliente
-- (lib/studio-context.tsx → dbUpsertPlantillaEmail), así que la RLS es la única
-- cerradura real. Cualquier miembro autenticado del estudio —una instructora—
-- podía reescribir los correos que salen a todas las clientas bajo la marca del
-- estudio. Que /configuracion esté bloqueado para RECEPCION y MANAGER es la UI,
-- y en este repo la UI nunca es el límite de seguridad.
--
-- Con el cuerpo entero editable eso pasa de "cambiar una frase" a "redactar lo
-- que quieras y que salga firmado por el estudio", así que se cierra aquí, en la
-- misma tanda que lo abre. PROPIETARIO es exactamente el mismo criterio que ya
-- aplica la ruta: /configuracion está en BLOQUEADO_RECEPCION y BLOQUEADO_MANAGER
-- (lib/permisos-reglas.ts).
--
-- Reversible: las columnas se pueden DROP y la política anterior se puede
-- recrear tal cual está transcrita más abajo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Columnas de personalización (todas nullable = hereda) ────────────────

ALTER TABLE public.plantillas_email
  -- Cuerpo del correo en Markdown, con dos tokens propios que la propietaria
  -- coloca donde quiera: {datos} (la tarjeta de fecha/hora/sala/importe...) y
  -- {boton} (la llamada a la acción). Si no pone {datos}, no salen los datos:
  -- es su decisión. NULL = se mantiene el cuerpo por defecto de la plantilla y
  -- sigue mandando la columna `intro` de siempre.
  --
  -- El Markdown se SANEA antes de renderizar (lib/emails/sanear-markdown.ts):
  -- <Markdown> de react-email deja pasar HTML crudo y enlaces javascript: tal
  -- cual, comprobado. No guardamos HTML aquí a propósito.
  ADD COLUMN IF NOT EXISTS cuerpo text,
  -- Texto de la llamada a la acción. NULL = el de la plantilla.
  ADD COLUMN IF NOT EXISTS boton_texto text,
  -- Marca por plantilla. NULL = hereda de studios (color_primario / logo_url),
  -- que es lo que hace hoy EmailLayout.
  ADD COLUMN IF NOT EXISTS color_cabecera text,
  ADD COLUMN IF NOT EXISTS color_boton text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  -- Pie del correo. NULL = "Enviado por {estudio} · Powered by Tentare · {año}".
  ADD COLUMN IF NOT EXISTS pie text,
  -- Familia tipográfica. Lista cerrada validada en la app (fuentes seguras en
  -- correo); el CHECK de abajo la refuerza en la BD.
  ADD COLUMN IF NOT EXISTS fuente text;

-- Los colores se pintan como fondo de una banda y de un botón, y el contraste
-- del texto de dentro se calcula a partir de ellos (foregroundParaFondo). Un
-- valor que no sea un hex rompería ese cálculo en silencio, así que no se
-- acepta: mejor rechazar el guardado que mandar un correo ilegible.
ALTER TABLE public.plantillas_email
  DROP CONSTRAINT IF EXISTS plantillas_email_colores_hex;
ALTER TABLE public.plantillas_email
  ADD CONSTRAINT plantillas_email_colores_hex CHECK (
    (color_cabecera IS NULL OR color_cabecera ~* '^#[0-9a-f]{6}$')
    AND (color_boton IS NULL OR color_boton ~* '^#[0-9a-f]{6}$')
  );

ALTER TABLE public.plantillas_email
  DROP CONSTRAINT IF EXISTS plantillas_email_fuente_permitida;
ALTER TABLE public.plantillas_email
  ADD CONSTRAINT plantillas_email_fuente_permitida CHECK (
    fuente IS NULL OR fuente IN ('Plus Jakarta Sans', 'Arial', 'Georgia', 'Verdana', 'Times New Roman', 'Courier New')
  );

-- ── 2. Cierre de rol ────────────────────────────────────────────────────────
--
-- Política anterior, transcrita para poder revertir:
--   CREATE POLICY admin_plantillas_email ON public.plantillas_email
--     TO authenticated
--     USING ((studio_id = public.current_studio_id()))
--     WITH CHECK ((studio_id = public.current_studio_id()));

DROP POLICY IF EXISTS admin_plantillas_email ON public.plantillas_email;

CREATE POLICY admin_plantillas_email ON public.plantillas_email
  TO authenticated
  USING (((SELECT public.current_rol()) = 'PROPIETARIO'::text) AND (studio_id = (SELECT public.current_studio_id())))
  WITH CHECK (((SELECT public.current_rol()) = 'PROPIETARIO'::text) AND (studio_id = (SELECT public.current_studio_id())));

-- El envío real de correos NO pasa por esta política: resolverPlantilla lee con
-- service-role (getSupabaseAdmin), que salta la RLS. Cerrar la escritura a
-- PROPIETARIO no deja a ninguna clienta sin su correo.

COMMENT ON COLUMN public.plantillas_email.cuerpo IS
  'Cuerpo en Markdown con los tokens {datos} y {boton}. NULL = cuerpo por defecto de la plantilla. Se sanea antes de renderizar.';
COMMENT ON COLUMN public.plantillas_email.fuente IS
  'Familia tipográfica (lista cerrada de fuentes seguras en correo). NULL = Plus Jakarta Sans.';
