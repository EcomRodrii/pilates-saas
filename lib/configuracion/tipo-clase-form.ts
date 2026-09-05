// Estado del formulario de un tipo de clase, y las frases con las que se le
// cuenta a la propietaria qué está heredando de su estudio.
//
// Vive fuera del componente por dos motivos: `node --test` solo mira
// `lib/**/*.test.ts` (ver [[i4-tests-ciegos-a-app-api]]), y estas conversiones
// —"vacío = hereda", "0 = sin mínimo", "null = sin límite"— son justo lo que
// se rompe en silencio si nadie las prueba.

import type { EspecialidadNetwork } from '../network/catalogo.ts';
import type { TipoClase } from '../types.ts';
import { resolverObjetivos } from '../reservar/objetivos.ts';
import { formatEuro } from '../utils.ts';

// "Hereda" = usa el ajuste general del estudio (Configuración → Estudio →
// Reservas y cancelaciones). Un booleano no puede representar tres estados
// (hereda/sí/no), de ahí el tri-estado.
export type TriEstado = 'hereda' | 'si' | 'no';

export const triABool = (v: TriEstado): boolean | null => (v === 'hereda' ? null : v === 'si');
export const boolATri = (v: boolean | null | undefined): TriEstado => (v == null ? 'hereda' : v ? 'si' : 'no');

/** Las duraciones que se ofrecen de un toque. Cualquier otra sigue cabiendo. */
export const DURACIONES_HABITUALES = [30, 45, 50, 60, 75, 90];

export const NIVEL_LABELS: Record<TipoClase['nivel'], string> = {
  TODOS: 'Todos los niveles',
  PRINCIPIANTE: 'Principiante',
  MEDIO: 'Medio',
  AVANZADO: 'Avanzado',
};

export type ClaseForm = {
  nombre: string;
  color: string;
  duracionMinutos: string;
  nivel: TipoClase['nivel'];
  objetivos: string[];
  descripcion: string;
  // Plazas por defecto (migr 20260903233651). Vacío = las de la sala donde se
  // programe, que es de donde salía el aforo antes de existir esta columna.
  aforoPorDefecto: string;
  // Vacío = hereda la ventana del estudio (comportamiento de siempre).
  ventanaCancelacionHoras: string;
  // Fase 1 de reglas por tipo de clase (migr 20260730152516): mismo patrón de
  // override que ventanaCancelacionHoras.
  reservaExigirPlan: TriEstado;
  reservaVentanaMinimaMinutos: string;
  reservaAntelacionMaximaDias: string;
  permiteListaEspera: TriEstado;
  // Fase 2a (migr 20260730192445): mismo patrón de override.
  requiereAprobacion: TriEstado;
  // Niveles (migr 20260905011213). Booleano PLANO, no tri-estado: no hereda del
  // estudio porque no hay un "por defecto" con sentido — que Avanzado pida
  // autorización y Suelo no es una propiedad de cada clase, no una política.
  requiereAutorizacion: boolean;
  // Fase 2b (migr 20260731130000): override NUMÉRICO — vacío = null = hereda,
  // mismo patrón que reservaVentanaMinimaMinutos/reservaAntelacionMaximaDias
  // (no tri-estado, que es solo para booleanos).
  listaEsperaPlazoAceptacionMinutos: string;
  // Fase 2c (migr 20260731140000): mismo patrón, vacío = null = hereda.
  minimoAsistentesPorClase: string;
  // Fase 3 (migr 20260730225253): mismo patrón, vacío = null = hereda.
  penalizacionImporteEur: string;
  // Fase 11 de Network↔Sustituciones (migr 20260818010302): '' = sin mapear,
  // no null directo — mismo criterio que el resto de selects opcionales de
  // este formulario.
  especialidadNetwork: EspecialidadNetwork | '';
  // Zoom (migr 20260820150000): por tipo de clase, no por sesión suelta.
  esOnline: boolean;
};

