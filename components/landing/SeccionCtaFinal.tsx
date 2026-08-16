import Image from 'next/image';
import Link from 'next/link';
import { X } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { esExterno, PIE_V5 } from './enlaces';

// Redes sociales de Tentare (la marca, no las del estudio — esas son
// per-estudio en el Theme Builder, ver REDES_SOCIALES en /reservar/[slug]).
const REDES_TENTARE = [
  { href: 'https://x.com/tentaresoftware', label: 'X (Twitter)', Icono: X },
  { href: 'https://www.instagram.com/tentareapp/', label: 'Instagram', Icono: IconoInstagram },
];

function IconoInstagram({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <rect x={3} y={3} width={18} height={18} rx={5} />
      <circle cx={12} cy={12} r={4} />
      <circle cx={17.2} cy={6.8} r={1.1} fill="currentColor" stroke="none" />
    </svg>
  );
}

// Sección 13 ("CTA final") + pie de página de la landing v5.
//
// El diseño original usaba una foto de stock de Unsplash embebida por URL.
// Aquí se usa /disciplinas/pilates.jpg — la única foto real de un estudio de
// Pilates que ya tiene el repo (ver el comentario en FeatureShell.tsx), en
// vez de enlazar una imagen externa sin licencia verificada.

// Mismo número que WhatsAppFab.tsx y app/api/soporte/route.ts
// (SOPORTE_WHATSAPP) — el WhatsApp real del fundador.
const SOPORTE_WHATSAPP = '+34640515871';
const SOPORTE_EMAIL = 'soporte@tentare.app';

function EnlacePie({ href, children }: { href: string; children: React.ReactNode }) {
  if (esExterno(href)) return <a href={href}>{children}</a>;
  return <Link href={href}>{children}</Link>;
}

