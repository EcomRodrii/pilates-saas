'use client';

// Fila con interruptor de la app (alumna e instructora). La fila entera es el
// <label>: se toca a menudo, y fallar por un par de píxeles no puede acabar
// cambiando OTRA preferencia.
export function Interruptor({ on, onChange, label, sub, disabled }: {
  on: boolean; onChange: (v: boolean) => void; label: string; sub?: string; disabled?: boolean;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 15px', minHeight: 56, borderBottom: '1px solid var(--muted)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <span>
        <span style={{ display: 'block', fontSize: 'var(--t-small)', fontWeight: 700 }}>{label}</span>
        {sub && <span className="t-meta" style={{ display: 'block', marginTop: 1 }}>{sub}</span>}
      </span>
      <button
        type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
        onClick={() => onChange(!on)}
        className="tap"
        style={{ position: 'relative', width: 44, height: 26, borderRadius: 99, border: 'none', background: on ? 'var(--success)' : 'var(--border-strong)', transition: 'background .25s', flexShrink: 0 }}
      >
        <span aria-hidden style={{ position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 2px 6px rgba(26,26,26,.25)', transform: on ? 'translateX(18px)' : 'none', transition: 'transform .25s var(--ease-spring)' }} />
      </button>
    </label>
  );
}
