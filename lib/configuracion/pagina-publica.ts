// «Ocultar tu página», en Mi app y mi web (16-sep).
//
// El ajuste y su ruta (`/api/pagina-publica`) existían, pero su única pantalla
// (`PanelVisibilidad`) vive en el editor de apariencia, cerrado por
// mantenimiento: nadie llegaba. Aquí vive lo que deciden los dos sitios —qué se
// manda, si hay cambios, qué se confirma y qué da el servidor por bueno— para
// que no haya dos copias que acaben diciendo cosas distintas.
//
// Lo que hace de verdad ocultarla (comprobado en el código, 16-sep):
//   · /reservar/{slug} y la app de las alumnas (/portal/{slug}) enseñan
//     «Estamos preparando esta página», también a quien ya tiene cuenta; con
//     clave, un campo para entrar (app/reservar/[slug]/layout.tsx,
//     app/portal/[slug]/layout.tsx);
//   · `noindex` en /reservar y fuera del sitemap (app/sitemap.ts);
//   · los widgets de <iframe> son /reservar?embed=1: enseñan el aviso. El
//     calendario incrustado (widget.js) lee la API pública, que NO mira esto:
//     sigue enseñando las clases (app/api/public/studio-data);
//   · Tentare Network no lo mira: si sale, sigue saliendo y su enlace lleva al aviso.
//
// Pura y sin `@/`: se prueba con `node --test`.

export interface EstadoPaginaPublica {
  oculta: boolean;
  tieneClave: boolean;
}

export interface FormPaginaPublica {
  oculta: boolean;
  /** Clave nueva escrita; vacía = no se toca la guardada. */
  clave: string;
  /** Quitar la clave guardada: oculta y sin forma de entrar. */
  quitarClave: boolean;
}

export interface CuerpoPaginaPublica {
  oculta: boolean;
  /** Ausente = no se toca; `''` = se quita; texto = se fija. */
  clave?: string;
}

/** La misma que exige `/api/pagina-publica`: si no, se deja escribir algo que luego rechaza. */
export const CLAVE_MINIMA = 6;

/**
 * Lo que responde el GET, o `null` si no dice nada con sentido. Un `{}` (un mock,
 * un proxy) NO es «visible»: sería afirmar algo que nadie ha dicho.
 */
export function leerEstadoPaginaPublica(json: unknown): EstadoPaginaPublica | null {
  if (!json || typeof json !== 'object') return null;
  const { oculta, tieneClave } = json as Record<string, unknown>;
  if (typeof oculta !== 'boolean') return null;
  return { oculta, tieneClave: tieneClave === true };
}

export function formularioPaginaPublica(e: EstadoPaginaPublica): FormPaginaPublica {
  return { oculta: e.oculta, clave: '', quitarClave: false };
}

/**
 * El cuerpo del PUT. Con la página visible la clave no se manda: su campo no se
 * ve, y guardar una clave que nadie ha visto escribir no es una decisión.
 */
export function cuerpoPaginaPublica(f: FormPaginaPublica): CuerpoPaginaPublica {
  const cuerpo: CuerpoPaginaPublica = { oculta: f.oculta };
  if (!f.oculta) return cuerpo;
  if (f.quitarClave) cuerpo.clave = '';
  else if (f.clave.trim()) cuerpo.clave = f.clave.trim();
  return cuerpo;
}

/** ¿Tendrá clave después de guardar esto? */
function tendraClave(c: CuerpoPaginaPublica, s: EstadoPaginaPublica): boolean {
  return c.clave === undefined ? s.tieneClave : c.clave !== '';
}

export function hayCambiosPaginaPublica(f: FormPaginaPublica, s: EstadoPaginaPublica): boolean {
  const c = cuerpoPaginaPublica(f);
  return c.oculta !== s.oculta || (c.clave !== undefined && (c.clave !== '' || s.tieneClave));
}

/** Por qué no se puede guardar todavía, o `null`. */
export function motivoClavePaginaPublica(f: FormPaginaPublica): string | null {
  const { clave } = cuerpoPaginaPublica(f);
  return clave && clave.length < CLAVE_MINIMA ? `La clave necesita al menos ${CLAVE_MINIMA} caracteres.` : null;
}

export interface ConfirmacionPaginaPublica {
  titulo: string;
  descripcion: string;
  textoConfirmar: string;
}

const AVISO = 'Tu página de reservas y la app de tus alumnas dirán «Estamos preparando esta página».';

/**
 * Lo que se pregunta antes de guardar: cambia lo que ven personas de fuera, así
 * que dice la consecuencia. El pase de quien entró con clave dura 30 días desde
 * que entró y no se anula al cambiar o quitar la clave (`veredictoPagina`).
 */
export function confirmacionPaginaPublica(f: FormPaginaPublica, s: EstadoPaginaPublica): ConfirmacionPaginaPublica | null {
  const c = cuerpoPaginaPublica(f);
  if (c.oculta && !s.oculta) {
    return {
      titulo: '¿Ocultar tu página?',
      descripcion: `${AVISO} ${tendraClave(c, s) ? 'Solo entra quien tenga la clave.' : 'No entrará nadie.'}`,
      textoConfirmar: 'Ocultar',
    };
  }
  if (!c.oculta && s.oculta) {
    return {
      titulo: '¿Volver a enseñar tu página?',
      descripcion: 'Cualquiera con tu enlace podrá reservar y tus alumnas volverán a entrar en su app.',
      textoConfirmar: 'Enseñarla',
    };
  }
  if (c.clave === '' && s.tieneClave) {
    return {
      titulo: '¿Quitar la clave?',
      descripcion: 'No entrará nadie más. Quien ya entró con ella puede seguir 30 días desde que entró.',
      textoConfirmar: 'Quitar la clave',
    };
  }
  if (c.clave) {
    return {
      titulo: s.tieneClave ? '¿Cambiar la clave?' : '¿Poner esta clave?',
      descripcion: s.tieneClave
        ? 'La anterior deja de servir. Quien ya entró con ella puede seguir 30 días desde que entró.'
        : 'Quien la tenga podrá ver tu página y la app de tus alumnas.',
      textoConfirmar: s.tieneClave ? 'Cambiar la clave' : 'Poner la clave',
    };
  }
  return null;
}

/**
 * Lo que queda guardado según el SERVIDOR, o `null` si su respuesta no lo
 * confirma: «Guardado» solo con respuesta real. La ruta devuelve la `oculta`
 * escrita y `tieneClave` solo si se tocó la clave.
 */
export function estadoConfirmado(json: unknown, cuerpo: CuerpoPaginaPublica, anterior: EstadoPaginaPublica): EstadoPaginaPublica | null {
  if (!json || typeof json !== 'object') return null;
  const { oculta, tieneClave } = json as Record<string, unknown>;
  if (oculta !== cuerpo.oculta) return null;
  return { oculta, tieneClave: typeof tieneClave === 'boolean' ? tieneClave : anterior.tieneClave };
}

/** El aviso de después de guardar. */
export function textoGuardadoPaginaPublica(nuevo: EstadoPaginaPublica, anterior: EstadoPaginaPublica): string {
  if (nuevo.oculta !== anterior.oculta) return nuevo.oculta ? 'Tu página ya no se ve.' : 'Tu página vuelve a estar visible.';
  return nuevo.tieneClave ? 'Clave guardada.' : 'Clave quitada.';
}
