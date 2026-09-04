// Indicador de plazas libres de una clase — antes texto gris plano en cada
// pantalla que lo necesitaba (portal-clases-view.tsx, portal-home-view.tsx),
// nunca usaba el color de urgencia ya calibrado. Mismo umbral que ya se ve en
// el prototipo de referencia: pocas plazas y completa se marcan en ámbar; con
// margen, texto neutro.
//
// ⚠️ COLOR DEL KIT LITERAL (`--ap-*`), no `useModo()`/`portal-tokens`. Era la
// tercera vía por la que el sistema de tokens viejo entraba en pantallas ya
// migradas (Inicio, detalle de clase, tarjeta de comunidad).
//
// Sigue siendo TEXTO, no una pill: los tres estados en forma de badge
// (`.ap-badge--ok/pocas/llena`) son cosa de las filas de Horario, que los
// pintan ellas con su propio marcado. Convertirlo aquí cambiaría la caja en
// los 4 sitios que lo usan sin poder verlos a la vez.

const URGENTE = 'var(--ap-ambar-tinta)';
const CAPTION: React.CSSProperties = { fontSize: 11.5, lineHeight: 1.3 };

export function AforoIndicator({
  libres, umbralUrgencia = 2, style,
}: { libres: number; umbralUrgencia?: number; style?: React.CSSProperties }) {
  if (libres <= 0) {
    return <span style={{ ...CAPTION, fontWeight: 700, color: URGENTE, ...style }}>Completa</span>;
  }
  if (libres <= umbralUrgencia) {
    return (
      <span style={{ ...CAPTION, fontWeight: 700, color: URGENTE, ...style }}>
        Queda{libres === 1 ? '' : 'n'} {libres} plaza{libres === 1 ? '' : 's'}
      </span>
    );
  }
  return <span style={{ ...CAPTION, color: 'var(--ap-sec)', ...style }}>{libres} plazas libres</span>;
}
