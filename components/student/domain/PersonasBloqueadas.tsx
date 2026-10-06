'use client';

import { useState } from 'react';
import { desbloquearPersona, type PersonaBloqueada } from '@/lib/student/bloqueos';
import { Button } from '@/components/student/ui/Button';
import { useToast } from '@/components/student/ui/Toast';

// «Personas bloqueadas» (App Store 1.2): a quién bloqueó en el tablón o en sus
// mensajes en este estudio, para poder desbloquearla. Es el sitio que prometen
// las confirmaciones de bloquear («Puedes desbloquearla en Perfil › Privacidad
// y datos»). Desbloquear no es optimista: la fila se va cuando el servidor lo
// confirma.
//
// La lista la pide la PÁGINA, junto al consentimiento, y esto se pinta cuando
// llegan las dos: si cargara por su cuenta, al llegar movería los enlaces de
// debajo y un toque durante la carga acabaría en otra acción.
export function PersonasBloqueadas({ studioId, data }: { studioId: string; data: PersonaBloqueada[] | null }) {
  const { toast } = useToast();
  const [quitadas, setQuitadas] = useState<string[]>([]);
  const [ocupada, setOcupada] = useState<string | null>(null);

  const desbloquear = async (p: PersonaBloqueada) => {
    if (ocupada) return;
    setOcupada(p.id);
    const r = await desbloquearPersona(studioId, p);
    setOcupada(null);
    if (!r.ok) { toast(r.error); return; }
    setQuitadas((q) => [...q, p.id]);
    toast(`Has desbloqueado a ${p.nombre}.`);
  };

  const personas = (data ?? []).filter((p) => !quitadas.includes(p.id));

  return (
    <section data-testid="personas-bloqueadas">
      <p className="t-label" style={{ margin: '0 0 7px' }}>Personas bloqueadas</p>
      {data === null && (
        <p className="t-meta" style={{ margin: 0 }}>No se han podido cargar. Vuelve a entrar en un momento.</p>
      )}
      {data && personas.length === 0 && (
        <p className="t-meta" style={{ margin: 0 }}>No has bloqueado a nadie.</p>
      )}
      {personas.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {personas.map((p, i) => (
            <div
              key={`${p.tipo}-${p.id}`}
              data-testid="persona-bloqueada"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 15px',
                borderBottom: i < personas.length - 1 ? '1px solid var(--muted)' : 'none',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--t-small)', fontWeight: 700 }}>{p.nombre}</span>
                <span className="t-meta">{p.tipo === 'TABLON' ? 'En el tablón' : 'En tus mensajes'}</span>
              </span>
              <Button size="sm" variant="secondary" loading={ocupada === p.id} disabled={ocupada !== null} onClick={() => void desbloquear(p)}>
                Desbloquear
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
