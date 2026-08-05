// Registro central del tour guiado. Cada paso apunta a UN atributo
// `data-tour="..."` ya puesto en el bloque principal de la página real — cero
// lógica de tour importada en esas páginas, solo un atributo HTML.
//
// Puro y sin React: se puede testear con `node --test` sin montar nada.
export interface PasoTour {
  id: string;
  selector: string;
  ruta: string;
  titulo: string;
  descripcion: string;
}

export const PASOS_TOUR: PasoTour[] = [
  {
    id: 'calendario', selector: 'calendario-vista', ruta: '/calendario',
    titulo: 'Tu calendario',
    descripcion: 'Crea clases, arrastra para reprogramar y gestiona sustituciones cuando una instructora avisa de que falta — todo desde aquí.',
  },
  {
    id: 'clientas', selector: 'clientas-lista', ruta: '/clientas',
    titulo: 'Tus clientas',
    descripcion: 'Ficha completa de cada una: bonos, asistencia, notas de progreso y quién lleva tiempo sin venir.',
  },
  {
    id: 'cobros', selector: 'cobros-vista', ruta: '/cobros',
    titulo: 'Cobros',
    descripcion: 'Qué está pendiente de cobrar y qué ya se cobró — con Stripe conectado, la mayoría se cobra sola.',
  },
  {
    id: 'equipo', selector: 'equipo-vista', ruta: '/equipo',
    titulo: 'Tu equipo',
    descripcion: 'Instructoras, permisos y — si hace falta cubrir una baja — sustituciones sin que tengas que llamar a nadie.',
  },
  {
    id: 'automatizaciones', selector: 'automatizaciones-vista', ruta: '/automatizaciones',
    titulo: 'Funciones inteligentes',
    descripcion: 'Recordatorios, recuperación de clientas ausentes y más, funcionando solas una vez las activas.',
  },
  {
    id: 'informes', selector: 'informes-vista', ruta: '/informes',
    titulo: 'Informes',
    descripcion: 'Ingresos, ocupación y qué clases dan dinero de verdad — para decidir con datos, no a ojo.',
  },
  {
    id: 'configuracion', selector: 'configuracion-vista', ruta: '/configuracion',
    titulo: 'Configuración',
    descripcion: 'Planes, marca, integraciones y todo lo demás que define cómo funciona tu estudio en Tentare.',
  },
];

/**
 * Interpreta el valor crudo de localStorage para el paso guardado del tour.
 * -1 = no hay tour en marcha.
 *
 * ⚠️ `Number(null)` y `Number('')` dan `0`, no `NaN` — hay que descartar
 * "la clave no existe todavía" y "cadena vacía" ANTES de convertir a número.
 * Sin esto, un estudio que nunca ha tocado el tour (o cualquier test e2e con
 * contexto limpio) arrancaba el tour solo en el paso 0 en cuanto cargaba
 * cualquier página del panel, con su overlay bloqueando clics en toda la app.
 */
export function resolverPasoGuardado(bruto: string | null): number {
  if (bruto === null || bruto === '') return -1;
  const n = Number(bruto);
  return Number.isFinite(n) && n >= 0 && n < PASOS_TOUR.length ? n : -1;
}
