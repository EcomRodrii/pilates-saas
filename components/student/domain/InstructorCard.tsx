import type { Instructora } from '@/lib/student/tipos';
import { notaTexto } from '@/lib/student/instructora';
export function InstructorCard({ i, onClick }: { i: Instructora; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card card--tap" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '6px 13px 6px 6px', borderRadius: 999, textAlign: 'left' }}>
      <span aria-hidden style={{ width: 32, height: 32, borderRadius: 999, background: i.fotoUrl ? 'url(' + i.fotoUrl + ') center/cover' : 'var(--accent-soft)', color: 'var(--accent-soft-foreground)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{!i.fotoUrl && i.iniciales}</span>
      <span style={{ fontSize: 12, fontWeight: 700 }}>{i.nombre}{i.rating && <span style={{ color: 'var(--muted-foreground)' }}> · <span style={{ color: 'var(--warning)' }}>★</span> {notaTexto(i.rating, undefined)}</span>}</span>
    </button>
  );
}
