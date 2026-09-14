'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { useEstudio } from '@/components/student/contexto';
import {
  fetchConversaciones, fetchMensajes, enviarMensaje, marcarConversacionLeida, useMiAuthUserId,
  type ConversacionPortal,
} from '@/lib/student/mensajeria';
import { tituloConversacionAlumna } from '@/lib/mensajeria/presentacion';
import { HiloConversacion } from '@/components/student/domain/HiloConversacion';

// Hilo de una conversación de la alumna. La pantalla es compartida con la de la
// instructora (`HiloConversacion`); aquí solo se decide el título —el estudio o
// el nombre de su instructora— y de dónde salen los datos.

export default function HiloMensajesPage() {
  const { id } = useParams<{ id: string }>();
  const { estudio } = useEstudio();
  const miId = useMiAuthUserId();
  const [conv, setConv] = useState<ConversacionPortal | null>(null);

  const cargar = useCallback(async () => {
    const [mensajes, conversaciones] = await Promise.all([
      fetchMensajes(estudio.id, id),
      fetchConversaciones(estudio.id),
    ]);
    if (mensajes === null) throw new Error('mensajes');
    setConv(conversaciones?.find((c) => c.id === id) ?? null);
    return mensajes;
  }, [estudio.id, id]);
  const enviar = useCallback((cuerpo: string) => enviarMensaje(estudio.id, id, cuerpo), [estudio.id, id]);
  const marcarLeido = useCallback(() => marcarConversacionLeida(estudio.id, id), [estudio.id, id]);

  return (
    <HiloConversacion
      titulo={conv ? tituloConversacionAlumna(conv, estudio.nombre) : 'Mensajes'}
      cargar={cargar}
      enviar={enviar}
      marcarLeido={marcarLeido}
      miId={miId}
    />
  );
}
