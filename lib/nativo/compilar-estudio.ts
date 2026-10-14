// Las piezas puras de `scripts/app-estudio.mjs` (compilar y subir a TestFlight la
// app de un estudio). Sin imports de `@/`: las usa un script de Node y `node --test`.

/** El número de build: la fecha y la hora, siempre mayor que el anterior (Apple exige que crezca). */
export function numeroDeBuild(ahora: Date = new Date()): string {
  const d = (n: number, ancho = 2) => String(n).padStart(ancho, '0');
  return `${ahora.getUTCFullYear()}${d(ahora.getUTCMonth() + 1)}${d(ahora.getUTCDate())}${d(ahora.getUTCHours())}${d(ahora.getUTCMinutes())}`;
}

/**
 * Los parámetros con los que el servidor pinta el icono de un estudio (`inicial`, `color`,
 * `icono`, `logo`, `r`) a partir de la URL que devuelve `/api/public/app/app-estudio`, para
 * pedir esa MISMA imagen a 1024 px. Lo que no es de esa lista se descarta.
 */
export function urlIcono1024(origen: string, iconoUrl: string): string {
  const base = new URL(iconoUrl, origen);
  const url = new URL('/icono-estudio', origen);
  for (const k of ['inicial', 'color', 'icono', 'logo', 'r']) {
    const v = base.searchParams.get(k);
    if (v !== null) url.searchParams.set(k, v);
  }
  url.searchParams.set('size', '1024');
  return url.toString();
}

/** ¿Un PNG es de verdad del tamaño pedido y SIN canal alfa? (App Store Connect rechaza el alfa.) */
export function pngSinAlfa(png: Uint8Array, lado: number): boolean {
  if (png.length < 33) return false;
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!firma.every((b, i) => png[i] === b)) return false;
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const ancho = v.getUint32(16);
  const alto = v.getUint32(20);
  const tipoColor = png[25];
  // 2 = RGB, 0 = gris, 3 = paleta; 4 y 6 llevan alfa.
  return ancho === lado && alto === lado && tipoColor !== 4 && tipoColor !== 6;
}

/** ¿El `codesign -d --entitlements :-` del IPA exportado lleva lo que la app necesita? */
export function entitlementsCompletos(texto: string): { ok: boolean; faltan: string[] } {
  const requeridos: [string, RegExp][] = [
    ['notificaciones en producción (aps-environment = production)', /aps-environment[\s\S]*?production/],
    ['Entrar con Apple (applesignin)', /com\.apple\.developer\.applesignin/],
    ['enlaces universales (associated-domains)', /com\.apple\.developer\.associated-domains[\s\S]*?applinks:/],
  ];
  const faltan = requeridos.filter(([, re]) => !re.test(texto)).map(([nombre]) => nombre);
  return { ok: faltan.length === 0, faltan };
}

/**
 * `ExportOptions.plist` para exportar con la firma automática. `destino`: `export` deja el
 * IPA en disco (para comprobarlo) y `upload` lo sube a App Store Connect.
 */
export function opcionesDeExport(equipo: string, destino: 'export' | 'upload' = 'upload'): string {
  if (!/^[A-Z0-9]{10}$/.test(equipo)) throw new Error(`Team ID de Apple no válido: «${equipo}»`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>${destino}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>${equipo}</string>
</dict>
</plist>
`;
}

/** El Team ID que ya hay escrito en un `identidad.local.xcconfig`, o `''`. */
export function equipoDeXcconfig(texto: string): string {
  const m = /^\s*TENTARE_TEAM_ID\s*=\s*([A-Z0-9]{10})\s*$/m.exec(texto);
  return m ? m[1] : '';
}
