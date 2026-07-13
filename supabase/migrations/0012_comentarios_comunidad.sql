-- ═══════════════════════════════════════════════════════════════════════════
-- 0012 · Comentarios de Comunidad — persistencia (antes solo en memoria)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (ronda de conectividad "que todo tenga conexión")
-- La página /comunidad dejaba escribir comentarios en los posts, pero
-- `handleAddComment` solo los metía en un useState (`commentsMap`): al refrescar
-- se perdían. Los POSTS sí persisten (tabla posts_comunidad, con la columna
-- comentarios_count ya lista), pero los comentarios no tenían tabla. Esta
-- migración la crea, replicando la estructura y postura de seguridad de
-- posts_comunidad (RLS por estudio).
--
-- El acceso va por /api/comunidad/comentarios con service-role (igual que
-- /api/socios/eliminar), pero se habilita RLS + política scoped por estudio como
-- defensa en profundidad, idéntico a posts_comunidad.
--
-- Reversible: DROP TABLE (additiva, no toca datos existentes).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.comentarios_comunidad (
  id text NOT NULL,
  studio_id text NOT NULL,
  post_id text NOT NULL,
  autor_id text,
  autor_nombre text NOT NULL,
  autor_inicial text,
  texto text NOT NULL,
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT comentarios_comunidad_pkey PRIMARY KEY (id)
);

-- FK al estudio y al post (borrado en cascada: si se borra el post, sus
-- comentarios se van con él; mismo criterio que posts_comunidad→studios).
ALTER TABLE ONLY public.comentarios_comunidad
  ADD CONSTRAINT comentarios_comunidad_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.comentarios_comunidad
  ADD CONSTRAINT comentarios_comunidad_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES public.posts_comunidad(id) ON DELETE CASCADE;

-- La página carga los comentarios del estudio y los agrupa por post.
CREATE INDEX IF NOT EXISTS idx_comentarios_comunidad_studio_post
  ON public.comentarios_comunidad USING btree (studio_id, post_id);

-- RLS por estudio (misma política que posts_comunidad).
ALTER TABLE public.comentarios_comunidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_comentarios_comunidad ON public.comentarios_comunidad
  TO authenticated
  USING ((studio_id = public.current_studio_id()))
  WITH CHECK ((studio_id = public.current_studio_id()));

GRANT ALL ON TABLE public.comentarios_comunidad TO anon;
GRANT ALL ON TABLE public.comentarios_comunidad TO authenticated;
GRANT ALL ON TABLE public.comentarios_comunidad TO service_role;
