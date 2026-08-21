// Borrador del alta de estudio: lo que se recuerda si alguien cierra la
// pestaña a medias, y las reglas de validación de cada paso.
//
// Vive fuera del componente por dos motivos: se puede probar sin montar React
// (node --test), y las reglas de validación dejan de estar repartidas entre el
// `disabled` de un botón y un `if` dentro del submit — que es como acaban
// divergiendo.

import type { Plan } from '@/lib/billing/entitlements';

export interface BorradorAlta {
  estudio: string;
  ciudad: string;
  plan: Plan;
  persona: string;
  email: string;
  contrasena: string;
  comoNosConocio: string;
}

export const BORRADOR_ALTA: BorradorAlta = {
  estudio: '',
  ciudad: '',
  // ESTUDIO por defecto y no BASE: es el que cubre a un estudio en marcha, y
  // durante la prueba interesa que se vea el producto entero. Bajar de plan
  // después es un clic; descubrir al cuarto día que el Centro de Control
  // existía pero no estaba encendido, no.
  plan: 'ESTUDIO',
  persona: '',
  email: '',
  contrasena: '',
  comoNosConocio: '',
};

/**
 * De dónde nos conoció. La lista es CERRADA a propósito, igual que el resto de
 * opciones del onboarding: `studios.como_nos_conocio` se agrega por valor en
 * /interno → Crecimiento, y con texto libre cada respuesta sería su propio
 * canal de uno («insta», «Instagram», «IG»).
 *
 * ⚠️ Este campo llevaba desde la migración 0123 LEYÉNDOSE y sin que nada lo
 * escribiera: `crear-estudio` lo mandaba en `pending_studio`, pero no había
 * ningún control en pantalla que lo rellenara, así que viajaba siempre vacío.
 * Comprobado en producción antes de tocarlo: 1 de 6 estudios tenía valor, y no
 * había salido de aquí. Es el mismo fallo que las cuatro `onb_*` —dato que se
 * guarda y no se usa— pero al revés: dato que se lee y nadie escribe.
 */
export const OPCIONES_COMO_NOS_CONOCIO = [
  'Instagram',
  'TikTok',
  'Google / buscador',
  'Recomendación de un conocido',
  'Me lo recomendó otro estudio',
  'Vi un anuncio',
  'YouTube',
  'LinkedIn',
  'Reddit / comunidad online',
  'Un evento o conferencia',
  'Un artículo o blog',
  'Buscando un software para mi estudio',
  'Ya conocía Tentare',
  'Otro',
] as const;

const CLAVE = 'tentare:alta-borrador';
/** Un borrador viejo es ruido: a los 7 días se descarta. */
const CADUCA_MS = 7 * 86_400_000;

/** Lo mínimo que Supabase acepta como contraseña en este proyecto. */
export const MIN_CLAVE = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Qué falta para poder pasar de este paso. `null` = se puede seguir.
 *
 * Devuelve el texto que se le enseña a la persona, no un código: hay un solo
 * mensaje por problema y no hay forma de que la pantalla enseñe uno distinto
 * del que decidió esta función.
 */
export function validarPaso(paso: number, d: BorradorAlta): string | null {
  if (paso === 1) {
    const nombre = d.estudio.trim();
    if (nombre.length < 2) return 'Escribe el nombre de tu estudio.';
    if (nombre.length > 120) return 'El nombre es demasiado largo (máximo 120 caracteres).';
    return null;
  }
  if (paso === 2) {
    // El selector no deja quedarse sin plan, pero un borrador manipulado en
    // localStorage sí puede llegar aquí con basura.
    return d.plan === 'BASE' || d.plan === 'ESTUDIO' || d.plan === 'CADENA' ? null : 'Elige un plan para continuar.';
  }
  if (paso === 3) {
    if (d.persona.trim().length < 2) return 'Escribe tu nombre.';
    if (!EMAIL_RE.test(d.email.trim())) return 'Revisa tu email: parece que falta algo.';
    if (d.email.trim().length > 200) return 'Ese email es demasiado largo.';
    if (d.contrasena.length < MIN_CLAVE) return `La contraseña necesita al menos ${MIN_CLAVE} caracteres.`;
    return null;
  }
  return null;
}

/** Lo que se guarda en disco. La CONTRASEÑA no está aquí, y es a propósito. */
type Guardable = Omit<BorradorAlta, 'contrasena'> & { guardadoEn: number };

export function guardarBorrador(d: BorradorAlta): void {
  if (typeof window === 'undefined') return;
  try {
    // ⚠️ `contrasena` se descarta explícitamente. localStorage lo lee cualquier
    // script de la página y sobrevive a cerrar el navegador: una contraseña ahí
    // queda a la vista de la siguiente persona que use el ordenador. Se pierde
    // al recargar y se vuelve a pedir, que es exactamente lo que debe pasar.
    const { contrasena: _descartada, ...resto } = d;
    void _descartada;
    const payload: Guardable = { ...resto, guardadoEn: Date.now() };
    window.localStorage.setItem(CLAVE, JSON.stringify(payload));
  } catch {
    // Modo privado de Safari, cuota llena, cookies bloqueadas. Perder el
    // borrador es un incordio; romper el alta por no poder guardarlo, no.
  }
}

export function leerBorrador(): Partial<BorradorAlta> | null {
  if (typeof window === 'undefined') return null;
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const d = JSON.parse(crudo) as Partial<Guardable>;
    if (typeof d?.guardadoEn !== 'number' || Date.now() - d.guardadoEn > CADUCA_MS) {
      window.localStorage.removeItem(CLAVE);
      return null;
    }
    // Se copian campo a campo, con su tipo comprobado: lo que hay en
    // localStorage lo puede editar cualquiera desde las herramientas del
    // navegador, así que volcarlo con un spread metería en el estado de React
    // lo que a esa persona le apeteciera.
    const texto = (v: unknown) => (typeof v === 'string' ? v.slice(0, 200) : '');
    const plan: Plan =
      d.plan === 'BASE' || d.plan === 'ESTUDIO' || d.plan === 'CADENA' ? d.plan : BORRADOR_ALTA.plan;
    return {
      estudio: texto(d.estudio),
      ciudad: texto(d.ciudad),
      persona: texto(d.persona),
      email: texto(d.email),
      // Solo si es una de las opciones: lo que hay en localStorage lo puede
      // editar cualquiera, y este valor acaba en una columna que después se
      // agrupa por valor en el panel interno.
      comoNosConocio: (OPCIONES_COMO_NOS_CONOCIO as readonly string[]).includes(texto(d.comoNosConocio))
        ? texto(d.comoNosConocio)
        : '',
      plan,
    };
  } catch {
    return null;
  }
}

export function olvidarBorrador(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    // Ver guardarBorrador.
  }
}