export const emptyClaseForm = (color: string): ClaseForm => ({
  nombre: '',
  color,
  duracionMinutos: '60',
  nivel: 'TODOS',
  objetivos: [],
  descripcion: '',
  aforoPorDefecto: '',
  ventanaCancelacionHoras: '',
  reservaExigirPlan: 'hereda',
  reservaVentanaMinimaMinutos: '',
  reservaAntelacionMaximaDias: '',
  permiteListaEspera: 'hereda',
  requiereAprobacion: 'hereda',
  requiereAutorizacion: false,
  listaEsperaPlazoAceptacionMinutos: '',
  minimoAsistentesPorClase: '',
  penalizacionImporteEur: '',
  especialidadNetwork: '',
  esOnline: false,
});

const numAString = (v: number | null | undefined): string => (v != null ? String(v) : '');

export function claseToForm(t: TipoClase): ClaseForm {
  return {
    nombre: t.nombre,
    color: t.color,
    duracionMinutos: String(t.duracionMinutos),
    nivel: t.nivel,
    objetivos: resolverObjetivos(t.objetivos),
    descripcion: t.descripcion ?? '',
    aforoPorDefecto: numAString(t.aforoPorDefecto),
    ventanaCancelacionHoras: numAString(t.ventanaCancelacionHoras),
    reservaExigirPlan: boolATri(t.reservaExigirPlan),
    reservaVentanaMinimaMinutos: numAString(t.reservaVentanaMinimaMinutos),
    reservaAntelacionMaximaDias: numAString(t.reservaAntelacionMaximaDias),
    permiteListaEspera: boolATri(t.permiteListaEspera),
    requiereAprobacion: boolATri(t.requiereAprobacion),
    requiereAutorizacion: t.requiereAutorizacion ?? false,
    listaEsperaPlazoAceptacionMinutos: numAString(t.listaEsperaPlazoAceptacionMinutos),
    minimoAsistentesPorClase: numAString(t.minimoAsistentesPorClase),
    penalizacionImporteEur: numAString(t.penalizacionImporteEur),
    especialidadNetwork: t.especialidadNetwork ?? '',
    esOnline: t.esOnline,
  };
}

/** Entero >= 0 desde un campo de texto. Vacío = null = hereda. */
const enteroOpcional = (v: string): number | null =>
  v.trim() === '' ? null : Math.max(0, parseInt(v, 10) || 0);

/** Plazas: 1..300 (el CHECK de la BD). Cualquier otra cosa = null = las de la sala. */
const aforoOpcional = (v: string): number | null => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(300, n);
};

/**
 * Lo que se guarda. Único sitio donde el formulario se convierte en el
 * contrato de `TipoClase` — el panel nunca escribe columnas por su cuenta.
 */
export function formACampos(form: ClaseForm): Omit<TipoClase, 'id' | 'studioId' | 'fotoUrl'> {
  return {
    nombre: form.nombre.trim(),
    color: form.color,
    duracionMinutos: parseInt(form.duracionMinutos, 10) || 60,
    nivel: form.nivel,
    objetivos: form.objetivos,
    descripcion: form.descripcion.trim() || null,
    // El CHECK de la BD exige 1..300. Un 0 o un negativo tecleados a mano se
    // tratan como "sin fijar" —que es lo que ya dice `resumenAforo` en
    // pantalla, "las plazas de la sala"— en vez de reventar el guardado con un
    // error crudo de Postgres o inventar una clase de 1 plaza.
    aforoPorDefecto: aforoOpcional(form.aforoPorDefecto),
    ventanaCancelacionHoras: enteroOpcional(form.ventanaCancelacionHoras),
    reservaExigirPlan: triABool(form.reservaExigirPlan),
    reservaVentanaMinimaMinutos: enteroOpcional(form.reservaVentanaMinimaMinutos),
    reservaAntelacionMaximaDias: enteroOpcional(form.reservaAntelacionMaximaDias),
    permiteListaEspera: triABool(form.permiteListaEspera),
    requiereAprobacion: triABool(form.requiereAprobacion),
    requiereAutorizacion: form.requiereAutorizacion,
    listaEsperaPlazoAceptacionMinutos: enteroOpcional(form.listaEsperaPlazoAceptacionMinutos),
    minimoAsistentesPorClase: enteroOpcional(form.minimoAsistentesPorClase),
    penalizacionImporteEur: form.penalizacionImporteEur.trim() === ''
      ? null
      : Math.max(0, Number(form.penalizacionImporteEur) || 0),
    especialidadNetwork: form.especialidadNetwork === '' ? null : form.especialidadNetwork,
    esOnline: form.esOnline,
  };
}

