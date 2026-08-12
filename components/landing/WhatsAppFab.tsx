'use client';

import { useEffect, useRef, useState } from 'react';
import { WhatsAppIcon } from '@/components/icons/brand-icons';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';

// Versión de la landing del botón flotante de WhatsApp del panel
// (components/layout/whatsapp-fab.tsx) — mismo número real del fundador
// (SOPORTE_WHATSAPP, compartido con app/api/soporte/route.ts), mismo icono,
// mismo criterio visual. La diferencia es el mensaje: el del panel mete el
// nombre del estudio (`useCore()`), que aquí no existe — quien visita la
// landing todavía no tiene estudio. Mensaje genérico en su lugar.
const SOPORTE_WHATSAPP = '+34640515871';
const MENSAJE = 'Hola, tengo una duda sobre Tentare:';

export function WhatsAppFab() {
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

  const href = enlaceWhatsApp(SOPORTE_WHATSAPP, MENSAJE) ?? '#';

  return (
    <div ref={ref} className="v5-wa-fab">
      {open && (
        <div className="v5-wa-panel">
          <div className="v5-wa-panel-cabecera">
            <span className="v5-wa-icono-zona"><WhatsAppIcon size={22} /></span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="v5-wa-cerrar">✕</button>
          </div>
          <p className="v5-wa-tit">¿Tienes alguna duda?</p>
          <p className="v5-wa-desc">Escríbenos por WhatsApp y te ayudaremos encantados.</p>
          <a href={href} target="_blank" rel="noopener noreferrer" className="v5-wa-boton">
            <WhatsAppIcon size={16} className="v5-wa-boton-icono" />
            Escribir por WhatsApp
          </a>
          <p className="v5-wa-nota">Te responde una persona, no una IA · Respuesta rápida</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar ayuda por WhatsApp' : 'Ayuda por WhatsApp'}
        aria-expanded={open}
        className="v5-wa-toggle"
      >
        {!open && <span className="v5-wa-anillo" aria-hidden />}
        <WhatsAppIcon size={26} className="v5-wa-toggle-icono" />
      </button>

      <style>{`
        .v5-wa-fab { position: fixed; bottom: 24px; right: 20px; z-index: 70; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
        .v5-wa-toggle { position: relative; width: 56px; height: 56px; border-radius: 50%; background: #25D366; border: none;
          box-shadow: 0 10px 30px rgba(0,0,0,.28); display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: transform .15s; }
        .v5-wa-toggle:hover { transform: scale(1.05); background: #1EBE5A; }
        .v5-wa-toggle:active { transform: scale(.95); }
        .v5-wa-toggle-icono { position: relative; }
        .v5-wa-toggle-icono path { fill: #fff; }
        .v5-wa-anillo { position: absolute; inset: 0; border-radius: 50%; background: #25D366; animation: v5-wa-ping 2.2s ease-out infinite; }
        @keyframes v5-wa-ping { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(1.7); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .v5-wa-anillo { animation: none; } }

        .v5-wa-panel { width: 288px; max-width: calc(100vw - 40px); border-radius: 18px; background: #fff;
          border: 1px solid #E7E7E0; box-shadow: 0 24px 60px -20px rgba(26,26,26,.35); padding: 16px; }
        .v5-wa-panel-cabecera { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .v5-wa-icono-zona { width: 40px; height: 40px; border-radius: 999px; background: rgba(37,211,102,.1);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .v5-wa-cerrar { background: none; border: none; color: #8E8E86; font-size: 14px; cursor: pointer; padding: 4px; line-height: 1; }
        .v5-wa-cerrar:hover { color: #1A1A1A; }
        .v5-wa-tit { margin: 12px 0 4px; font-size: 14px; font-weight: 700; color: #1A1A1A; }
        .v5-wa-desc { margin: 0; font-size: 13.5px; line-height: 1.5; color: #5A5A52; }
        .v5-wa-boton { margin-top: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;
          border-radius: 12px; background: #25D366; color: #fff; font-size: 14px; font-weight: 700; padding: 10px;
          transition: background .2s; }
        .v5-wa-boton:hover { background: #1EBE5A; }
        .v5-wa-boton-icono path { fill: #fff; }
        .v5-wa-nota { margin: 10px 0 0; font-size: 11px; color: #8E8E86; text-align: center; }
      `}</style>
    </div>
  );
}
