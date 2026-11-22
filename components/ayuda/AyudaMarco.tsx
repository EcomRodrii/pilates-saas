import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { WhatsAppIcon } from '@/components/icons/brand-icons';
import { PieWeb } from '@/components/web/PieWeb';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { SOPORTE_WHATSAPP } from '@/lib/soporte';
import './ayuda-marco.css';

/**
 * El marco común del Centro de ayuda (portada, categorías y artículos), con la forma del de Shopify: barra mínima (logo +
 * «Ayuda»), lienzo blanco con las esquinas de arriba redondeadas y «Chat humano» (el WhatsApp de soporte: una persona, no
 * un robot) flotando. Sustituye a la isla de la web en estas páginas. El pie legal sigue siendo el de toda la web pública.
 */
export function AyudaMarco({ children, ancho = 760, portada = false }: { children: ReactNode; ancho?: number; portada?: boolean }) {
  const chat = enlaceWhatsApp(SOPORTE_WHATSAPP, 'Hola, tengo una duda sobre Tentare:');
  return (
    <>
      <div className="ay-marco">
        <header className="ay-barra">
          <Link href="/ayuda" className="ay-logo" aria-label="Centro de ayuda de Tentare">
            <LogoTentare formato="isotipo" tinta="auto" alto={26} titulo="Tentare" />
            <span>Ayuda</span>
          </Link>
          <Link href="/login" className="ay-entrar">Abrir Tentare</Link>
        </header>
        <main className={`ay-lienzo${portada ? ' ay-lienzo--portada' : ''}`}>
          <div className="ay-contenido" style={{ '--ay-ancho': `${ancho}px` } as CSSProperties}>{children}</div>
        </main>
        {chat && (
          <a href={chat} target="_blank" rel="noreferrer" className="ay-chat">
            <WhatsAppIcon size={15} /> Chat humano
          </a>
        )}
      </div>
      <PieWeb />
    </>
  );
}
