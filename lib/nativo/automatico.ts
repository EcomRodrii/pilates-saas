// La tramitación automática de las apps de estudio (`scripts/apps-automatico.mjs`, desde el
// workflow «Apps de estudio · automático»). Lo puro: qué toca hacer con cada app según su estado en
// Tentare y lo que diga Apple. Sin imports de `@/`: lo usa un script de Node y `node --test`.
//
// El camino, sin nadie en medio:
//   PEDIDA ─(nombre en App Store Connect + activarla)→ EN_PREPARACION ─(compilar y subir)→
//   EN_PRUEBAS (cuando Apple ha procesado la compilación) ─(Apple la revisa)→ EN_REVISION →
//   PUBLICADA (con su enlace), o de vuelta a EN_PRUEBAS si Apple la rechaza.
// ⚠️ Lo único que NO hace solo es ENVIAR a revisión: esa decisión es del equipo (guía 4.2.6 y el
// cuestionario de privacidad, que Apple solo deja contestar en la web).

import type { EstadoApp } from '../app-nativa/pedir-app.ts';

/** Lo que el servidor da de cada app para tramitarla (`/api/interno/apps-estudio/automatico`). */
export interface AppParaTramitar {
  studioId: string;
  /** El slug del dueño de la app (la sede principal en una cadena): con él se compila. */
  slug: string | null;
  bundleId: string;
  /** Id de la app en App Store Connect (los huecos del lote); `null` si se creó a mano. */
  ascAppId: string | null;
  nombreApp: string;
  estado: EstadoApp;
  activa: boolean;
  urlTienda: string | null;
  /** ¿Su dueño paga Estudio/Cadena? Sin pagar no se gasta nada en ella. */
  pagada: boolean;
}

/** El estado de la compilación más reciente en App Store Connect. */
export type EstadoBuild = 'ninguna' | 'procesando' | 'valida' | 'fallida';

/** `processingState` de Apple → lo que nos importa. */
export function estadoDeBuild(processingState: string | null | undefined): EstadoBuild {
  if (!processingState) return 'ninguna';
  if (processingState === 'VALID') return 'valida';
  if (processingState === 'PROCESSING') return 'procesando';
  return 'fallida'; // FAILED, INVALID
}

/** Lo que dice Apple de la versión en la tienda, en nuestras palabras. */
export type FaseTienda = 'preparando' | 'en-revision' | 'rechazada' | 'publicada' | 'retirada' | 'desconocida';

/** `appVersionState` (o el antiguo `appStoreState`) de la versión más reciente → fase. */
export function faseDeVersion(estado: string | null | undefined): FaseTienda {
  switch (estado) {
    case 'PREPARE_FOR_SUBMISSION':
    case 'DEVELOPER_REJECTED':
    case 'READY_FOR_REVIEW':
    case 'WAITING_FOR_EXPORT_COMPLIANCE': // espera una respuesta nuestra: no está en manos de Apple
      return 'preparando';
    case 'WAITING_FOR_REVIEW':
    case 'IN_REVIEW':
    case 'PENDING_APPLE_RELEASE':
    case 'PENDING_DEVELOPER_RELEASE':
    case 'PROCESSING_FOR_DISTRIBUTION':
    case 'PROCESSING_FOR_APP_STORE':
    case 'ACCEPTED':
      return 'en-revision';
    case 'REJECTED':
    case 'METADATA_REJECTED':
    case 'INVALID_BINARY':
      return 'rechazada';
    case 'READY_FOR_DISTRIBUTION':
    case 'READY_FOR_SALE':
    case 'REPLACED_WITH_NEW_VERSION':
      return 'publicada';
    // Solo los da el antiguo `appStoreState`: `appVersionState` ya no tiene «retirada» (la retirada
    // de la venta es de disponibilidad, no de la versión). Por eso `pasoDe` no la usa.
    case 'DEVELOPER_REMOVED_FROM_SALE':
    case 'REMOVED_FROM_SALE':
      return 'retirada';
    default:
      return 'desconocida';
  }
}

