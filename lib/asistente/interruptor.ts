// El interruptor del asistente (`ASISTENTE_IA`), puro para poder probarlo.
//
//   ASISTENTE_IA=on                     → encendido para todos los estudios
//   ASISTENTE_IA=estudios:<id1>,<id2>   → solo en esos estudios (el fundador lo
//                                         prueba en producción antes que nadie)
//   cualquier otra cosa (o sin poner)   → apagado
//
// Y siempre con clave de Anthropic: sin ella no hay a quién preguntar. Se lee
// en cada petición, así que apagarlo es cambiar la variable en Vercel, sin
// desplegar código… salvo que la variable necesita un despliegue de código
// para llegar a producción (ver «Un merge de solo documentación NO despliega»
// en .claude/tentare-os.md).

const PREFIJO_ESTUDIOS = 'estudios:';

/** Los estudios de `estudios:<id1>,<id2>`, o null si el valor no es de esa forma. */
export function estudiosDelInterruptor(valor: string | undefined): string[] | null {
  const v = (valor ?? '').trim();
  if (!v.toLowerCase().startsWith(PREFIJO_ESTUDIOS)) return null;
  return v.slice(PREFIJO_ESTUDIOS.length).split(',').map(s => s.trim()).filter(Boolean);
}

export function asistenteEncendidoPara(valor: string | undefined, hayClave: boolean, studioId: string): boolean {
  if (!hayClave) return false;
  if ((valor ?? '').trim() === 'on') return true;
  const estudios = estudiosDelInterruptor(valor);
  return !!estudios && !!studioId && estudios.includes(studioId);
}
