// ─────────────────────────────────────────────────────────────────────────────
// De la dirección del estudio a su calendario de festivos. Puro.
//
// Orden de confianza: el código postal (sus dos primeras cifras son la
// provincia, sin ambigüedad), un código postal escrito dentro de la
// dirección, y por último la ciudad contra una lista CERRADA de municipios.
// Si nada coincide se devuelve null y no se avisa de ningún festivo: un aviso
// con el calendario de otra comunidad haría cerrar un día laborable.
// ─────────────────────────────────────────────────────────────────────────────

import type { ZonaFestivos } from './oficiales.ts';

const PROVINCIA_A_ZONA: Record<string, ZonaFestivos> = {
  // Cataluña: Barcelona, Girona, Lleida, Tarragona.
  '08': 'CATALUNA',
  '17': 'CATALUNA',
  '25': 'CATALUNA',
  '43': 'CATALUNA',
  '28': 'MADRID',
  // Andalucía: Almería, Cádiz, Córdoba, Granada, Huelva, Jaén, Málaga, Sevilla.
  '04': 'ANDALUCIA',
  '11': 'ANDALUCIA',
  '14': 'ANDALUCIA',
  '18': 'ANDALUCIA',
  '21': 'ANDALUCIA',
  '23': 'ANDALUCIA',
  '29': 'ANDALUCIA',
  '41': 'ANDALUCIA',
};

// Los nueve municipios del Valle de Arán (y sus núcleos más conocidos): tienen
// su propio festivo y comparten provincia con el resto de Lleida, así que el
// código postal no basta para distinguirlos.
const ARAN = [
  'arres', 'bausen', 'bossost', 'canejan', 'es bordes', 'les', 'naut aran', 'vielha', 'vielha e mijaran',
  'vielha mijaran', 'vilamos', 'salardu', 'baqueira', 'arties', 'gessa', 'tredos', 'betren', 'escunhau', 'garos',
  'casarilh', 'val d aran', 'vall d aran', 'valle de aran', 'aran',
];

// Códigos postales del Pirineo de Lleida donde conviven pueblos de Arán y de
// fuera (sin una lista contrastada con Correos). Sin una ciudad que lo aclare,
// no se sabe si toca el calendario de Arán o el de Cataluña: no se avisa.
const CP_DUDOSO_ARAN = /^255(3\d|4\d|5\d|98|99)$/;

// Capitales y municipios con más población de cada comunidad, escritos en su
// forma normalizada (sin acentos, minúsculas, apóstrofos y guiones como
// espacio). Solo nombres que no se repiten en otra comunidad.
const MUNICIPIOS: Record<Exclude<ZonaFestivos, 'ARAN'>, readonly string[]> = {
  CATALUNA: [
    'barcelona', 'bcn', 'girona', 'gerona', 'lleida', 'lerida', 'tarragona', 'l hospitalet de llobregat', 'hospitalet de llobregat',
    'l hospitalet', 'badalona', 'terrassa', 'sabadell', 'mataro', 'santa coloma de gramenet', 'reus',
    'sant cugat del valles', 'sant cugat', 'cornella de llobregat', 'cornella', 'sant boi de llobregat', 'rubi', 'manresa',
    'vilanova i la geltru', 'viladecans', 'castelldefels', 'el prat de llobregat', 'granollers',
    'cerdanyola del valles', 'sant adria de besos', 'mollet del valles', 'esplugues de llobregat', 'gava', 'figueres',
    'vic', 'sitges', 'blanes', 'lloret de mar', 'igualada', 'vilafranca del penedes', 'ripollet',
    'sant feliu de llobregat', 'cambrils', 'el vendrell', 'tortosa', 'salt', 'premia de mar', 'sant joan despi',
    'barbera del valles', 'montcada i reixac', 'sant vicenc dels horts', 'martorell', 'olot', 'calafell', 'salou',
    'molins de rei', 'pineda de mar', 'sant andreu de la barca', 'vila seca', 'palafrugell', 'amposta',
    'sant just desvern', 'sant quirze del valles', 'castellar del valles', 'el masnou', 'vilassar de mar',
    'sant pere de ribes', 'valls', 'banyoles', 'berga', 'sant celoni', 'cardedeu', 'parets del valles',
    'la garriga', 'canovelles', 'les franqueses del valles', 'arenys de mar', 'canet de mar', 'malgrat de mar',
  ],
  MADRID: [
    'madrid', 'mostoles', 'alcala de henares', 'fuenlabrada', 'leganes', 'getafe', 'alcorcon', 'torrejon de ardoz',
    'parla', 'alcobendas', 'las rozas de madrid', 'las rozas', 'san sebastian de los reyes', 'pozuelo de alarcon',
    'rivas vaciamadrid', 'coslada', 'valdemoro', 'majadahonda', 'collado villalba', 'aranjuez', 'arganda del rey',
    'boadilla del monte', 'pinto', 'colmenar viejo', 'tres cantos', 'san fernando de henares', 'galapagar',
    'navalcarnero', 'villaviciosa de odon', 'torrelodones', 'villanueva de la canada', 'villanueva del pardillo',
    'san lorenzo de el escorial', 'el escorial', 'algete', 'mejorada del campo', 'paracuellos de jarama',
    'ciempozuelos', 'humanes de madrid', 'moralzarzal', 'guadarrama', 'alpedrete', 'meco',
    'daganzo de arriba', 'velilla de san antonio', 'san martin de la vega', 'grinon', 'sevilla la nueva',
  ],
  ANDALUCIA: [
    'sevilla', 'malaga', 'cordoba', 'granada', 'almeria', 'huelva', 'cadiz', 'jaen', 'jerez de la frontera', 'jerez',
    'marbella', 'dos hermanas', 'algeciras', 'roquetas de mar', 'el ejido', 'mijas', 'fuengirola', 'velez malaga',
    'torremolinos', 'benalmadena', 'estepona', 'san fernando', 'el puerto de santa maria', 'chiclana de la frontera',
    'sanlucar de barrameda', 'linares', 'motril', 'alcala de guadaira', 'la linea de la concepcion', 'utrera',
    'mairena del aljarafe', 'ecija', 'antequera', 'rincon de la victoria', 'ronda', 'puerto real', 'andujar', 'ubeda',
    'lucena', 'nerja', 'armilla', 'maracena', 'rota', 'arcos de la frontera', 'tomares', 'bormujos', 'coria del rio',
    'los palacios y villafranca', 'la rinconada', 'camas', 'lepe', 'isla cristina', 'almunecar', 'baza', 'loja',
    'martos', 'puente genil', 'priego de cordoba', 'cabra', 'montilla', 'palma del rio', 'alhaurin de la torre',
    'alhaurin el grande', 'coin', 'cartama', 'torrox', 'manilva', 'vicar', 'nijar', 'adra', 'huercal overa', 'mojacar',
    'sanlucar la mayor', 'espartinas', 'gines', 'castilleja de la cuesta', 'mairena del alcor', 'carmona',
    'moron de la frontera', 'lebrija', 'osuna', 'estepa', 'conil de la frontera', 'barbate', 'tarifa', 'vejer de la frontera',
  ],
};

