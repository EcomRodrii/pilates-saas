-- ═══════════════════════════════════════════════════════════════════════════
-- Borrador/publicado para los temas ZIP importados
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `theme_imports` ya es una tabla de VARIAS filas por estudio (un ZIP subido
-- es una fila) — a diferencia de `studio_theme` (una fila por estudio), aquí
-- "publicar" significa "marcar cuál de los ZIPs subidos es el elegido", no
-- "sustituir borrador por publicado dentro de la misma fila".
--
-- ⚠️ Alcance explícito, decidido con el usuario: esto es un estado INTERNO
-- del panel. No cambia lo que ve una socia real en el portal — no existe hoy
-- ninguna ruta que sirva un tema importado fuera del iframe en sandbox del
-- editor (ver el comentario de seguridad en
-- app/api/theme/importado/[id]/[[...ruta]]/route.ts). Servirlo de verdad en
-- el portal público exige o bien reabrir esa decisión de sandboxing, o bien
-- un origen dedicado (subdominio sin cookies) — ninguna de las dos se decide
-- en esta migración.
--
-- Reversible: quitar la columna y el índice.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.theme_imports
  ADD COLUMN publicado boolean NOT NULL DEFAULT false,
  ADD COLUMN publicado_en timestamp with time zone;

-- Como mucho UN tema "publicado" (elegido) por estudio a la vez — mismo
-- principio que un solo `config_published` en `studio_theme`, aplicado aquí
-- como restricción real de esquema en vez de confiar en que el endpoint
-- despublique a mano sin fallar nunca.
CREATE UNIQUE INDEX theme_imports_un_publicado_por_estudio
  ON public.theme_imports (studio_id)
  WHERE publicado;
