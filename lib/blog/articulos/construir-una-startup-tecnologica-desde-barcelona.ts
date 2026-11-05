import type { ArticuloBlog } from '../tipos.ts';

// BORRADOR: sin ruta, sin sitemap y sin RSS. Solo el guion y lo que solo el fundador sabe. No se escribe el texto hasta
// que esas preguntas estén contestadas: una experiencia que no consta no se publica como si lo fuera.

const articulo: ArticuloBlog = {
  estado: 'borrador',
  slug: 'construir-una-startup-tecnologica-desde-barcelona',
  titulo: 'Construir una startup tecnológica desde Barcelona',
  categoria: 'startups',
  guion: [
    'Por qué Barcelona',
    'Qué ayuda y qué estorba del entorno en la práctica',
    'Las comunidades y los espacios que han servido',
    'Trabajar en remoto con clientes de toda España',
    'Lo que recomendarías a quien empieza aquí',
  ],
  preguntas: [
    '¿Por qué Barcelona y no otra ciudad?',
    '¿Qué ventajas y qué trabas concretas has notado (contactos, trámites, costes, talento)?',
    '¿Qué comunidades, eventos o espacios te han servido de verdad?',
    '¿Trabajas solo o con un equipo, y cómo lo organizas?',
    '¿Qué harías distinto si empezaras hoy?',
  ],
};

export default articulo;