/**
 * Los dos campos van en unidades distintas (min vs días) y ambos son overrides
 * opcionales (#867): solo se comparan cuando ESTE tipo de clase fija los dos
 * explícitamente. Si uno hereda, quien manda es el estudio y ahí la coherencia
 * ya se comprueba en su propia pantalla.
 */
export function hayVentanaImposible(form: ClaseForm): boolean {
  const min = enteroOpcional(form.reservaVentanaMinimaMinutos);
  const maxDias = enteroOpcional(form.reservaAntelacionMaximaDias);
  return min != null && maxDias != null && min > maxDias * 24 * 60;
}

// ─── Frases ──────────────────────────────────────────────────────────────────
//
// Cada regla heredada tiene que poder leerse sin traducir unidades mentalmente:
// "120 minutos" es peor que "2 horas antes", y "0" no significa nada por sí
// solo. Estas funciones son la única fuente de esas frases.

export function resumenSiNo(valor: boolean, si: string, no: string): string {
  return valor ? si : no;
}

/** Minutos → la frase más corta que sigue siendo exacta. */
export function enPalabrasMinutos(min: number): string {
  if (min <= 0) return 'sin límite';
  if (min < 60) return `${min} minutos`;
  if (min % 60 === 0) return `${min / 60} ${min === 60 ? 'hora' : 'horas'}`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function resumenAntelacionMinima(min: number): string {
  return min <= 0 ? 'se puede reservar hasta el último momento' : `cierra ${enPalabrasMinutos(min)} antes`;
}

export function resumenAntelacionMaxima(dias: number | null): string {
  if (dias == null) return 'sin límite, se puede reservar con toda la antelación';
  if (dias <= 0) return 'solo el mismo día';
  return `se abre ${dias} ${dias === 1 ? 'día' : 'días'} antes`;
}

export function resumenHoras(horas: number): string {
  if (horas <= 0) return 'puede cancelar hasta el último momento';
  return `hasta ${horas} ${horas === 1 ? 'hora' : 'horas'} antes`;
}

export function resumenPlazoEspera(min: number): string {
  return min <= 0 ? 'se le asigna al instante' : `${enPalabrasMinutos(min)} para aceptar`;
}

export function resumenMinimoAsistentes(n: number): string {
  return n <= 0 ? 'sin mínimo, la clase sale siempre' : `${n} ${n === 1 ? 'alumna' : 'alumnas'}`;
}

export function resumenPenalizacion(importe: number | null): string {
  return importe == null || importe <= 0 ? 'no se cobra nada' : formatEuro(importe);
}

/** Lo que se enseña AL LADO DEL CAMPO de plazas, donde el hueco vacío necesita
 *  explicarse. */
export function resumenAforo(aforo: string): string {
  return plazasSiPropias(aforo) ?? 'las plazas de la sala';
}

/**
 * Las plazas, solo si esta clase fija las suyas. `null` = las pone la sala.
 *
 * Es lo que va en la ficha de la clase (previsualización y tarjeta): heredar de
 * la sala significa que todavía no se sabe cuántas serán —depende de dónde se
 * programe—, así que anunciar ahí "las plazas de la sala" contaría un detalle
 * interno del estudio en el sitio donde se resume la clase.
 */
export function plazasSiPropias(aforo: string): string | null {
  const n = parseInt(aforo, 10);
  return Number.isFinite(n) && n >= 1 ? `${n} ${n === 1 ? 'plaza' : 'plazas'}` : null;
}
