'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useMiAuthUserId } from '@/lib/student/mensajeria';
import {
  enviarEnHiloInstructora, getHilosInstructora, getMensajesHilo, marcarHiloLeidoInstructora,
} from '@/lib/student/datos-instructora';
import type { AlumnaDelHilo, HiloInstructora } from '@/lib/student/mensajes-instructora';
import { vistaGuardada } from '@/lib/student/useAsync';
import { HiloConversacion } from '@/components/student/domain/HiloConversacion';
import { AVISO_ESTUDIO_PUEDE_LEER } from '@/lib/mensajeria/presentacion';

// Conversación de la instructora con una alumna suya. La misma pantalla que el
// hilo de la alumna (`HiloConversacion`); aquí la cabecera es la de un chat —su
// foto, «Tu alumna» y el enlace a su ficha— (15-sep-2026).

export default function HiloInstructoraPage() {
  const { id } = useParams<{ id: string }>();
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const esInstructora = Boolean(instructora);
  const miId = useMiAuthUserId();
  const [alumna, setAlumna] = useState<AlumnaDelHilo | null>(null);

  const cargar = useCallback(async () => {
    // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
    if (!esInstructora) return new Promise<never>(() => {});
    // Si la bandeja ya se vio, la alumna ya se conoce: no hace falta volver a
    // pedir todos los hilos (4-5 consultas) solo para la cabecera.
    const conocida = vistaGuardada<HiloInstructora[]>(`instr:${estudio.slug}:hilos`)?.find((h) => h.id === id)?.alumna;
    if (conocida) {
      setAlumna(conocida);
      return getMensajesHilo(estudio.slug, id);
    }
    const [mensajes, hilos] = await Promise.all([
      getMensajesHilo(estudio.slug, id),
      getHilosInstructora(estudio.slug).catch(() => null),
    ]);
    setAlumna(hilos?.find((h) => h.id === id)?.alumna ?? null);
    return mensajes;
  }, [esInstructora, estudio.slug, id]);
  const enviar = useCallback((cuerpo: string) => enviarEnHiloInstructora(estudio.slug, id, cuerpo), [estudio.slug, id]);
  const marcarLeido = useCallback(() => marcarHiloLeidoInstructora(estudio.slug, id), [estudio.slug, id]);

  return (
    <HiloConversacion
      modo="instructora"
      titulo={alumna?.nombre ?? 'Mensajes'}
      avatar={alumna ? { nombre: alumna.nombre, fotoUrl: alumna.fotoUrl } : null}
      subtitulo="Tu alumna"
      hrefPerfil={alumna ? href(`/equipo/alumnas/${encodeURIComponent(alumna.socioId)}`) : null}
      aviso={AVISO_ESTUDIO_PUEDE_LEER}
      cargar={cargar}
      enviar={enviar}
      marcarLeido={marcarLeido}
      miId={miId}
    />
  );
}
