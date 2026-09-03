'use client';

import { useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useEstudio } from '@/components/student/contexto';
import { useToast } from '@/components/student/ui/Toast';
import { getPreferencias, guardarPreferencia, type PreferenciaCategoria } from '@/lib/student/perfil-y-avisos';
import { ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Preferencias de aviso (§A.19).
//
// ⚠️ DESIGN CONFLICT · el paquete inventa cuatro interruptores («Recordatorio de
// clase», «Plaza liberada», «Novedades del estudio», «Recibos por email») que no
// existen en el backend. Lo que hay es un modelo de CATEGORÍA × CANAL: las
// categorías de una socia son `reservas`, `clases`, `pagos` y `marketing`
// (`CATEGORIAS_POR_ROL.SOCIA`), y los canales in-app, push, email, WhatsApp y
// SMS.
//
// Se respetan los NOMBRES del diseño —son mejores para una alumna que
// «categoría reservas»— pero cada uno gobierna su categoría real, no un
// interruptor inventado. Inventarlos habría producido una pantalla que guarda
// preferencias que el motor no lee.
//
// Ausencia de fila = encendido: es el valor por defecto del propio endpoint.

const FILAS: Array<{ categoria: string; label: string; sub?: string }> = [
  { categoria: 'reservas', label: 'Plaza liberada y reservas', sub: 'Cuando estés en lista de espera o cambie tu reserva' },
  { categoria: 'clases', label: 'Recordatorio de clase', sub: 'El día antes y un rato antes' },
  { categoria: 'pagos', label: 'Bonos y pagos', sub: 'Bono a punto de caducar, cobros' },
  { categoria: 'marketing', label: 'Novedades del estudio' },
];

function Toggle({ on, onChange, label, sub, disabled }: {
  on: boolean; onChange: (v: boolean) => void; label: string; sub?: string; disabled?: boolean;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 15px', minHeight: 56, borderBottom: '1px solid var(--muted)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <span>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{label}</span>
        {sub && <span className="t-meta" style={{ display: 'block', marginTop: 1 }}>{sub}</span>}
      </span>
      <button
        type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
        onClick={() => onChange(!on)}
        style={{ position: 'relative', width: 44, height: 26, borderRadius: 99, border: 'none', background: on ? '#4F8A5B' : 'var(--border-strong)', transition: 'background .25s', flexShrink: 0 }}
      >
        <span aria-hidden style={{ position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 2px 6px rgba(26,26,26,.25)', transform: on ? 'translateX(18px)' : 'none', transition: 'transform .25s var(--ease-spring)' }} />
      </button>
    </label>
  );
}

export default function PreferenciasPage() {
  const { estudio } = useEstudio();
  const { online } = useOnline();
  const { toast } = useToast();
  const [local, setLocal] = useState<Record<string, { push: boolean; email: boolean }>>({});

  const cargar = useCallback(async () => {
    const prefs = await getPreferencias();
    const mapa: Record<string, { push: boolean; email: boolean }> = {};
    for (const f of FILAS) {
      const p = prefs.find((x: PreferenciaCategoria) => x.category === f.categoria);
      // Sin fila, encendido: es el defecto del endpoint, no una suposición.
      mapa[f.categoria] = { push: p ? p.push : true, email: p ? p.email : false };
    }
    setLocal(mapa);
    return mapa;
  }, []);

  const { estado, reintentar } = useAsync(cargar, () => false);

  const cambiar = async (categoria: string, campo: 'push' | 'email', valor: boolean) => {
    const antes = local[categoria];
    // Optimista en la UI —un interruptor tiene que responder al instante— pero
    // se REVIERTE si el servidor dice que no. Dejarlo cambiado sería enseñarle
    // una preferencia que el motor no tiene.
    setLocal((s) => ({ ...s, [categoria]: { ...s[categoria], [campo]: valor } }));
    const ok = await guardarPreferencia({ studioId: estudio.id, category: categoria, [campo]: valor });
    if (!ok) {
      setLocal((s) => ({ ...s, [categoria]: antes }));
      toast('No hemos podido guardar ese cambio.');
    }
  };

  return (
    <StudentShell>
      <PageHeader titulo="Preferencias" back />
      <div className="px" style={{ marginTop: 14, maxWidth: 520 }}>
        {estado === 'loading' && <ListSkeleton n={2} h={120} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Necesitas conexión para cambiar tus avisos." />}

        {estado === 'ready' && (
          <>
            <p className="t-label" style={{ margin: '0 0 7px' }}>Avisos en el móvil</p>
            <div className="card" style={{ overflow: 'hidden' }}>
              {FILAS.map((f) => (
                <Toggle
                  key={f.categoria}
                  label={f.label}
                  sub={f.sub}
                  on={local[f.categoria]?.push ?? true}
                  disabled={!online}
                  onChange={(v) => void cambiar(f.categoria, 'push', v)}
                />
              ))}
            </div>

            <p className="t-label" style={{ margin: '16px 0 7px' }}>Email</p>
            <div className="card" style={{ overflow: 'hidden' }}>
              <Toggle
                label="Recibos y confirmaciones por email"
                on={local.pagos?.email ?? false}
                disabled={!online}
                onChange={(v) => void cambiar('pagos', 'email', v)}
              />
            </div>

            <p className="t-meta" style={{ margin: '14px 0 0', fontSize: 11, lineHeight: 1.5 }}>
              Los avisos de seguridad y los que afectan a tus reservas ya hechas se envían siempre.
            </p>
          </>
        )}
      </div>
    </StudentShell>
  );
}
