-- 0118: de dónde viene una nueva alta de estudio (marketing), pregunta opcional
-- en app/crear-estudio. Sin FK ni CHECK: son opciones de un <select> de la UI,
-- no un catálogo con reglas propias, y "Otro" es intencional además de las
-- fijas — un CHECK se rompería en cuanto se añada una opción nueva en el front.
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS como_nos_conocio text;
