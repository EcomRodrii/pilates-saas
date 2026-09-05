import type { Bono, Clase, Instructora } from '@/lib/student/tipos';
import { etiquetaDia, euros } from '@/lib/student/formato';
/** Resumen antes de confirmar: clase + instructora + cómo se paga + política. */
export function BookingSummary({ clase, instructora, bono, politicaHoras }: { clase: Clase; instructora?: Instructora; bono: Bono | null; politicaHoras: number }) {
  const quedan = bono ? bono.creditosTotales - bono.creditosUsados : 0;
  return (
    <div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px' }}>
        <span aria-hidden style={{ width: 36, height: 36, borderRadius: 999, background: instructora?.fotoUrl ? 'url(' + instructora.fotoUrl + ') center/cover' : 'var(--accent-soft)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}><p style={{ margin: 0, fontSize: 12.5, fontWeight: 800 }}>{clase.nombre}</p><p className="t-meta" style={{ marginTop: 1 }}>{etiquetaDia(clase.fecha)} · {clase.hora} · {clase.duracionMin} min · {instructora?.nombre}</p></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--accent-soft)', borderRadius: 14, padding: '11px 14px', marginTop: 9 }}>
        <span aria-hidden style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 999, background: '#4F8A5B', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--accent-soft-foreground)' }}>{bono && quedan > 0 ? 'Se usará 1 sesión de tu ' + bono.nombre.toLowerCase() + ' (' + quedan + ' disponibles). No pagas nada hoy.' : (clase.sinPrecioSuelto ? 'Esta clase solo se reserva con bono. Puedes comprar uno desde Perfil → Comprar.' : 'Sin bono activo: clase suelta ' + euros(clase.precioSuelto) + '. El cobro se confirma en el siguiente paso.')}</p>
      </div>
      <p className="t-meta" style={{ margin: '9px 0 0', textAlign: 'center', fontSize: 10.5, color: 'var(--subtle-foreground)' }}>Cancelación gratuita hasta {politicaHoras} h antes — recuperas la sesión.</p>
    </div>
  );
}
