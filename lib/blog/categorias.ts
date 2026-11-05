// Las seis categorías editoriales del blog personal del fundador. El `slug` es el que lleva cada artículo
// (`categoria`) y el ancla de /blog (`#emprendimiento`). Sin alias `@/`: lo leen `node --test` y el registro SEO.

export type CategoriaBlog =
  | 'emprendimiento'
  | 'startups'
  | 'tecnologia'
  | 'construccion-de-tentare'
  | 'negocios'
  | 'reflexiones';

export interface InfoCategoriaBlog {
  slug: CategoriaBlog;
  nombre: string;
  /** Una frase: qué se publica aquí. */
  descripcion: string;
}

export const CATEGORIAS_BLOG: readonly InfoCategoriaBlog[] = [
  { slug: 'emprendimiento', nombre: 'Emprendimiento', descripcion: 'Empezar, decidir y aguantar construyendo algo propio.' },
  { slug: 'startups', nombre: 'Startups', descripcion: 'Cómo se monta y se hace crecer una empresa de tecnología.' },
  { slug: 'tecnologia', nombre: 'Tecnología', descripcion: 'Decisiones técnicas detrás de un producto de software.' },
  { slug: 'construccion-de-tentare', nombre: 'Construcción de Tentare', descripcion: 'Cómo se construye Tentare, contado por quien la construye.' },
  { slug: 'negocios', nombre: 'Negocios', descripcion: 'Modelo de negocio, precios y estrategia.' },
  { slug: 'reflexiones', nombre: 'Reflexiones', descripcion: 'Ideas sueltas sobre emprender y trabajar con tecnología.' },
];

export function categoriaBlog(slug: string): InfoCategoriaBlog | undefined {
  return CATEGORIAS_BLOG.find((c) => c.slug === slug);
}
