import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';

// Pie simplificado: Network no repite las 20 columnas de la landing
// principal (funcionalidades del panel de gestión, que no pintan nada
// aquí), solo lo que aplica a esta audiencia — volver al producto
// principal, y lo legal, que es el mismo para todo tentare.app.

const SOPORTE_EMAIL = 'soporte@tentare.app';

export function SeccionPieNetwork() {
  return (
    <footer className="nw-pie">
      <div className="nw-pie-wrap">
        <div className="nw-pie-grid">
          <div className="nw-pie-marca">
            <LogoTentare formato="horizontal" tinta="blanco" producto="network" titulo="Tentare Network" alto={24} decorativo />
            <p className="nw-pie-desc">La red profesional de instructoras de Pilates y Yoga. Parte de Tentare, el software para estudios de Pilates.</p>
            <p className="nw-pie-contacto">
              ¿Dudas? Escríbenos a <a href={`mailto:${SOPORTE_EMAIL}`}>{SOPORTE_EMAIL}</a>
            </p>
          </div>
          <div className="nw-pie-col">
            <span className="nw-pie-tit">TENTARE</span>
            <Link href="/">Software para tu estudio</Link>
            <Link href="/network/instructoras">Buscar instructoras</Link>
            <Link href="/login">Entrar</Link>
          </div>
          <div className="nw-pie-col">
            <span className="nw-pie-tit">LEGAL</span>
            <Link href="/legal">Aviso legal</Link>
            <Link href="/privacidad">Privacidad</Link>
            <Link href="/terminos">Términos</Link>
            <Link href="/cookies">Cookies</Link>
          </div>
        </div>
        <div className="nw-pie-legal">
          <span>© 2026 Tentare · Software para estudios de Pilates · Hecho en España 🇪🇸</span>
        </div>
      </div>

      <style>{`
        .nw-pie { background: #0F0F0F; padding: 48px clamp(20px,4vw,48px) 32px; }
        .nw-pie-wrap { max-width: 1040px; margin: 0 auto; }
        .nw-pie-grid { display: grid; grid-template-columns: minmax(220px,1.4fr) repeat(2,1fr);
          gap: clamp(24px,4vw,48px); padding-bottom: 32px; border-bottom: 1px solid rgba(255,255,255,.09); }
        .nw-pie-marca { display: flex; flex-direction: column; gap: 14px; }
        .nw-pie-desc { font-size: 13.5px; line-height: 1.65; color: #A6A69E; max-width: 34ch; margin: 0; }
        .nw-pie-contacto { font-size: 13px; line-height: 1.6; color: #8E8E86; margin: 0; }
        .nw-pie-contacto a { color: #9FCBA8; }
        .nw-pie-contacto a:hover { text-decoration: underline; text-underline-offset: 3px; }
        .nw-pie-col { display: flex; flex-direction: column; gap: 11px; font-size: 13.5px; color: #A6A69E; }
        .nw-pie-col a { color: #A6A69E; }
        .nw-pie-col a:hover { color: #fff; }
        .nw-pie-tit { font-size: 10.5px; font-weight: 800; letter-spacing: .14em; color: #6E9977; margin-bottom: 2px; }
        .nw-pie-legal { padding-top: 18px; font-size: 12px; font-weight: 600; color: #5A5A52; }
      `}</style>
    </footer>
  );
}
