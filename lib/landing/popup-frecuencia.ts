// Cuándo se puede enseñar el popup de «Empieza gratis» de la landing, y cuándo
// no. Es lo único que separa una invitación de un anuncio molesto, así que vive
// aparte del componente y se puede probar sin navegador.
//
// Las reglas, en orden de dureza:
//  1. Si ya pulsó «Empezar gratis», NUNCA MÁS. Ya está dentro del embudo;
//     volvérselo a ofrecer es ruido.
//  2. Si lo cerró, silencio durante 30 días. Cerrar es una respuesta, no un
//     accidente: repetirlo al día siguiente es exactamente lo que convierte
//     esto en publicidad.
//  3. Una sola vez por sesión de navegación, aunque recorra diez páginas.
//  4. Como mucho 3 veces en total. Quien ha visto tres y sigue sin pulsar, ha
//     contestado que no de la forma más clara que hay.

export interface RegistroPopup {
  /** Cuántas veces se ha llegado a enseñar. */
  vistas: number;
  /** Última vez que se enseñó (epoch ms). */
  ultimaVista: number | null;
  /** Lo cerró a mano (epoch ms de la última vez). */
  cerradoEn: number | null;
  /** Pulsó el CTA. Punto final. */
  convertido: boolean;
}

export const REGISTRO_VACIO: RegistroPopup = {
  vistas: 0,
  ultimaVista: null,
  cerradoEn: null,
  convertido: false,
};

export const MAX_VISTAS = 3;
export const SILENCIO_TRAS_CERRAR_MS = 30 * 86_400_000;

export interface ContextoPopup {
  registro: RegistroPopup;
  /** ¿Ya se ha enseñado en ESTA sesión de navegación? */
  vistoEnEstaSesion: boolean;
  /** Con sesión iniciada no se ofrece crear una cuenta que ya existe. */
  autenticado: boolean;
  ahora: number;
}

export function puedeMostrar(ctx: ContextoPopup): boolean {
  const { registro: r } = ctx;
  if (ctx.autenticado) return false;
  if (r.convertido) return false;
  if (ctx.vistoEnEstaSesion) return false;
  if (r.vistas >= MAX_VISTAS) return false;
  if (r.cerradoEn !== null && ctx.ahora - r.cerradoEn < SILENCIO_TRAS_CERRAR_MS) return false;
  return true;
}

// ── Persistencia ────────────────────────────────────────────────────────────
// `localStorage` para lo que debe durar entre visitas y `sessionStorage` para
// «ya se ha visto en esta sesión»: son dos preguntas distintas y guardar las
// dos en el mismo sitio obligaría a inventar un id de sesión a mano.

const CLAVE = 'tentare:popup-empezar';
const CLAVE_SESION = 'tentare:popup-empezar-sesion';

export function leerRegistro(): RegistroPopup {
  if (typeof window === 'undefined') return REGISTRO_VACIO;
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return REGISTRO_VACIO;
    const d = JSON.parse(crudo) as Partial<RegistroPopup>;
    // Campo a campo y con tipo comprobado: esto lo puede editar cualquiera
    // desde las herramientas del navegador, y un `vistas: "muchas"` haría que
    // la comparación de arriba se comportara de forma impredecible.
    return {
      vistas: typeof d.vistas === 'number' && d.vistas >= 0 ? d.vistas : 0,
      ultimaVista: typeof d.ultimaVista === 'number' ? d.ultimaVista : null,
      cerradoEn: typeof d.cerradoEn === 'number' ? d.cerradoEn : null,
      convertido: d.convertido === true,
    };
  } catch {
    return REGISTRO_VACIO;
  }
}

function escribir(r: RegistroPopup): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(r));
  } catch {
    // Modo privado, cuota llena o cookies bloqueadas. Si no se puede recordar,
    // el popup se comportará como si fuera la primera visita — molesto, pero
    // nunca motivo para romper la landing.
  }
}

export function vistoEnEstaSesion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(CLAVE_SESION) === '1';
  } catch {
    return false;
  }
}

export function anotarVista(ahora = Date.now()): void {
  const r = leerRegistro();
  escribir({ ...r, vistas: r.vistas + 1, ultimaVista: ahora });
  try {
    window.sessionStorage.setItem(CLAVE_SESION, '1');
  } catch {
    // Ver `escribir`.
  }
}

export function anotarCierre(ahora = Date.now()): void {
  escribir({ ...leerRegistro(), cerradoEn: ahora });
}

export function anotarConversion(): void {
  escribir({ ...leerRegistro(), convertido: true });
}
