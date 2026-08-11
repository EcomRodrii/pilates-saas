-- Bio pública de la instructora (P1 auditoría Momence-vs-Tentare, ver
-- memoria auditoria-momence-vs-tentare-widget.md): en Pilates boutique se
-- reserva por la persona, no solo por el horario. Nullable — sin bio no se
-- muestra nada (no se inventa un placeholder). Público por diseño: pasa por
-- mapInstructorPublico() (lib/db/supabase-data-admin.ts) tal cual, que filtra
-- por sustracción (email/telefono/authUserId a null) sobre un select('*') —
-- este campo SÍ debe llegar al catálogo público.
ALTER TABLE public.instructores ADD COLUMN bio text;
