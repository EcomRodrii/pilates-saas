'use client';

import { useCallback, useEffect, useState } from 'react';
import { activarPushStudent, contextoPushStudent, desactivarPushStudent } from '@/lib/student/push';
import { estadoPush, textoPush, type EstadoPush } from '@/lib/student/push-estado';
import { esAppNativa } from '@/lib/nativo/puente';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { Interruptor } from '@/components/student/ui/Interruptor';

// El interruptor de «avisos al móvil en ESTE dispositivo», donde la alumna los
// mira: arriba de Avisos. Hasta ahora solo estaba en Perfil → Preferencias, y
// quien quería apagarlos (o encenderlos) tras ver un aviso no sabía dónde.
// Misma lógica que Preferencias: se relee el estado REAL después de cada acción,
// y nunca se dice «activados» sin estarlo. Si no hay nada que ella pueda hacer
// (permiso bloqueado, iPhone sin instalar) se explica en una línea; si el
// dispositivo no admite avisos, no se pinta nada.

export function InterruptorAvisos({ estudioId, slug }: { estudioId: string; slug: string }) {
  const { online } = useOnline();
  const { toast } = useToast();
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const leer = useCallback(async () => {
    setEstado(estadoPush(await contextoPushStudent(slug, estudioId)));
  }, [slug, estudioId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void leer().catch(() => setEstado(null)); }, [leer]);

  if (!estado || estado === 'unsupported' || estado === 'sin-clave') return null;
  const t = textoPush(estado, esAppNativa());

  async function alternar() {
    if (!t.accion || ocupado) return;
    setOcupado(true);
    try {
      if (t.accion === 'activar') {
        const r = await activarPushStudent(estudioId, slug);
        if (!r.ok && r.motivo !== 'denied') toast('No hemos podido activar los avisos en este dispositivo.', { variant: 'error' });
      } else if (!(await desactivarPushStudent(slug))) {
        toast('No hemos podido desactivar los avisos en este dispositivo.', { variant: 'error' });
      }
      await leer();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="px" style={{ marginTop: 12 }}>
      <div className="card" style={{ overflow: 'hidden' }} data-testid="avisos-interruptor" data-estado={estado}>
        {t.accion ? (
          <Interruptor label={t.titulo} sub={t.cuerpo} on={t.encendido} disabled={!online || ocupado} onChange={() => void alternar()} />
        ) : (
          <div style={{ padding: '13px 15px', minHeight: 56 }}>
            <span style={{ display: 'block', fontSize: 'var(--t-small)', fontWeight: 700 }}>{t.titulo}</span>
            <span className="t-meta" style={{ display: 'block', marginTop: 1 }}>{t.cuerpo}</span>
          </div>
        )}
      </div>
    </div>
  );
}
