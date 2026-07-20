-- Ficha Clínica Operativa — Fase 1 (núcleo). Ver FICHA-CLINICA.md §1.
-- Dato de salud sensible: el control de acceso vive en la capa de servidor/UI
-- (FICHA-CLINICA.md §11), no en RLS — coherente con el resto del esquema, que
-- opera con service_role y filtra por studio_id en la aplicación.
-- Reversible: el DROP de estas tablas no afecta a ninguna tabla existente.

-- Episodios del perfil de salud: lesiones, embarazo, condiciones crónicas...
-- Cada fila es un hito de la línea de tiempo (§6). Las restricciones se guardan
-- como códigos validados en lib/ficha-clinica.ts (§2), no como texto libre.
CREATE TABLE IF NOT EXISTS public.condiciones_salud (
    id             text PRIMARY KEY,
    studio_id      text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    socio_id       text NOT NULL REFERENCES public.socios(id)  ON DELETE CASCADE,
    categoria      text NOT NULL CHECK (categoria IN
                     ('LESION','EMBARAZO','POSTPARTO','CRONICA','PROTESIS','OTRO')),
    etiqueta       text NOT NULL,
    zona           text CHECK (zona IN
                     ('RODILLA','COLUMNA','HOMBRO','CADERA','CUELLO','MUNECA','TOBILLO','GENERAL')),
    restricciones  text[] NOT NULL DEFAULT '{}',
    severidad      text NOT NULL DEFAULT 'MEDIA' CHECK (severidad IN ('LEVE','MEDIA','ALTA')),
    estado         text NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA','RESUELTA')),
    inicio         date NOT NULL,
    fin            date,
    revisar_en     date,
    notas          text,
    creado_por     text,
    creado_en      timestamptz DEFAULT now(),
    actualizado_en timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS condiciones_socio    ON public.condiciones_salud (socio_id, inicio DESC);
CREATE INDEX IF NOT EXISTS condiciones_activas  ON public.condiciones_salud (studio_id, estado) WHERE estado = 'ACTIVA';
CREATE INDEX IF NOT EXISTS condiciones_revision ON public.condiciones_salud (studio_id, revisar_en)
  WHERE revisar_en IS NOT NULL AND estado = 'ACTIVA';

-- Evolución post-clase (§8): dato categórico de 1 clic cuyo valor está en la
-- serie temporal. Fase 2 escribe aquí; la tabla se crea ya para no fragmentar
-- la migración de la ficha.
CREATE TABLE IF NOT EXISTS public.respuestas_sesion (
    id          text PRIMARY KEY,
    studio_id   text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    socio_id    text NOT NULL REFERENCES public.socios(id)  ON DELETE CASCADE,
    sesion_id   text REFERENCES public.sesiones(id) ON DELETE SET NULL,
    respuesta   text NOT NULL CHECK (respuesta IN ('MEJOR','IGUAL','MOLESTIAS','DOLOR')),
    nota        text,
    creado_por  text,
    creado_en   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS respuestas_socio ON public.respuestas_sesion (socio_id, creado_en DESC);
