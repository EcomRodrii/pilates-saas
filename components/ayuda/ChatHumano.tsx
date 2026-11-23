'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/brand-icons';

// «Chat humano» abajo a la derecha, como el de Shopify: al pulsarlo da las vías a una persona. ⚠️ Sin «5 minutos de espera»: no hay
// una cola que mida el tiempo, y un número inventado sería mentir. Lo que sí es verdad es que contesta una persona.
export function ChatHumano({ whatsapp }: { whatsapp: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);
  return (
    <div className="ay-chat-caja" ref={caja}>
      {abierto && (
        <ul className="ay-chat-menu">
          {whatsapp && <li><a href={whatsapp} target="_blank" rel="noreferrer"><WhatsAppIcon size={15} /> <span>Chatear por WhatsApp<small>Te responde una persona</small></span></a></li>}
          <li><a href="mailto:soporte@tentare.app"><MessageCircle size={15} aria-hidden="true" /> <span>Escribir un correo<small>soporte@tentare.app</small></span></a></li>
        </ul>
      )}
      <button type="button" className="ay-chat" aria-expanded={abierto} aria-haspopup="true" onClick={() => setAbierto((v) => !v)}>
        <MessageCircle size={15} aria-hidden="true" /> Chat humano
      </button>
    </div>
  );
}
