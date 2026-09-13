'use client';

import { useCallback, useState } from 'react';
import { useToast } from '@/components/student/ui/Toast';
import { useOnline } from '@/lib/student/useOnline';
import { useAsync } from '@/lib/student/useAsync';
import { getMisDerechos, guardarOposicionPerfilado } from '@/lib/student/derechos';

// «No usar mis datos para recomendaciones automáticas del estudio» — oposición
// al perfilado (art. 21 RGPD), en Preferencias. Lo controla la alumna y surte
// efecto sin pasar por el estudio: el Decision OS deja de señalarla en el
// análisis siguiente (`lib/decision/perfilado.ts`).
//
// Mismo patrón que los interruptores de avisos de esta pantalla: responde al
// instante y se REVIERTE si el servidor no lo guarda. Componente propio para
// que la página solo lo monte.

export function OposicionPerfilado({ slug }: { slug: string }) {
  const { toast } = useToast();
  const { online } = useOnline();
  const cargar = useCallback(() => getMisDerechos(slug), [slug]);
  const { data, estado } = useAsync(cargar, () => false);
  const [local, setLocal] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);

  if (!data) {
    return estado === 'error'
      ? <p className="t-meta" style={{ margin: '16px 0 0' }}>No hemos podido cargar tus opciones de privacidad.</p>
      : null;
  }

  const on = local ?? data.excluirDePerfilado;
  const label = 'No usar mis datos para recomendaciones automáticas del estudio';

  const cambiar = async (valor: boolean) => {
    if (guardando) return;
    const antes = on;
    setLocal(valor);
    setGuardando(true);
    const guardado = await guardarOposicionPerfilado(slug, valor);
    setGuardando(false);
    if (guardado === null) {
      setLocal(antes);
      toast('No hemos podido guardar ese cambio.');
      return;
    }
    setLocal(guardado);
  };

  return (
    <>
      <p className="t-label" style={{ margin: '16px 0 7px' }}>Tus datos</p>
      <div className="card" style={{ overflow: 'hidden' }}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 15px', minHeight: 56, cursor: online ? 'pointer' : 'default', opacity: online ? 1 : 0.6 }}>
          <span>
            <span style={{ display: 'block', fontSize: 'var(--t-small)', fontWeight: 700 }}>{label}</span>
            <span className="t-meta" style={{ display: 'block', marginTop: 1 }}>
              Tu estudio no verá sugerencias automáticas basadas en tu actividad, como que llevas tiempo sin venir. No
              afecta a tus reservas ni a tus avisos.
            </span>
          </span>
          <button
            type="button" role="switch" aria-checked={on} aria-label={label} disabled={!online || guardando}
            onClick={() => void cambiar(!on)}
            className="tap"
            style={{ position: 'relative', width: 44, height: 26, borderRadius: 99, border: 'none', background: on ? 'var(--success)' : 'var(--border-strong)', transition: 'background .25s', flexShrink: 0 }}
          >
            <span aria-hidden style={{ position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 2px 6px rgba(26,26,26,.25)', transform: on ? 'translateX(18px)' : 'none', transition: 'transform .25s var(--ease-spring)' }} />
          </button>
        </label>
      </div>
    </>
  );
}
