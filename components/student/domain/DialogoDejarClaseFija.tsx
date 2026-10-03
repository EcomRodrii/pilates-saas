'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlazaFijaVista } from '@/lib/student/tipos';
import { dejarPlazaFija } from '@/lib/student/plaza-fija-peticion';
import { TEXTOS_PLAZA_FIJA, losDias } from '@/lib/student/plaza-fija-textos';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { useToast } from '@/components/student/ui/Toast';

export type PlazaADejar = Pick<PlazaFijaVista, 'id' | 'diaSemana' | 'hora' | 'tipo' | 'sala' | 'deClaseFija'>;

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// La confirmación de dejar una clase fija, con lo que pasa con sus clases (la ventana REAL del estudio). La comparten la tarjeta de
// «Mis clases → Fijas» y el interruptor de «Auto reservable»: una sola copia, y la misma regla que cuando la quita el mostrador.
// Si el servidor dice que no, la plaza SIGUE y el diálogo se queda abierto con el motivo: nunca se dice que sí sin que lo sea.
export function DialogoDejarClaseFija({ plaza, onClose, onDejada }: { plaza: PlazaADejar | null; onClose: () => void; onDejada?: () => void }) {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { toast } = useToast();
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState('');

  async function confirmar() {
    if (!plaza?.id || enCurso) return;
    setEnCurso(true);
    setError('');
    const r = await dejarPlazaFija(estudio.slug, estudio.id, plaza.id);
    setEnCurso(false);
    if (!r.ok) {
      if (r.sesionCaducada) { router.push(href('/acceso/login')); return; }
      setError(r.error);
      return;
    }
    onClose();
    toast(TEXTOS_PLAZA_FIJA.dejada(r));
    onDejada?.();
  }

  const cerrar = () => { if (!enCurso) { setError(''); onClose(); } };

  return (
    <ConfirmationDialog
      open={plaza !== null}
      onClose={cerrar}
      titulo={TEXTOS_PLAZA_FIJA.dejarTitulo}
      cuerpo={plaza ? `${mayuscula(losDias(plaza.diaSemana))} · ${plaza.hora}${[plaza.tipo, plaza.sala].filter(Boolean).length ? ` · ${[plaza.tipo, plaza.sala].filter(Boolean).join(' · ')}` : ''}` : ''}
      confirmar={TEXTOS_PLAZA_FIJA.dejarConfirmar}
      cancelar={TEXTOS_PLAZA_FIJA.dejarMantener}
      tono="danger"
      loading={enCurso}
      onConfirm={() => void confirmar()}
    >
      {plaza && (
        <div data-testid="dejar-aviso" style={{ background: 'var(--accent-soft)', borderRadius: 'var(--radius-sm)', padding: '11px 14px', marginTop: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--accent-soft-foreground)' }}>
            {TEXTOS_PLAZA_FIJA.dejarCancela(estudio.politicaCancelacionHoras)}
          </p>
          {plaza.deClaseFija && (
            <p style={{ margin: 0, fontSize: 'var(--t-small)', color: 'var(--accent-soft-foreground)' }}>{TEXTOS_PLAZA_FIJA.dejarVarios}</p>
          )}
          <p style={{ margin: 0, fontSize: 'var(--t-small)', color: 'var(--accent-soft-foreground)' }}>{TEXTOS_PLAZA_FIJA.dejarVuelve}</p>
          {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--danger, #b00020)' }}>{error}</p>}
        </div>
      )}
    </ConfirmationDialog>
  );
}
