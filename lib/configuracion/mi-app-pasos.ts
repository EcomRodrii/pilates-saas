// «Mi app» guiada (maqueta aprobada por el fundador el 21-oct-2026). Los siete pasos de la app de la
// alumna, en orden, y lo que la propietaria pregunta antes de tocar nada:
//   · qué va primero y qué es imprescindible o opcional (`orden`, `peso`);
//   · dónde lo ve su alumna (`donde`) y cuándo le llega el cambio (`cuando`);
//   · si ha terminado (`hecho`, `estado`, y el progreso de arriba).
//
// Lo que cuenta para el progreso son los pasos 1 a 4: con el 1 y el 2 ya se puede compartir, el 3 y el
// 4 la hacen suya. El 5 y el 6 son opcionales (vacíos no enseñan nada, y eso está bien) y el 7 no es un
// ajuste. Nada de esto se inventa: cada estado sale de un dato que la app de la alumna usa de verdad
// (ver la tabla «Dónde queda cada cosa de hoy» de la maqueta).
//
// Puro, sin `@/`: se prueba con `node --test`.

export type PesoPaso = 'imprescindible' | 'recomendado' | 'opcional' | 'final';
export type TonoEstado = 'hecho' | 'falta' | 'nada';
export type IdPasoMiApp = 'logo' | 'estilo' | 'entrada' | 'fotos' | 'inicio' | 'frase' | 'compartir';

export interface DatosMiApp {
  logo: boolean;
  /** `undefined`: no se sabe (sin permiso o sin leer el tema). */
  favicon?: boolean;
  /** El tema publicado, resumido. `null`: aún no se ha leído. */
  apariencia: { resumen: string; propia: boolean } | null;
  /** Hay cambios de color o estilo guardados en el borrador y sin publicar. */
  sinPublicar: boolean;
  portada: boolean;
  titular: boolean;
  clases: { total: number; conFoto: number };
  equipo: { total: number; conFoto: number };
  /** Tarjetas de «Descubre» que se ven hoy. `null`: aún no se sabe. */
  tarjetasVisibles: number | null;
  mensajeDestacado: boolean;
  fraseAMano: boolean;
  tieneDireccion: boolean;
  /** Puede pedir su app en la App Store (`APP_PROPIA_PEDIR` y propietaria): va en el mismo paso, al final. */
  appEnTienda?: boolean;
}

export interface PasoMiApp {
  id: IdPasoMiApp;
  orden: number;
  titulo: string;
  peso: PesoPaso;
  porque: string;
  donde: string;
  cuando: string;
  estado: string;
  tono: TonoEstado;
  hecho: boolean;
}

