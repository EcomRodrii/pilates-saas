-- ═══════════════════════════════════════════════════════════════════════════
-- 33ª pasada de auditoría — `posts_comunidad.comentarios_count` se incrementaba
-- con lectura-luego-escritura en TS, no atómico.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `app/api/comunidad/comentarios/route.ts` y su gemelo público leían
-- `post.comentarios_count` unas líneas antes y escribían `+ 1` sobre ese
-- valor. Dos comentarios casi simultáneos sobre el mismo post (dos socias, o
-- una socia y el staff) podían pisarse: los dos leen el mismo valor antes de
-- que el otro escriba, y el contador queda uno por debajo de los comentarios
-- reales. Cosmético (solo afecta a la tarjeta del feed y al ranking de
-- "miembros más activos"; el comentario en sí nunca se pierde), pero el
-- arreglo correcto es trivial: mover la suma a SQL.
CREATE OR REPLACE FUNCTION public.ajustar_comentarios_count(
  p_post_id text,
  p_studio_id text,
  p_delta integer
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.posts_comunidad
     SET comentarios_count = GREATEST(0, comentarios_count + p_delta)
   WHERE id = p_post_id AND studio_id = p_studio_id;
$$;

-- Solo servidor: los dos endpoints que la llaman ya usan `getSupabaseAdmin()`
-- (el rol/audiencia se comprueba antes, en la ruta). Firma nueva → EXECUTE por
-- defecto a PUBLIC en este proyecto — los tres pasos explícitos, sin excepción.
REVOKE ALL ON FUNCTION public.ajustar_comentarios_count(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_comentarios_count(text, text, integer) TO service_role;

COMMENT ON FUNCTION public.ajustar_comentarios_count(text, text, integer) IS
  'Comunidad: incremento/decremento ATÓMICO de posts_comunidad.comentarios_count (33ª pasada de auditoría) — antes se leía y sumaba en TS, perdiendo incrementos bajo comentarios concurrentes. GREATEST(0, ...) evita negativos si algún día se borra un comentario.';
