'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useCore } from '@/lib/core-context';
import { useRol } from '@/lib/permisos';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import { tomarPreguntaPendiente, useAsistente, usePuertaAsistente } from '@/lib/asistente-context';
import { VistaChat } from '@/components/asistente/vista-chat';

// /asistente — «Pregúntale a Tentare», el chat. Propietaria y gerencia
// (puedeVer), con la feature `asistente` del plan y el servidor encendido para
// este estudio; si no, una línea que lo dice y nada más (ni campo, ni Tenti).
// Se llega por la barra del Centro de Control, la fila de ⌘K o ⌘J.

export default function AsistentePage() {
  const puerta = usePuertaAsistente();
  const { puede, disponible } = useAsistente();
  const rol = useRol();
  const { user } = useAuth();
  const { studio, instructores } = useCore();
  // La pregunta que trajo una puerta: se toma UNA vez, al montar.
  const [pregunta] = useState(() => tomarPreguntaPendiente());

  if (!puerta || !studio) {
    // Mientras se pregunta si está encendido, nada (es una fracción de segundo).
    if (puede && disponible === null) return null;
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <p className="text-[15px] font-medium text-foreground">El asistente no está disponible para tu estudio.</p>
        <Link href="/dashboard" className="mt-3 inline-block text-[13.5px] text-muted-foreground underline underline-offset-2">Volver a Inicio</Link>
      </div>
    );
  }
  const yo = instructores.find(i => i.authUserId === user?.id);
  const nombre = yo?.nombre?.trim().split(/\s+/)[0] ?? null;
  return <VistaChat studioId={studio.id} veDinero={puedeVerFinanzas(rol)} nombre={nombre} preguntaInicial={pregunta} />;
}