export const ETIQUETA_PESO: Record<PesoPaso, string> = {
  imprescindible: 'Imprescindible',
  recomendado: 'Recomendado',
  opcional: 'Opcional',
  final: 'Cuando esté lista',
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «A», «A y B», «A, B y C»; cada parte entre comillas para que «tu logo y tu icono» no se mezcle con el «y» que las une. */
const enumerar = (partes: string[]) => {
  const q = partes.map(p => `«${p}»`);
  return q.length <= 1 ? q.join('') : `${q.slice(0, -1).join(', ')} y ${q[q.length - 1]}`;
};

function estadoFotos(d: DatosMiApp): { texto: string; hecho: boolean } {
  const partes: string[] = [];
  const clasesOk = d.clases.total === 0 || d.clases.conFoto >= d.clases.total;
  const equipoOk = d.equipo.total === 0 || d.equipo.conFoto >= d.equipo.total;
  if (d.clases.total > 0) partes.push(clasesOk ? 'Todas tus clases con foto' : `${d.clases.conFoto} de ${plural(d.clases.total, 'clase', 'clases')} con foto`);
  if (d.equipo.total > 0) partes.push(equipoOk ? 'todo tu equipo con foto' : `${d.equipo.conFoto} de ${d.equipo.total} de tu equipo con foto`);
  if (partes.length === 0) return { texto: 'Aún no tienes clases ni equipo', hecho: false };
  const texto = partes.join(' · ');
  return { texto: texto.charAt(0).toUpperCase() + texto.slice(1), hecho: clasesOk && equipoOk };
}

export function pasosMiApp(d: DatosMiApp): PasoMiApp[] {
  const fotos = estadoFotos(d);
  const contenido: string[] = [];
  if (d.mensajeDestacado) contenido.push('un mensaje destacado');
  if (d.tarjetasVisibles) contenido.push(plural(d.tarjetasVisibles, 'tarjeta', 'tarjetas'));
  const conContenido = contenido.length > 0;

  const logoTexto = [d.logo ? 'Con logo' : 'Sin logo', d.favicon === undefined ? null : d.favicon ? 'con icono' : 'sin icono'].filter(Boolean).join(' · ');

  return [
    {
      id: 'logo', orden: 1, titulo: 'Tu logo y tu icono', peso: 'imprescindible',
      porque: 'Es lo que la reconoce como TU app: tu nombre arriba en cada pantalla y el icono que se queda en su móvil.',
      donde: 'Arriba en su app, el icono del móvil y la pestaña', cuando: 'Al momento, al subirlo',
      estado: logoTexto, tono: d.logo ? 'hecho' : 'falta', hecho: d.logo,
    },
    {
      id: 'estilo', orden: 2, titulo: 'Color y estilo', peso: 'imprescindible',
      porque: 'Tu color, tu letra y el estilo de botones y tarjetas. Lo pruebas en un móvil antes de que lo vea nadie.',
      donde: 'Toda la app', cuando: 'Solo cuando pulsas «Publicar»',
      estado: d.apariencia === null ? 'Leyendo lo publicado…'
        : d.sinPublicar ? `Publicado: ${d.apariencia.resumen} · tienes cambios sin publicar`
        : d.apariencia.propia ? `Publicado: ${d.apariencia.resumen}`
        : 'Con el color de serie: pon el tuyo',
      tono: d.apariencia === null ? 'nada' : d.sinPublicar || !d.apariencia.propia ? 'falta' : 'hecho',
      hecho: !!d.apariencia?.propia,
    },
    {
      id: 'entrada', orden: 3, titulo: 'La entrada a tu app', peso: 'recomendado',
      porque: 'Lo primero que ve quien la abre por primera vez: una foto tuya y una frase. Sin foto, sale una de muestra.',
      donde: 'La pantalla de entrar y crear cuenta', cuando: 'Al momento, al guardar',
      estado: d.portada && d.titular ? 'Con tu foto y tu titular'
        : d.portada ? 'Con tu foto · el titular es el de serie'
        : d.titular ? 'Falta la foto · el titular ya está'
        : 'Falta la foto · el titular es el de serie',
      tono: d.portada ? 'hecho' : 'falta', hecho: d.portada,
    },
    {
      id: 'fotos', orden: 4, titulo: 'Fotos de tus clases y tu equipo', peso: 'recomendado',
      porque: 'Cada clase del horario lleva su foto y cada instructora su cara. Sin foto, salen las de muestra.',
      donde: 'El horario, la ficha de cada clase y su instructora', cuando: 'Al momento, al subirlas',
      estado: fotos.texto, tono: fotos.hecho ? 'hecho' : 'falta', hecho: fotos.hecho,
    },
    {
      id: 'inicio', orden: 5, titulo: 'Lo que enseña el inicio', peso: 'opcional',
      porque: 'Un mensaje para todas (un cierre por festivo, un taller) y tarjetas con foto. Si no pones nada, el inicio enseña solo sus clases.',
      donde: 'El inicio, bajo su próxima clase', cuando: 'Al momento, al marcar «Que la vean»',
      estado: d.tarjetasVisibles === null ? 'Leyendo…' : conContenido ? `Se ven ${contenido.join(' y ')}` : 'Nada (el inicio enseña solo sus clases)',
      tono: conContenido ? 'hecho' : 'nada', hecho: conContenido,
    },
    {
      id: 'frase', orden: 6, titulo: 'Tu frase, a mano', peso: 'opcional',
      porque: 'Una frase tuya, con letra manuscrita, al final del inicio. Un toque personal; vacía, no sale nada.',
      donde: 'El final del inicio', cuando: 'Al momento, al guardar',
      estado: d.fraseAMano ? 'Escrita' : 'Sin frase (no sale nada)',
      tono: d.fraseAMano ? 'hecho' : 'nada', hecho: d.fraseAMano,
    },
    {
      id: 'compartir', orden: 7, titulo: 'Compártela con tus alumnas', peso: 'final',
      porque: d.appEnTienda
        ? 'Una app que no conocen no se usa: el enlace, el QR para recepción, cómo instalarla en el móvil y tu app en la App Store.'
        : 'Una app que no conocen no se usa: el enlace, el QR para recepción y cómo instalarla en el móvil.',
      donde: 'Su móvil, como una app más', cuando: 'Cuando se la mandas',
      estado: !d.tieneDireccion ? 'Primero ponle dirección a tu página'
        : d.appEnTienda ? 'Enlace y QR listos · tu app en la App Store: pídela y mira cómo va' : 'Enlace y QR listos',
      tono: d.tieneDireccion ? 'nada' : 'falta', hecho: false,
    },
  ];
}

/** Lo de arriba: cuántos de los pasos que cuentan (1–4) están hechos, si ya se puede compartir y qué falta. */
export function progresoMiApp(pasos: readonly PasoMiApp[]) {
  const cuentan = pasos.filter(p => p.peso === 'imprescindible' || p.peso === 'recomendado');
  const hechos = cuentan.filter(p => p.hecho).length;
  const imprescindibles = cuentan.filter(p => p.peso === 'imprescindible');
  const listaParaCompartir = imprescindibles.every(p => p.hecho);
  const faltan = cuentan.filter(p => !p.hecho);
  const titulo = hechos === cuentan.length ? 'Tu app está completa'
    : listaParaCompartir ? 'Tu app ya se puede compartir'
    : 'Tu app aún no está lista para compartir';
  const frase = faltan.length === 0
    ? 'Lo imprescindible y lo recomendado está hecho. Lo opcional, cuando quieras.'
    : listaParaCompartir
      ? `Lo imprescindible está hecho. Para que esté completa te falta ${enumerar(faltan.map(p => p.titulo))}.`
      : `Antes de compartirla te falta ${enumerar(faltan.filter(p => p.peso === 'imprescindible').map(p => p.titulo))}.`;
  return { hechos, total: cuentan.length, listaParaCompartir, titulo, frase };
}