export function SeccionCtaFinal() {
  const enlaceWa = enlaceWhatsApp(SOPORTE_WHATSAPP, 'Hola, tengo una duda sobre Tentare:') ?? '#';

  return (
    <>
      <section className="v5-cta" aria-labelledby="v5-cta-h">
        <Image src="/disciplinas/pilates.jpg" alt="" fill sizes="100vw" style={{ objectFit: 'cover', objectPosition: 'center 35%' }} />
        <div className="v5-cta-velo" aria-hidden />
        <div className="v5-cta-cuerpo">
          <h2 id="v5-cta-h" className="v5-cta-h2">Vale. Esto es diferente. Pruébalo.</h2>
          <p className="v5-cta-lead">En marcha en días. Y si no te convence, te vas con todos tus datos, gratis.</p>
          <div className="v5-cta-acciones">
            <Link href="/crear-estudio" className="v5-cta-boton">Probar Tentare</Link>
          </div>
        </div>
      </section>

      <footer className="v5-pie">
        <div className="v5-pie-wrap">
          <div className="v5-pie-grid">
            <div className="v5-pie-marca">
              <LogoTentare formato="horizontal" tinta="blanco" alto={25} decorativo />
              <p className="v5-pie-desc">El software completo para tu estudio de pilates. Y el que cubre las bajas de instructoras solo.</p>
              <p className="v5-pie-contacto">
                Contáctanos por correo en <a href={`mailto:${SOPORTE_EMAIL}`}>{SOPORTE_EMAIL}</a> o por{' '}
                <a href={enlaceWa} target="_blank" rel="noopener noreferrer">WhatsApp</a> — respuestas humanas.
              </p>
              <div className="v5-pie-redes">
                {REDES_TENTARE.map(({ href, label, Icono }) => (
                  <a key={href} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
                    <Icono size={16} />
                  </a>
                ))}
              </div>
            </div>
            {PIE_V5.map((col) => (
              <div key={col.titulo} className="v5-pie-col">
                <span className="v5-pie-tit">{col.titulo.toUpperCase()}</span>
                {col.enlaces.map((l) => <EnlacePie key={l.href} href={l.href}>{l.label}</EnlacePie>)}
              </div>
            ))}
          </div>
          <div className="v5-pie-legal">
            <span>© 2026 Tentare · Software para estudios de Pilates · Hecho en España 🇪🇸</span>
            <div className="v5-pie-legal-der">
              <span>RGPD · Tus datos son tuyos</span>
              <a href="https://sellwithboost.com" target="_blank" rel="noopener noreferrer" className="v5-pie-badge">
                {/* eslint-disable-next-line @next/next/no-img-element -- badge externo, no un asset propio */}
                <img src="https://sellwithboost.com/badge/listing-dark.svg" alt="Listed on Sell With boost" width={110} height={40} />
              </a>
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        .v5-cta { position: relative; min-height: 60vh; display: flex; align-items: center; isolation: isolate; overflow: hidden; }
        .v5-cta-velo { position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(120deg,rgba(15,15,15,.86) 0%,rgba(15,15,15,.6) 55%,rgba(15,15,15,.25) 100%); }
        .v5-cta-cuerpo { position: relative; max-width: 1240px; width: 100%; margin: 0 auto; padding: 90px clamp(20px,4vw,48px); }
        .v5-cta-h2 { font-size: clamp(32px,5vw,64px); font-weight: 800; line-height: 1; letter-spacing: -.04em;
          color: #fff; margin: 0 0 18px; max-width: 16ch; text-wrap: balance; }
        .v5-cta-lead { font-size: 17.5px; font-weight: 500; color: rgba(255,255,255,.85); margin: 0 0 30px; }
        .v5-cta-acciones { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .v5-cta-boton { background: #D9C29E; color: #22251A; font-weight: 800; font-size: 17px; padding: 18px 36px;
          border-radius: 999px; transition: transform .2s; }
        .v5-cta-boton:hover { transform: translateY(-2px); }
        .v5-cta-boton-2 { color: #fff; font-weight: 700; font-size: 16px; padding: 17px 26px;
          border: 1.5px solid rgba(255,255,255,.4); border-radius: 999px; }

        .v5-pie { background: #0F0F0F; padding: 56px clamp(20px,4vw,48px) 32px; }
        .v5-pie-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-pie-grid { display: grid; grid-template-columns: minmax(220px,1.2fr) repeat(auto-fit,minmax(140px,1fr));
          gap: clamp(24px,4vw,48px); padding-bottom: 40px; border-bottom: 1px solid rgba(255,255,255,.09); }
        .v5-pie-marca { display: flex; flex-direction: column; gap: 14px; }
        .v5-pie-desc { font-size: 13.5px; line-height: 1.65; color: #A6A69E; max-width: 32ch; margin: 0; }
        .v5-pie-contacto { font-size: 13px; line-height: 1.6; color: #8E8E86; max-width: 34ch; margin: 0; }
        .v5-pie-contacto a { color: #D9C29E; }
        .v5-pie-contacto a:hover { text-decoration: underline; text-underline-offset: 3px; }
        .v5-pie-redes { display: flex; align-items: center; gap: 14px; }
        .v5-pie-redes a { display: flex; color: #A6A69E; transition: color .2s; }
        .v5-pie-redes a:hover { color: #fff; }
        .v5-pie-col { display: flex; flex-direction: column; gap: 11px; font-size: 13.5px; color: #A6A69E; }
        .v5-pie-col a { color: #A6A69E; }
        .v5-pie-col a:hover { color: #fff; }
        .v5-pie-tit { font-size: 10.5px; font-weight: 800; letter-spacing: .14em; color: #6E7259; margin-bottom: 2px; }
        .v5-pie-legal { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;
          padding-top: 18px; font-size: 12px; font-weight: 600; color: #5A5A52; }
        .v5-pie-legal-der { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .v5-pie-badge { display: inline-flex; align-items: center; opacity: .85; transition: opacity .2s; }
        .v5-pie-badge:hover { opacity: 1; }
        .v5-pie-badge img { height: 32px; width: auto; display: block; }
      `}</style>
    </>
  );
}
