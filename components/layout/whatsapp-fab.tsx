'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/brand-icons';
import { useCore } from '@/lib/core-context';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';

// Mismo número que app/api/soporte/route.ts (SOPORTE_WHATSAPP) — el WhatsApp
// personal del fundador. A diferencia del HelpWidget del menú de perfil (que
// abre un formulario y crea un ticket en soporte_solicitudes), esto es un
// atajo directo: un clic abre WhatsApp con el mensaje ya escrito, sin pasar
// por ningún backend propio. No sustituye al HelpWidget, es un segundo punto
// de entrada más rápido para una duda puntual.
const SOPORTE_WHATSAPP = '+34640515871';

export function WhatsAppFab() {
  const { studio } = useCore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  // Plantilla fija con el nombre del estudio — sin campo editable, la
  // propietaria no tiene que mantener nada (decisión confirmada con el
  // usuario: "eso es para que me contacten conmigo, siempre me tendrán a mí").
  const mensaje = `Hola, soy de ${studio?.nombre ?? 'mi estudio'} y tengo una duda con Tentare:`;
  const href = enlaceWhatsApp(SOPORTE_WHATSAPP, mensaje) ?? '#';

  return (
    <div ref={ref} className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 flex flex-col items-end gap-3">
      {open && (
        <div className="w-72 rounded-2xl bg-card border border-border shadow-xl p-4 animate-sheet-pop-in origin-bottom-right">
          <div className="flex items-start justify-between gap-2">
            <div className="h-10 w-10 rounded-full bg-[#25D366]/10 flex items-center justify-center shrink-0">
              <WhatsAppIcon size={22} />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="text-muted-foreground hover:text-foreground rounded-full p-1 -m-1 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">¿Tienes alguna duda?</p>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
            Escríbenos por WhatsApp y te ayudaremos encantados.
          </p>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1EBE5A] text-white text-sm font-medium py-2.5 transition-colors"
          >
            <WhatsAppIcon size={16} className="[&_path]:fill-white" />
            Escribir por WhatsApp
          </a>
          <p className="mt-3 text-[11px] text-muted-foreground text-center">
            Te responde una persona, no una IA · Respuesta rápida
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar ayuda por WhatsApp' : 'Ayuda por WhatsApp'}
        aria-expanded={open}
        className="relative h-14 w-14 rounded-full bg-[#25D366] hover:bg-[#1EBE5A] shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
      >
        {!open && (
          <span className="absolute inset-0 rounded-full bg-[#25D366] animate-wa-fab-ring" aria-hidden />
        )}
        <WhatsAppIcon size={26} className="relative [&_path]:fill-white" />
      </button>
    </div>
  );
}
