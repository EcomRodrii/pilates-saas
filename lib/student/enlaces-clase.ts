// ⚠️ Relativo y con `.ts` explícita, no `@/`: bajo `node --test` el alias no
// resuelve y se lleva por delante el fichero de test ENTERO en silencio — la
// trampa que ya costó 3261→3252 tests sin que nadie lo notara. Mismo criterio
// que `lib/student/tienda.ts`.
import { eventoIcs, nombreIcs } from '../calendario-ics.ts';

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
 * Enlace de plantilla de Google Calendar.
 *
 * ⚠️ Este era el ÚNICO camino, con este razonamiento: «en móvil descargar un
 * fichero abre un diálogo del que mucha gente no sabe salir, mientras que este
 * enlace abre la app de calendario ya rellenada». Es cierto en Android, donde
 * el enlace lo recoge la app de Google Calendar que viene instalada.
 *
 * En un iPhone es falso. Ahí no hay Google Calendar salvo que la alumna lo haya
 * instalado, así que el enlace abre una PÁGINA WEB de Google pidiéndole iniciar
 * sesión con una cuenta de Google — para meter la clase en el calendario que ya
 * usa, que es el de Apple. El sitio donde de verdad quiere el evento es el
 * único al que ese enlace no llega.
 *
 * Sigue siendo el camino bueno para Android y escritorio. Para Apple se genera
 * un `.ics` (ver `añadirAlCalendario`).
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
 * ⚠️ Decía: «`https://maps.google.com/?q=` y no un esquema propio de iOS o
 * Android: el navegador de cada plataforma ya redirige a su app de mapas». La
 * segunda mitad no es cierta. En un iPhone, `maps.google.com` abre la app de
 * Google Maps SI la tiene instalada y, si no, Google Maps dentro de Safari;
 * **nunca** abre Apple Maps, que es la app de mapas que ese teléfono trae y la
 * que está conectada a su coche, sus contactos y su reloj.
 *
 * Es el mismo fallo que tenía «+ Calendario» justo al lado, y por el mismo
 * motivo: dar por hecho que un enlace de Google es neutral.
 *
 * `maps.apple.com` es el enlace universal de Apple: en iPhone, iPad y Mac abre
 * Mapas directamente. Se manda ahí solo a los aparatos de Apple; el resto sigue
 * con Google, que es lo correcto en Android.
 */
export function urlComoLlegar(direccion: string, estudioNombre: string, ua = ''): string {
  const q = encodeURIComponent(direccion || estudioNombre);
  return esApple(ua) ? `https://maps.apple.com/?q=${q}` : `https://maps.google.com/?q=${q}`;
}


// ─── A qué calendario va esta persona ───────────────────────────────────────

/**
 * ¿El aparato es de Apple? Lo usan los DOS botones de la tarjeta de próxima
 * clase: «+ Calendario» y «Cómo llegar». Por eso ya no se llama
 * `plataformaCalendario`.
 *
 * ⚠️ Aquí SÍ se detecta plataforma, a diferencia de `urlComoLlegar`, y la
 * diferencia no es de criterio sino del problema: para mapas existe una URL que
 * cada sistema redirige a su app, así que detectar sobra. Para calendarios no
 * existe ninguna — Google Calendar y Apple Calendar no comparten formato de
 * enlace — así que o se detecta o se le pregunta a la alumna, y preguntarle a
 * qué calendario quiere su clase es hacerle a ella el trabajo.
 *
 * Puro y con la UA por parámetro para poder probarlo sin navegador.
 *
 * ⚠️ No hace falta el truco de `maxTouchPoints` para el iPad de iPadOS 13+, que
 * se anuncia como `Macintosh`: aquí el Mac de escritorio va por el MISMO camino
 * que el iPhone —Calendario de Apple abre un `.ics` igual de bien—, así que el
 * iPad disfrazado acaba donde debe sin distinguirlo. Si algún día Mac y iPad
 * necesitaran caminos distintos, entonces sí haría falta.
 */
export function esApple(ua: string): boolean {
  return /iPad|iPhone|iPod|Macintosh|Mac OS X/i.test(ua);
}

/** La clase, en los instantes ISO reales que pide `lib/calendario-ics.ts`. */
export function instantesDeClase(clase: ClaseParaEnlace): { inicio: string; fin: string } {
  const [a, m, d] = clase.fecha.split('-').map(Number);
  const [hh, mm] = clase.hora.split(':').map(Number);
  const inicio = new Date(a, (m ?? 1) - 1, d, hh, mm ?? 0);
  const fin = new Date(inicio.getTime() + clase.duracionMin * 60_000);
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

/**
 * «+ Calendario»: mete la clase en el calendario que esa persona usa de verdad.
 *
 * Android y escritorio no-Apple → plantilla de Google Calendar, que es lo que
 * ya hacía y funciona bien ahí.
 *
 * Apple → un `.ics`, que es lo único que entiende Calendario. El fichero lo
 * construye `lib/calendario-ics.ts`, el MISMO que usa el widget público
 * (`app/reservar/[slug]/page.tsx`): su cabecera ya decía que lo piden «dos: la
 * página pública de reservas y el portal de la alumna», y el portal era el que
 * no lo llamaba. Dos generadores del mismo formato es como se acaba con un
 * `.ics` que un calendario acepta y otro rechaza.
 *
 * ⚠️ El `.ics` es la peor de dos opciones imperfectas, no la buena: en iOS pasa
 * por la hoja de compartir en vez de abrir Calendario directamente. La otra
 * opción era mandar a la alumna a una página de Google pidiéndole una cuenta
 * que probablemente no tiene, para meter el evento en un calendario que no es
 * el suyo. Entre un paso de más y un callejón sin salida, el paso de más.
 */
export function añadirAlCalendario(
  clase: ClaseParaEnlace,
  estudioNombre: string,
  direccion: string,
  instructora?: string,
): void {
  if (!esApple(navigator.userAgent)) {
    window.open(urlCalendario(clase, estudioNombre, direccion), '_blank', 'noopener');
    return;
  }

  const { inicio, fin } = instantesDeClase(clase);
  const ics = eventoIcs({
    id: `${clase.fecha}-${clase.hora}-${clase.nombre}`,
    inicio, fin,
    titulo: `${clase.nombre} · ${estudioNombre}`,
    instructora,
    sala: clase.sala,
    estudioNombre,
    estudioDireccion: direccion,
  }, new Date());

  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreIcs(clase.nombre, inicio);
  a.click();
  // ⚠️ El `revoke` va diferido: en Safari, revocar en la misma vuelta del bucle
  // de eventos cancela la descarga que acaba de empezar.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
