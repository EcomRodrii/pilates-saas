// Ayudantes ligeros del blog (sin importar el texto de los artículos, para que el cliente pueda usarlos). Sin alias `@/`.

import { RUTA_AUTOR } from './autor.ts';
import type { ArticuloBlogPublicado, SeccionBlog } from './tipos.ts';

export const urlArticuloBlog = (slug: string): string => `${RUTA_AUTOR}/${slug}`;

/** La fecha efectiva del contenido: la de la última revisión si la hay. */
export const fechaArticuloBlog = (a: Pick<ArticuloBlogPublicado, 'publicado' | 'actualizado'>): string => a.actualizado ?? a.publicado;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «5 de noviembre de 2026» desde AAAA-MM-DD, sin pasar por `Date` (nada de husos horarios). */
export function fechaLargaBlog(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`;
}

/** El texto plano de un fragmento con marcado mínimo: sin **negritas** ni [enlaces](/ruta). */
export function textoPlanoBlog(t: string): string {
  return t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

export function textoDeSecciones(secciones: readonly SeccionBlog[]): string {
  const partes: string[] = [];
  for (const s of secciones) {
    partes.push(s.titulo);
    for (const b of s.bloques) {
      if (b.t === 'p' || b.t === 'cita') partes.push(textoPlanoBlog(b.texto));
      else if (b.t === 'lista') partes.push(...b.items.map(textoPlanoBlog));
      else partes.push(b.titulo, textoPlanoBlog(b.texto));
    }
  }
  return partes.join(' ');
}

export function contarPalabrasBlog(t: string): number {
  return t.trim().split(/\s+/).filter(Boolean).length;
}

/** Minutos de lectura (a 220 palabras por minuto), mínimo 1. */
export function minutosLecturaBlog(a: Pick<ArticuloBlogPublicado, 'entradilla' | 'secciones' | 'faq'>): number {
  const texto = [a.entradilla, textoDeSecciones(a.secciones), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join(' ');
  return Math.max(1, Math.round(contarPalabrasBlog(texto) / 220));
}

/** Los metadatos de un artículo SIN su cuerpo: lo que necesitan el registro SEO, el listado y el RSS (lib/blog/meta.ts). */
export interface ArticuloBlogMeta {
  slug: string;
  titulo: string;
  tituloSeo: string;
  descripcion: string;
  resumen: string;
  categoria: ArticuloBlogPublicado['categoria'];
  publicado: string;
  actualizado?: string;
  destacado?: boolean;
  entradilla: string;
  minutos: number;
  enlaces: string[];
}

export function metaBlogDe(a: ArticuloBlogPublicado): ArticuloBlogMeta {
  return {
    slug: a.slug,
    titulo: a.titulo,
    tituloSeo: a.tituloSeo,
    descripcion: a.descripcion,
    resumen: a.resumen,
    categoria: a.categoria,
    publicado: a.publicado,
    ...(a.actualizado ? { actualizado: a.actualizado } : {}),
    ...(a.destacado ? { destacado: true } : {}),
    entradilla: a.entradilla,
    minutos: minutosLecturaBlog(a),
    enlaces: a.enlaces ?? [],
  };
}
