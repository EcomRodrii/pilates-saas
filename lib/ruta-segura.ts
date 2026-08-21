// Saneado de rutas de fichero que acaban componiendo una clave de almacenamiento.
// PURO (sin red ni env) para que lo puedan importar tanto el parser de ZIP —que
// corre bajo `node --test`— como lib/r2.ts.
//
// 🔴 Existe por el zip-slip cross-tenant de la auditoría del 21-ago: el
// importador de temas usaba los nombres de entrada del ZIP tal cual para
// componer `temas-importados/<studioId>/<id>/<ruta>`, y esa clave acaba dentro
// de un `new URL(...)` en lib/r2.ts, que COLAPSA los `..` antes de firmar y
// antes de enviar el PUT. Verificado:
//
//   temas-importados/S/ID/../../OTRO/ID2/index.html → /temas-importados/OTRO/ID2/index.html
//   temas-importados/S/ID/../../../backups/O/b.json → /backups/O/b.json
//
// Es decir, una propietaria podía sobrescribir el tema publicado —o el snapshot
// de backup, mismo bucket— de OTRO estudio subiendo un ZIP comprimido a mano.

/**
 * ¿La ruta se sale de su propia carpeta al resolverse?
 *
 * Se comprueba la RUTA, no la URL resultante: comparar pathnames rechazaría
 * claves legítimas con espacios o acentos (`assets/logo ñ.png`), que `URL`
 * percent-codifica y que el importador de temas sí produce.
 */
export function rutaConTravesia(ruta: string): boolean {
  return ruta.startsWith('/') || ruta.includes('\\') || ruta.split('/').includes('..');
}
