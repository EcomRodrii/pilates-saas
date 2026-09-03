// Los dos enlaces que el paquete deja como demo: «+ Calendario» y «Cómo llegar».
//
// En el paquete ambos botones llaman a un `toast('Añadida a tu calendario ✓')`
// — es una maqueta, y ahí basta. Al copiarlos tal cual quedaban PINTADOS Y
// MUERTOS: en la Home ni siquiera se les pasaba el manejador, así que la alumna
// veía tres botones y dos no hacían nada. Un botón muerto es peor que no
// tenerlo, y desde luego no es reproducir el diseño.
//
// Se implementan con lo que ya hay en el payload público (fecha, hora,
// duración, nombre, sala, dirección del estudio). Cero backend nuevo.

/** Fecha y hora locales de la clase a la forma UTC compacta que piden los calendarios. */
function selloUtc(fechaISO: string, hora: string, minutosDespues = 0): string {
  const [a, m, d] = fechaISO.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  // El `Date` se construye en la zona del navegador, que es la de la alumna y
  // la del estudio: una clase de las 13:00 en Madrid es las 13:00 para quien
  // la reserva. `toISOString` lo pasa a UTC, que es lo que el formato exige.
  const t = new Date(a, (m ?? 1) - 1, d, hh, (mm ?? 0) + minutosDespues);
  return t.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface ClaseParaEnlace {
  fecha: string;
  hora: string;
  duracionMin: number;
  nombre: string;
  sala: string;
}

/**
 * Enlace de «añadir al calendario».
 *
 * Se usa la plantilla de Google Calendar y NO un `.ics` descargable: en móvil
 * —que es donde vive esta app— descargar un fichero abre un diálogo de
 * ficheros del que mucha gente no sabe salir, mientras que este enlace abre la
 * app de calendario ya rellenada. Google Calendar acepta la plantilla aunque la
 * cuenta sea de otro proveedor.
 */
export function urlCalendario(clase: ClaseParaEnlace, estudioNombre: string, direccion: string): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${clase.nombre} · ${estudioNombre}`,
    dates: `${selloUtc(clase.fecha, clase.hora)}/${selloUtc(clase.fecha, clase.hora, clase.duracionMin)}`,
    details: `Tu clase en ${estudioNombre}. Sala: ${clase.sala}.`,
    location: direccion || estudioNombre,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/**
 * Enlace de «cómo llegar».
 *
 * `https://maps.google.com/?q=` y no un esquema propio de iOS o Android: el
 * navegador de cada plataforma ya redirige a su app de mapas, y así no hay que
 * detectar el sistema —que es justo la clase de detección que envejece mal.
 */
export function urlComoLlegar(direccion: string, estudioNombre: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(direccion || estudioNombre)}`;
}
