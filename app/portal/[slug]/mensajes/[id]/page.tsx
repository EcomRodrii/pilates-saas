'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { useEstudio } from '@/components/student/contexto';
import {
  fetchConversaciones, fetchMensajes, enviarMensaje, marcarConversacionLeida, useMiAuthUserId,
} from '@/lib/student/mensajeria';
import { HiloConversacion } from '@/components/student/domain/HiloConversacion';

// Hilo de una conversación de la alumna. La pantalla es compartida con la de la
// instructora (`HiloConversacion`); aquí solo se decide el título y de dónde
// salen los datos.

function tituloDe(tipo: string | null, nombreEstudio: string): string {
  if (tipo === 'ALUMNA_MOSTRADOR') return nombreEstudio;
  if (tipo === 'ALUMNA_INSTRUCTORA') return 'Tu instructora';
  return 'Mensajes';
}

export default function HiloMensajesPage() {
  const { id } = useParams<{ id: string }>();
  const { estudio } = useEstudio();
  const miId = useMiAuthUserId();
  const [tipo, setTipo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [mensajes, conversaciones] = await Promise.all([
      fetchMensajes(estudio.id, id),
      fetchConversaciones(estudio.id),
    ]);
    if (mensajes === null) throw new Error('mensajes');
    const conv = conversaciones?.find((c) => c.id === id);
    setTipo(conv?.tipo ?? null);
    return mensajes;
  }, [estudio.id, id]);
  const enviar = useCallback((cuerpo: string) => enviarMensaje(estudio.id, id, cuerpo), [estudio.id, id]);
  const marcarLeido = useCallback(() => marcarConversacionLeida(estudio.id, id), [estudio.id, id]);

  return (
    <HiloConversacion
      titulo={tituloDe(tipo, estudio.nombre)}
      cargar={cargar}
      enviar={enviar}
      marcarLeido={marcarLeido}
      miId={miId}
    />
  );
}
