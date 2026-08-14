// La cerradura real del origen dedicado de temas publicados
// (`imports.tentare.app`). Pura y testeada aparte porque es exactamente el
// tipo de comprobación que, si se rompe en silencio, no falla con un error
// — sirve el tema bajo el origen de confianza del panel y nadie se entera
// hasta que alguien mira. Ver `app/tema-publicado/[slug]/[[...ruta]]/route.ts`
// para el porqué de que esto viva DENTRO del handler y no en un rewrite.
export function hostAutorizado(
  host: string | null,
  opts: { esProduccion: boolean; hostEsperado: string | undefined },
): boolean {
  // Fuera de producción no hay un host fijo que comprobar (preview deploys,
  // localhost) — se relaja para no bloquear el desarrollo.
  if (!opts.esProduccion) return true;
  // Sin configurar en producción: cerrado por defecto, nunca abierto.
  if (!opts.hostEsperado) return false;
  return host === opts.hostEsperado;
}
