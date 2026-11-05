import type { ArticuloBlog } from '../tipos.ts';

// BORRADOR: sin ruta, sin sitemap y sin RSS. Solo el guion y lo que solo el fundador sabe. No se escribe el texto hasta
// que esas preguntas estén contestadas: una experiencia que no consta no se publica como si lo fuera.

const articulo: ArticuloBlog = {
  estado: 'borrador',
  slug: 'los-retos-de-emprender-con-23-anos',
  titulo: 'Los retos de emprender con 23 años',
  categoria: 'emprendimiento',
  guion: [
    'Qué cambia (y qué no) por empezar joven',
    'Convencer a quien no te conoce',
    'Decidir sin experiencia previa en el sector',
    'Dinero, tiempo y energía',
    'Lo que se aprende antes de lo previsto',
  ],
  preguntas: [
    '¿Qué reto concreto no esperabas?',
    '¿Cómo has ganado la confianza de los primeros estudios que usan Tentare?',
    '¿Qué consejo te ha servido y cuál ignorarías?',
    '¿Cómo compaginas la empresa con el resto de tu vida?',
    '¿Qué le dirías a alguien de tu edad que quiere emprender?',
  ],
};

export default articulo;
