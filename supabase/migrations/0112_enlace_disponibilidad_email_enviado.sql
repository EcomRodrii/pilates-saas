-- ─────────────────────────────────────────────────────────────────────────────
-- P2-10. "Disponibilidad por franjas de 8h y solo rellenable vía enlace — con
-- 18 personas es inviable."
--
-- Investigado antes de tocar código: el motor de asignación (rankear_candidatas,
-- 0038) ya compara contra las horas REALES guardadas en instructora_disponibilidad,
-- no contra el concepto de "franja" — eso es solo la rejilla de toques del
-- formulario. Afinar la rejilla a bloques más finos no cambiaría ni una sola
-- sugerencia: el algoritmo ya es tan preciso como lo que se guarda.
--
-- El cuello de botella de verdad es mandar y hacer seguimiento de 18 enlaces:
-- hoy la propietaria los genera uno a uno, los copia y los reenvía ella misma
-- por WhatsApp/email — y el sistema no registra si un enlace se ha mandado ni
-- cuándo. `instructor_enlaces_vigentes` (0057) ya guarda el enlace vigente por
-- instructora+scope; esta columna añade CUÁNDO se envió por última vez el email
-- de ese enlace, para poder decir "enviado hace 3 días, sigue sin responder" en
-- vez de nada.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.instructor_enlaces_vigentes
  add column if not exists email_enviado_en timestamptz;

comment on column public.instructor_enlaces_vigentes.email_enviado_en is
  'Última vez que se envió por email el enlace vigente de este scope. NULL = nunca se ha enviado por email (pudo copiarse a mano).';
