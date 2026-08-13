'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ListaHilosMensajes } from '@/components/network/lista-hilos-mensajes';

// Bandeja de mensajes del estudio (brief §9/§19) — un hilo por solicitud de
// contacto que ESTE estudio envió y que la profesional aceptó. Mismo
// componente que el lado instructora (app/network/mensajes).
export default function MensajesNetworkPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/network" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft size={13} /> Volver al buscador
      </Link>

      <PageHeader
        title="Mensajes"
        description="Conversaciones con profesionales que han aceptado tu solicitud de contacto."
      />

      <ListaHilosMensajes vacioTexto="Todavía no tienes ninguna conversación. Contacta a una profesional desde el buscador." />
    </div>
  );
}
