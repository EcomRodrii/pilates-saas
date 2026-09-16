// Los dos cortes del vídeo de producto del hero (components/landing/VideoProducto.tsx).
// Fuera del componente para que lib/landing/video-producto.test.ts compruebe los
// ficheros de public/ sin montar React.

/** El mismo corte que el CSS del componente: por debajo, vídeo de borde a borde y corte vertical. */
export const CONSULTA_MOVIL = '(max-width: 760px)';

export interface CorteVideoProducto {
  id: 'escritorio' | 'movil';
  ancho: number;
  alto: number;
  poster: string;
  webm: string;
  mp4: string;
}

export const CORTES_VIDEO_PRODUCTO: { escritorio: CorteVideoProducto; movil: CorteVideoProducto } = {
  escritorio: { id: 'escritorio', ancho: 1440, alto: 900, poster: '/producto/demo-poster.jpg', webm: '/producto/demo.webm', mp4: '/producto/demo.mp4' },
  movil: { id: 'movil', ancho: 1080, alto: 1350, poster: '/producto/demo-movil-poster.jpg', webm: '/producto/demo-movil.webm', mp4: '/producto/demo-movil.mp4' },
};

/** Techo de peso de cada vídeo (es la portada): lo que cuesta de más se nota en el LCP del móvil. */
export const PRESUPUESTO_VIDEO_KB = { escritorio: 1500, movil: 1200 } as const;
