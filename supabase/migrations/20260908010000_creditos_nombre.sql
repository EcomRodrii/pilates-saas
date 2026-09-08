-- ═══════════════════════════════════════════════════════════════════════════
-- Cómo llama cada estudio a su moneda de fidelización.
--
-- Hasta ahora la palabra «créditos» estaba escrita a mano en catorce sitios,
-- siete de ellos en la app de la alumna. Un estudio que quiere llamarlos
-- «puntos», «estrellas» o como su marca no tenía dónde decirlo.
--
-- NULL = usa el nombre por defecto del producto. Se guarda NULL también cuando
-- el estudio teclea literalmente «créditos» (ver `normalizarNombreCreditos`):
-- si mañana el producto cambia esa palabra, quien la tecleó a mano se habría
-- quedado congelado con la vieja, y nadie entendería por qué.
--
-- Sin CHECK de longitud: el recorte va en el guardado (24 caracteres), que es
-- donde se puede avisar. Un CHECK aquí convertiría un nombre largo en un error
-- 500 en vez de en un campo recortado.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.studios
  add column if not exists creditos_nombre text;

comment on column public.studios.creditos_nombre is
  'Nombre en PLURAL de la moneda de fidelización («puntos», «estrellas»). NULL = el por defecto del producto.';
