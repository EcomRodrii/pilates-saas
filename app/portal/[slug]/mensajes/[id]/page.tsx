'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { useEstudio } from '@/components/student/contexto';
import {
  fetchConversaciones, fetchMensajes, enviarMensaje, marcarConversacionLeida, useMiAuthUserId,
  type ConversacionPortal,
} from '@/lib/student/mensajeria';
import { AVISO_ESTUDIO_PUEDE_LEER, tituloConversacionAlumna } from '@/lib/mensajeria/presentacion';
import { HiloConversacion } from '@/components/student/domain/HiloConversacion';
import { invalidarNoLeidas } from '@/lib/student/no-leidas';

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
  // Abrir el hilo marca leídos también sus avisos (el servidor lo hace en el
  // mismo PATCH). La campana vive en un caché de 60 s, así que se relee solo si
  // el servidor lo confirmó: sin confirmación, seguir encendida es lo honesto.
  const marcarLeido = useCallback(async (hasta: string | null) => {
    if (await marcarConversacionLeida(estudio.id, id, hasta)) invalidarNoLeidas(estudio.id);
  }, [estudio.id, id]);

  return (
    <HiloConversacion
      titulo={conv ? tituloConversacionAlumna(conv, estudio.nombre) : 'Mensajes'}
      // Por defecto se avisa: si la lista tarda o falla, nadie escribe en un hilo
      // con su instructora sin haberlo visto. Solo se quita si es con el estudio.
      aviso={conv && conv.tipo !== 'ALUMNA_INSTRUCTORA' ? null : AVISO_ESTUDIO_PUEDE_LEER}
      cargar={cargar}
      enviar={enviar}
      marcarLeido={marcarLeido}
      miId={miId}
    />
  );
}
