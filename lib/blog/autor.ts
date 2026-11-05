// El autor del blog personal: Marcos Roca Rodríguez, fundador de Tentare. FUENTE ÚNICA de su nombre, su cargo, su
// @id y sus datos: la página de autor, el JSON-LD de cada artículo, la firma de las guías de /recursos y la
// Organization (`founder`) salen de aquí.
//
// ⚠️ Solo hechos verificables. Cada línea de aquí consta en otro sitio público del propio sitio (el aviso legal da el
// titular y el domicilio; /sobre-tentare dice quién la mantiene y que firma las guías) o la dio el fundador para esta
// página (edad y ciudad). NO se inventa experiencia, premios, financiación, facturación ni resultados. Si algún día
// hay algo más que contar, lo escribe el fundador.
//
// Sin alias `@/`: lo leen `node --test`, el registro SEO y los scripts.

import { LEGAL } from '../legal-info.ts';

export const RUTA_BLOG = '/blog';
export const RUTA_AUTOR = '/blog/marcos-roca';

/** `@id` del Person en TODO el sitio: se define en la página de autor y lo referencian la Organization y cada artículo. */
export const ID_AUTOR = `${LEGAL.url}${RUTA_AUTOR}#persona`;
/** `@id` del Blog: el mismo en el listado y en el `isPartOf` de cada artículo. */
export const ID_BLOG_PERSONAL = `${LEGAL.url}${RUTA_BLOG}#blog`;

/**
 * Perfil personal de LinkedIn de Marcos, o `null` hasta que el fundador dé el real.
 * ⚠️ NO se inventa ni se adivina una URL: con `null` ni se pinta el enlace ni entra en `sameAs`. La de la EMPRESA
 * (linkedin.com/company/tentare) es de Tentare, no suya, y se enseña aparte.
 */
export const LINKEDIN_PERSONAL: string | null = null;
export const LINKEDIN_TENTARE = 'https://www.linkedin.com/company/tentare/';

export const AUTOR_BLOG = {
  nombre: LEGAL.titular, // «Marcos Roca Rodríguez», tal como consta en el aviso legal
  nombreCorto: 'Marcos Roca',
  cargo: 'Fundador de Tentare',
  cargoEn: 'Founder of Tentare',
  ciudad: 'Barcelona',
  pais: 'España',
  /** La dio el fundador para esta página. Cambia cada año: la edad no se guarda en el JSON-LD. */
  edad: 23,
  edadAl: 'noviembre de 2026',
  /** De qué escribe. */
  especialidades: ['Emprendimiento', 'Tecnología', 'SaaS', 'Startups', 'Desarrollo de producto', 'Negocios'],
  /** Los temas del JSON-LD `knowsAbout`: solo lo que de verdad hace o escribe. */
  conoceDe: [
    'Software de gestión para estudios de Pilates y yoga',
    'Desarrollo de producto SaaS',
    'Emprendimiento',
    'Startups',
  ],
  /** Foto provisional: ver public/blog/. Cambiarla es cambiar estos ficheros, no el diseño. */
  foto: {
    base: '/blog/marcos-roca-retrato',
    anchos: [480, 800] as const,
    ancho: 800,
    alto: 1000,
    alt: 'Marcos Roca Rodríguez, fundador de Tentare, con traje azul marino y camisa blanca',
  },
  /** La imagen para redes (1200×630), con URL propia. */
  og: { ruta: '/blog/marcos-roca-og.jpg', ancho: 1200, alto: 630 },
} as const;

/** Fecha real de la última revisión del perfil (sitemap y JSON-LD). Cambia cuando cambie la biografía. */
export const FECHA_PERFIL = '2026-11-05';

export const URL_AUTOR = `${LEGAL.url}${RUTA_AUTOR}`;
export const URL_BLOG = `${LEGAL.url}${RUTA_BLOG}`;