/** Minúsculas, sin acentos, apóstrofos/guiones/puntos como espacio. */
export function normalizarLugar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`´\-.·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function zonaDeCodigoPostal(cp: string): ZonaFestivos | null | undefined {
  // undefined = no es un código postal válido (se sigue mirando); null = es
  // válido pero de otra comunidad (no se mira la ciudad: el CP manda).
  if (!/^\d{5}$/.test(cp)) return undefined;
  const provincia = cp.slice(0, 2);
  const n = Number(provincia);
  if (n < 1 || n > 52) return undefined;
  return PROVINCIA_A_ZONA[provincia] ?? null;
}

function zonaDeCiudad(ciudad: string): ZonaFestivos | null {
  const entera = normalizarLugar(ciudad);
  // «Sabadell (Barcelona)», «Mairena, Sevilla»: se prueba la ciudad entera y
  // luego cada trozo; el primero que coincide manda.
  const trozos = [entera, ...ciudad.split(/[,()/]/).map(normalizarLugar)].filter(Boolean);
  for (const t of trozos) {
    if (ARAN.includes(t)) return 'ARAN';
    for (const zona of Object.keys(MUNICIPIOS) as Array<keyof typeof MUNICIPIOS>) {
      if (MUNICIPIOS[zona].includes(t)) return zona;
    }
  }
  return null;
}

export function zonaDelEstudio(estudio: {
  codigoPostal?: string | null;
  ciudad?: string | null;
  direccion?: string | null;
  /** `studios.zona_horaria`. Fuera de la hora peninsular no hay calendario: un
   *  código postal de cinco cifras también existe en Francia o Italia. */
  zonaHoraria?: string | null;
}): ZonaFestivos | null {
  if (estudio.zonaHoraria && estudio.zonaHoraria !== 'Europe/Madrid') return null;

  const ciudad = estudio.ciudad?.trim() ?? '';
  const cp = (estudio.codigoPostal ?? '').replace(/\s/g, '');
  // Arán primero: comparte provincia (25) con el resto de Lleida. Solo si el
  // código postal no dice otra cosa («Les» también podría escribirse en Madrid).
  if (ciudad && (cp === '' || cp.startsWith('25')) && zonaDeCiudad(ciudad) === 'ARAN') return 'ARAN';
  if (CP_DUDOSO_ARAN.test(cp)) return null;

  const porCp = cp ? zonaDeCodigoPostal(cp) : undefined;
  if (porCp !== undefined) return porCp;

  // Un código postal dentro de la dirección («C/ Mayor 1, 28013 Madrid»), solo
  // si hay exactamente uno: un número de cinco cifras suelto no basta.
  const enDireccion = (estudio.direccion ?? '').match(/\b\d{5}\b/g) ?? [];
  if (enDireccion.length === 1) {
    const porDireccion = zonaDeCodigoPostal(enDireccion[0]);
    if (porDireccion !== undefined) return porDireccion;
  }

  return ciudad ? zonaDeCiudad(ciudad) : null;
}
