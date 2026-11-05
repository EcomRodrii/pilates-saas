import type { ArticuloBlog } from '../tipos.ts';

// BORRADOR: sin ruta, sin sitemap y sin RSS. Solo el guion y lo que solo el fundador sabe. No se escribe el texto hasta
// que esas preguntas estén contestadas: una experiencia que no consta no se publica como si lo fuera.

const articulo: ArticuloBlog = {
  estado: 'borrador',
  slug: 'como-construir-un-producto-saas-desde-cero',
  titulo: 'Cómo construir un producto SaaS desde cero',
  categoria: 'tecnologia',
  guion: [
    'Empezar por el problema y no por la tecnología',
    'Qué entra en la primera versión y qué se deja fuera',
    'Las decisiones técnicas que importan (y las que no)',
    'Cobrar, soportar y mantener',
    'Cómo se decide qué construir después',
  ],
  preguntas: [
    '¿Qué incluyó la primera versión y qué dejaste fuera a propósito?',
    '¿Qué decisión técnica te alegras de haber tomado pronto y cuál lamentas?',
    '¿Cómo decides qué construir a continuación?',
    '¿Qué parte fue más difícil de lo que parecía: cobros, soporte, datos, otra?',
    '¿Qué hace un SaaS pequeño que uno grande no puede?',
  ],
};

export default articulo;
