// ─────────────────────────────────────────────────────────────────────────────
// Portadas de los artículos de /recursos escritos como datos, por slug.
//
// Fotos de Unsplash con su licencia (uso comercial libre, sin atribución
// obligatoria), elegidas una a una y descargadas el 25-sep-2026 ya recortadas a
// 2:1 (1600×800). Los originales viven FUERA del repo, en la misma carpeta que
// los de las guías; `node scripts/portadas-recursos.mjs` genera los derivados.
// Se descartó a propósito una foto de Vagaro: es un software de la competencia.
//
// Además de los anchos de tarjeta (360 y 480), llevan los de la cabecera del
// artículo (720 y 1200): el cuerpo mide 720 px y Google pide al menos 1200 px
// para enseñar una imagen grande (Discover, resultados con miniatura).
//
// Aparte de index.ts y sin el texto de los artículos: lo leen el listado
// (cliente), el registro de portadas y el sitemap.
// ─────────────────────────────────────────────────────────────────────────────

import type { PortadaRecursos } from '../guias.ts';

export const ANCHOS_PORTADA_ARTICULO = [360, 480, 720, 1200] as const;

const portada = (id: string, original: string, alt: string, autor: string, foto: string): PortadaRecursos => ({
  id,
  original,
  alt,
  ancho: 1600,
  alto: 800,
  recorte: [0, 0, 0, 0],
  credito: {
    autor,
    fuente: 'Unsplash',
    url: `https://unsplash.com/photos/${foto}`,
    licencia: 'Licencia de Unsplash',
    fechaDescarga: '2026-09-25',
  },
  consentimiento: 'no-aplica',
  anchos: ANCHOS_PORTADA_ARTICULO,
});

export const PORTADAS_ARTICULOS: Record<string, PortadaRecursos> = {
  'como-abrir-un-estudio-de-pilates': portada('sala-reformers-abrir-estudio-pilates', '12-como-abrir-un-estudio-de-pilates.jpg',
    'Sala de un estudio de pilates con reformers y torres de madera, plantas y luz natural', 'Ahmet Kurt', '2sXYx7sd-kg'),
  'como-abrir-un-estudio-de-yoga': portada('sala-yoga-ventanales-abrir-estudio-yoga', '13-como-abrir-un-estudio-de-yoga.jpg',
    'Estudio de yoga amplio con ventanales, esterillas en el suelo y luz cálida', 'eran design', 'oaJaBFVMUQ4'),
  'mejor-software-para-estudios-de-pilates': portada('portatil-graficos-mejor-software-pilates', '14-mejor-software-para-estudios-de-pilates.jpg',
    'Una mujer revisa en el portátil una hoja con gráficos mientras hojea un cuaderno de planificación', 'Sincerely Media', 'XihOO7UOvy4'),
  'bsport-vs-timp': portada('escritorio-portatil-movil-bsport-vs-timp', '15-bsport-vs-timp.jpg',
    'Un hombre trabaja en un portátil con un panel de datos mientras sostiene el móvil en un escritorio de madera', 'Zan Lazarevic', 'AmEeEB1g3XQ'),
  'cuanto-cuesta-abrir-un-estudio-de-pilates': portada('reformer-torre-madera-cuanto-cuesta-estudio', '16-cuanto-cuesta-abrir-un-estudio-de-pilates.jpg',
    'Una mujer hace un ejercicio en un reformer con torre de madera en un estudio de pilates', 'Ahmet Kurt', '0xn-8kRWOhE'),
  'precio-clase-de-pilates': portada('clase-grupo-esterilla-precio-clase-pilates', '17-precio-clase-de-pilates.jpg',
    'Clase de grupo en esterilla con varias alumnas en una sala de ladrillo con grandes ventanas', 'bruce mars', 'gJtDg6WfMlQ'),
  'rentabilidad-estudio-de-pilates': portada('calculadora-boligrafo-rentabilidad-estudio', '18-rentabilidad-estudio-de-pilates.jpg',
    'Una calculadora y un bolígrafo sobre una hoja con números', 'Aaron Lefler', 'Vs6ip7fsld8'),
  'requisitos-para-abrir-un-estudio-de-pilates': portada('firma-documentos-requisitos-estudio-pilates', '19-requisitos-para-abrir-un-estudio-de-pilates.jpg',
    'Dos mujeres revisan y firman documentos en una mesa', 'Gabrielle Henderson', 'HJckKnwCXxQ'),
  'bonos-de-pilates': portada('pago-movil-datafono-bonos-pilates', '20-bonos-de-pilates.jpg',
    'Una mano acerca el móvil a un datáfono para pagar sin contacto', 'CardMapr.nl', 'XH2JFgT4Abc'),
  'politica-de-cancelacion-de-clases': portada('agenda-abierta-politica-cancelacion-clases', '21-politica-de-cancelacion-de-clases.jpg',
    'Una agenda de espiral abierta sobre una mesa de mármol', 'Swello', 'iYMK_hTv26o'),
  'cuanto-cobra-una-instructora-de-pilates': portada('instructora-dando-clase-sueldo-instructora', '22-cuanto-cobra-una-instructora-de-pilates.jpg',
    'Una instructora sonriente da indicaciones a una alumna sentada en una esterilla', 'bruce mars', 'HHXdPG_eTIQ'),
  'como-ser-instructora-de-pilates': portada('ejercicio-reformer-como-ser-instructora', '23-como-ser-instructora-de-pilates.jpg',
    'Una mujer hace un ejercicio lateral en un reformer en un estudio de pilates', 'Roxana Popovici', 'UrUF21P1e-M'),
  'iva-clases-de-pilates': portada('calculadora-oficina-iva-clases-pilates', '24-iva-clases-de-pilates.jpg',
    'Una calculadora sobre papeles junto a unas tijeras y material de oficina', 'maks_d', '54bvLAWhWAM'),
  'software-pilates-gratis': portada('mujer-portatil-escritorio-software-gratis', '25-software-pilates-gratis.jpg',
    'Una mujer trabaja con un portátil en un escritorio ordenado', 'Zulfugar Karimov', 'pzjeeyl5C38'),
  'plantilla-control-de-asistencia-pilates': portada('hoja-calculo-portatil-plantilla-asistencia', '26-plantilla-control-de-asistencia-pilates.jpg',
    'Unas manos teclean en un portátil que muestra una hoja de cálculo', 'Gorilla ROI Data Connector', '9fZuqBYlV1w'),
  'franquicia-de-pilates': portada('cartel-abierto-escaparate-franquicia-pilates', '27-franquicia-de-pilates.jpg',
    'Un cartel de «Open» en la puerta de un comercio', 'WindowSeat Photography', 'wzBiUDmhf-U'),
  'nombres-para-estudio-de-pilates': portada('libreta-boligrafo-nombres-estudio-pilates', '28-nombres-para-estudio-de-pilates.jpg',
    'Una libreta en blanco con un bolígrafo sobre una mesa de madera', 'Kelly Sikkema', 'e0djo08-Ev8'),
};

export const portadaArticulo = (slug: string): PortadaRecursos | undefined => PORTADAS_ARTICULOS[slug];
