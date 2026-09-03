'use client';
import { useState } from 'react';
import { hoyISO } from '@/lib/student/formato';
/** Calendario mensual táctil: puntos = clases reservadas; el día seleccionado se resalta. */
export function Calendar({ value, onChange, marcados }: { value: string; onChange: (iso: string) => void; marcados: string[] }) {
  const [cursor, setCursor] = useState(() => value.slice(0, 7));
  const [y, m] = cursor.split('-').map(Number);
  const primero = new Date(y, m - 1, 1); const dias = new Date(y, m, 0).getDate();
  const offset = (primero.getDay() + 6) % 7;
  // ⚠️ El paquete usa `textTransform: 'capitalize'`, que en CSS pone en
  // mayúscula CADA palabra: «Septiembre De 2026». En castellano el «de» va en
  // minúscula. Se capitaliza solo la primera letra, en JS.
  const mesCrudo = primero.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const mes = mesCrudo.charAt(0).toUpperCase() + mesCrudo.slice(1);
  const mover = (n: number) => { const d = new Date(y, m - 1 + n, 1); setCursor(d.toISOString().slice(0, 7)); };
  const hoy = hoyISO();
  return (
    <div className="card" style={{ padding: '14px 14px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button type="button" aria-label="Mes anterior" onClick={() => mover(-1)} className="btn btn--ghost" style={{ width: 36, height: 36, padding: 0 }}>‹</button>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{mes}</p>
        <button type="button" aria-label="Mes siguiente" onClick={() => mover(1)} className="btn btn--ghost" style={{ width: 36, height: 36, padding: 0 }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <span key={d} className="t-label" style={{ textAlign: 'center', fontSize: 9 }}>{d}</span>)}
        {Array.from({ length: offset }).map((_, i) => <span key={'o' + i} />)}
        {Array.from({ length: dias }).map((_, i) => {
          const iso = cursor + '-' + String(i + 1).padStart(2, '0');
          const sel = iso === value, esHoy = iso === hoy, tiene = marcados.includes(iso), pasado = iso < hoy;
          return (
            <button key={iso} type="button" aria-pressed={sel} aria-label={iso + (tiene ? ', tienes clase' : '')} onClick={() => onChange(iso)}
              style={{ height: 44, border: esHoy && !sel ? '1.5px solid var(--primary)' : '1px solid transparent', borderRadius: 12, background: sel ? 'var(--primary)' : 'transparent', color: sel ? 'var(--primary-foreground)' : pasado ? 'var(--subtle-foreground)' : 'var(--foreground)', fontSize: 13, fontWeight: sel || esHoy ? 800 : 600, position: 'relative', transition: 'all .2s' }}>
              {i + 1}
              {tiene && <span aria-hidden style={{ position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', width: 5, height: 5, borderRadius: 99, background: sel ? 'var(--primary-foreground)' : '#4F8A5B' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
