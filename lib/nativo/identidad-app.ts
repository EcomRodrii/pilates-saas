// La identidad de una app nativa (bundle id, nombre, equipo de Apple), ya
// comprobada, en el formato del xcconfig que lee Xcode.
//
// La usa scripts/identidad-ios.mjs (`npm run cap:sync`) para escribir
// ios/identidad.local.xcconfig: así la app de un estudio sale del mismo
// proyecto que la de Tentare sin editar ni un fichero versionado. Puro, con
// tests (identidad-app.test.ts).
//
// ⚠️ Un xcconfig no tiene comillas ni escapes: `//` empieza un comentario y
// `$(…)` se expande. Por eso se rechaza lo que no se podría escribir tal cual,
// en vez de intentar escaparlo.

export interface IdentidadApp {
  bundleId: string;
  nombre: string;
  /** Team ID de Apple Developer (10 caracteres). Vacío: se elige en Xcode. */
  equipo: string;
}

/** Notación DNS inversa, como exige Apple: `app.tentare`, `app.tentare.estudio-luz`. */
export function esBundleIdValido(id: string): boolean {
  return /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/.test(id) && id.length <= 155;
}

/** El nombre bajo el icono: Apple corta a partir de ~12 caracteres y no admite más de 30 en la tienda. */
export function esNombreValido(nombre: string): boolean {
  return nombre.trim() === nombre
    && nombre.length > 0
    && nombre.length <= 30
    && !/[\u0000-\u001f\u007f$]|\/\//.test(nombre);
}

export function esEquipoValido(equipo: string): boolean {
  return equipo === '' || /^[A-Z0-9]{10}$/.test(equipo);
}

/** Comprueba y devuelve la identidad, o lanza con un mensaje que dice qué variable arreglar. */
export function identidadDesde(datos: { appId?: string; appName?: string; equipo?: string }): IdentidadApp {
  const bundleId = datos.appId ?? '';
  const nombre = datos.appName ?? '';
  const equipo = datos.equipo ?? '';
  if (!esBundleIdValido(bundleId)) throw new Error(`TENTARE_APP_ID no es un bundle id válido: «${bundleId}»`);
  if (!esNombreValido(nombre)) throw new Error(`TENTARE_APP_NAME no vale (1–30 caracteres, sin «$» ni «//»): «${nombre}»`);
  if (!esEquipoValido(equipo)) throw new Error(`TENTARE_APPLE_TEAM_ID tiene que tener 10 letras mayúsculas o cifras: «${equipo}»`);
  return { bundleId, nombre, equipo };
}

export function xcconfigDeIdentidad(i: IdentidadApp): string {
  return [
    '// Generado por scripts/identidad-ios.mjs (npm run cap:sync). No se edita ni se versiona.',
    `TENTARE_BUNDLE_ID = ${i.bundleId}`,
    `TENTARE_APP_NAME = ${i.nombre}`,
    `TENTARE_TEAM_ID = ${i.equipo}`,
    '',
  ].join('\n');
}