/** El enlace de la ficha de una app en la App Store a partir de su id de App Store Connect. */
export const urlDeFicha = (ascAppId: string) => `https://apps.apple.com/es/app/id${ascAppId}`;

export type Paso =
  | { tipo: 'nada' }
  /** Ponerle su nombre en App Store Connect y, si sale bien, activarla y pasar a EN_PREPARACION. */
  | { tipo: 'preparar' }
  /** Compilar y subir (no hay compilación, o la última falló). */
  | { tipo: 'compilar' }
  /** Cambiar algo en Tentare porque Apple ha avanzado. */
  | { tipo: 'cambiar'; estado: EstadoApp; urlTienda?: string; evento: 'probando' | 'en-revision' | 'publicada' | 'rechazada' }
  /** Necesita a una persona (y por qué). */
  | { tipo: 'avisar'; motivo: 'sin-hueco' };

/**
 * Qué toca con una app, con lo que se sabe de Apple (`build` y `fase` solo hacen falta desde
 * EN_PREPARACION en adelante). Una app sin pagar no se toca (la pausa el margen de 30 días).
 */
export function pasoDe(app: AppParaTramitar, apple: { build?: EstadoBuild; fase?: FaseTienda } = {}): Paso {
  if (!app.pagada || app.estado === 'PAUSADA') return { tipo: 'nada' };
  if (app.estado === 'PEDIDA') return app.ascAppId ? { tipo: 'preparar' } : { tipo: 'avisar', motivo: 'sin-hueco' };
  if (!app.ascAppId) return { tipo: 'nada' };

  if (app.estado === 'EN_PREPARACION') {
    if (!app.activa) return { tipo: 'nada' };
    if (apple.build === 'valida') return { tipo: 'cambiar', estado: 'EN_PRUEBAS', evento: 'probando' };
    if (apple.build === 'ninguna' || apple.build === 'fallida') return { tipo: 'compilar' };
    return { tipo: 'nada' }; // procesando
  }

  const fase = apple.fase ?? 'desconocida';
  if (fase === 'publicada' && app.estado !== 'PUBLICADA') {
    return { tipo: 'cambiar', estado: 'PUBLICADA', urlTienda: app.urlTienda ?? urlDeFicha(app.ascAppId), evento: 'publicada' };
  }
  if (fase === 'en-revision' && app.estado === 'EN_PRUEBAS') return { tipo: 'cambiar', estado: 'EN_REVISION', evento: 'en-revision' };
  if (fase === 'rechazada' && app.estado === 'EN_REVISION') return { tipo: 'cambiar', estado: 'EN_PRUEBAS', evento: 'rechazada' };
  return { tipo: 'nada' };
}

/**
 * Los argumentos de `xcodebuild` para firmar con la clave de App Store Connect en una máquina sin
 * cuenta de Apple (GitHub Actions). Sin las tres variables, ninguno: en el Mac del equipo firma la
 * cuenta de Xcode, como siempre.
 */
export function argumentosDeClave(env: Record<string, string | undefined>): string[] {
  const ruta = env.ASC_KEY_PATH?.trim();
  const id = env.ASC_KEY_ID?.trim();
  const emisor = env.ASC_ISSUER_ID?.trim();
  if (!ruta || !id || !emisor) return [];
  return ['-authenticationKeyPath', ruta, '-authenticationKeyID', id, '-authenticationKeyIssuerID', emisor];
}

/**
 * Los certificados de desarrollo que ha creado ESTA compilación (los que están ahora y no estaban
 * antes). Xcode crea uno en cada máquina nueva al firmar con la clave; si no se revocan, la cuenta
 * llega al máximo de certificados y Apple deja de firmar. Solo se revocan estos: ninguno de antes.
 */
export function certificadosNuevos(antes: readonly string[], despues: readonly string[]): string[] {
  const viejos = new Set(antes);
  return despues.filter((id) => !viejos.has(id));
}
