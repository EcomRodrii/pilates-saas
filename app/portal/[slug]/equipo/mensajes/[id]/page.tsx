'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { useEstudio } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useMiAuthUserId } from '@/lib/student/mensajeria';
import {
  enviarEnHiloInstructora, getHilosInstructora, getMensajesHilo, marcarHiloLeidoInstructora,
} from '@/lib/student/datos-instructora';
import { HiloConversacion } from '@/components/student/domain/HiloConversacion';
import { AVISO_ESTUDIO_PUEDE_LEER } from '@/lib/mensajeria/presentacion';

// Conversación de la instructora con una alumna suya. La misma pantalla que el
// hilo de la alumna (`HiloConversacion`); el título es el nombre corto de la
// alumna.

export default function HiloInstructoraPage() {
  const { id } = useParams<{ id: string }>();
  const { estudio } = useEstudio();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const esInstructora = Boolean(instructora);
  const miId = useMiAuthUserId();
  const [titulo, setTitulo] = useState('Mensajes');

  const cargar = useCallback(async () => {
    // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
    if (!esInstructora) return new Promise<never>(() => {});
    const [mensajes, hilos] = await Promise.all([
      getMensajesHilo(estudio.slug, id),
      getHilosInstructora(estudio.slug).catch(() => null),
    ]);
    const alumna = hilos?.find((h) => h.id === id)?.alumna;
    if (alumna) setTitulo(alumna.nombre);
    return mensajes;
  }, [esInstructora, estudio.slug, id]);
  const enviar = useCallback((cuerpo: string) => enviarEnHiloInstructora(estudio.slug, id, cuerpo), [estudio.slug, id]);
  const marcarLeido = useCallback(() => marcarHiloLeidoInstructora(estudio.slug, id), [estudio.slug, id]);

  return (
    <HiloConversacion
      modo="instructora"
      titulo={titulo}
      aviso={AVISO_ESTUDIO_PUEDE_LEER}
      cargar={cargar}
      enviar={enviar}
      marcarLeido={marcarLeido}
      miId={miId}
    />
  );
}
