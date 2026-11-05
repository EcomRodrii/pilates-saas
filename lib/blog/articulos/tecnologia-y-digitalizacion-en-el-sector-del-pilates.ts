import type { ArticuloBlog } from '../tipos.ts';

// BORRADOR: sin ruta, sin sitemap y sin RSS. Solo el guion y lo que solo el fundador sabe. No se escribe el texto hasta
// que esas preguntas estén contestadas: una experiencia que no consta no se publica como si lo fuera.

const articulo: ArticuloBlog = {
  estado: 'borrador',
  slug: 'tecnologia-y-digitalizacion-en-el-sector-del-pilates',
  titulo: 'Tecnología y digitalización en el sector del Pilates',
  categoria: 'negocios',
  guion: [
    'Cómo gestiona hoy un estudio pequeño sus reservas y sus cobros',
    'Qué cambia cuando se digitaliza y qué no',
    'Lo que se puede medir con datos públicos (con su fuente)',
    'Qué le piden de verdad las propietarias a un software',
    'Dónde está la oportunidad',
  ],
  preguntas: [
    '¿Qué has visto en los estudios con los que has hablado que debamos contar (sin nombres)?',
    '¿Qué datos públicos quieres citar? Cada cifra llevará su fuente y su fecha.',
    '¿Qué le piden las propietarias que el software actual no da?',
    '¿Qué mito del sector quieres desmontar?',
    '¿Hay algo que Tentare no vaya a hacer y quieras decirlo?',
  ],
};

export default articulo;
