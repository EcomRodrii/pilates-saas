-- Paso 4 de docs/marketing-integrations-arquitectura.md §8: el envío de una
-- campaña pasa de orquestarse en el navegador a encolarse en servidor
-- (Inngest). El endpoint que encola marca la campaña 'ENVIANDO' y devuelve
-- inmediato; el job la deja en 'ENVIADA' al terminar.
ALTER TABLE public.campanas DROP CONSTRAINT campanas_estado_check;
ALTER TABLE public.campanas ADD CONSTRAINT campanas_estado_check
  CHECK (estado = ANY (ARRAY['BORRADOR'::text, 'PROGRAMADA'::text, 'ENVIANDO'::text, 'ENVIADA'::text, 'ACTIVA'::text, 'PAUSADA'::text]));
