import type { ArticuloBlog } from '../tipos.ts';

// BORRADOR: sin ruta, sin sitemap y sin RSS. Solo el guion y lo que solo el fundador sabe. No se escribe el texto hasta
// que esas preguntas estén contestadas: una experiencia que no consta no se publica como si lo fuera.

const articulo: ArticuloBlog = {
  estado: 'borrador',
  slug: 'por-que-decidi-construir-tentare',
  titulo: 'Por qué decidí construir Tentare',
  categoria: 'construccion-de-tentare',
  guion: [
    'El momento en que aparece la idea',
    'Qué problema había en los estudios de Pilates y cómo se llegó a verlo',
    'Qué alternativas existían y por qué no bastaban',
    'Las primeras decisiones de producto',
    'Lo que salió mal al principio',
    'Lo que todavía no se sabe',
  ],
  preguntas: [
    '¿Cuándo y cómo surgió la idea de Tentare?',
    '¿Cuál era tu relación con el Pilates o con los estudios antes de empezar?',
    '¿Qué viste que no funcionaba en el software que usaban los estudios?',
    '¿Con qué estudio hablaste primero y qué te dijo?',
    '¿Qué decisión te costó más tomar?',
  ],
};

export default articulo;
