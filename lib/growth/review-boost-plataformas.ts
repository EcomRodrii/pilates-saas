// Plataformas de reseña invitadas tras un feedback interno 4-5★. Config
// extensible a propósito: Software Advice (mismo grupo, Gartner Digital
// Markets) tiene ya su logo en public/marcas/resenas/ pero falta su URL de
// reseña — se activa añadiendo una entrada más aquí cuando se tenga, no
// bloquea esta entrega.
export interface PlataformaReviewBoost {
  id: 'capterra' | 'getapp' | 'softwareadvice';
  nombre: string;
  url: string;
  /** public/marcas/resenas/<archivo> — logo oficial, fondo transparente. */
  logo: string;
}

export const REVIEW_BOOST_PLATAFORMAS: PlataformaReviewBoost[] = [
  {
    id: 'capterra',
    nombre: 'Capterra',
    url: 'https://reviews.capterra.com/products/new/05faa958-2aec-4e86-8f1f-e83a6c7f4a24/?utm_source=vp&utm_campaign=vendor_request',
    logo: '/marcas/resenas/capterra.png',
  },
  {
    id: 'getapp',
    nombre: 'GetApp',
    url: 'https://reviews.getapp.com/products/new/05faa958-2aec-4e86-8f1f-e83a6c7f4a24/?lang=en',
    logo: '/marcas/resenas/getapp.png',
  },
];
