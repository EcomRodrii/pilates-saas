import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { LEGAL } from '@/lib/legal-info';
import { PIE_PUBLICO } from '@/lib/seo/navegacion-publica';
import { WHATSAPP_SOPORTE } from '@/components/landing/enlaces';
import './tokens.css';
import './armazon.css';

// ─────────────────────────────────────────────────────────────────────────────
// El pie de TODA la web pública (fase 2.1, 19-oct-2026). Sustituye al de la home
// (`.v5-pie`, SeccionCtaFinal) y al de las interiores (`SiteFooter`), que no
// enlazaban lo mismo ni decían lo mismo, y a la línea de enlaces del layout legal.
//
// Columnas y enlaces: lib/seo/navegacion-publica.ts (con test de enlaces vivos).
// Aquí solo lo que no es una página del registro: el correo, el WhatsApp de
// soporte y las redes.
//
// ⚠️ Los títulos de columna son párrafos, no encabezados: el pie no entra en el
// esquema de encabezados de cada página (un solo <h1>, y sus h2 son suyos).
// ⚠️ El mapa del sitio es `role="navigation"` y no un <nav>: la medición de la
// home (lib/landing/medicion.ts, `ubicacionDe`) toma el primer <nav> que
// encuentra al subir desde el enlace y el clic se contaría como «nav», no «pie».
// ⚠️ Sin botón al alta: en la home la banda final va justo encima, y en el resto
// la isla lo lleva siempre a la vista.
// ─────────────────────────────────────────────────────────────────────────────

// Redes sociales de Tentare (la marca, no las del estudio — esas son por
// estudio, ver REDES_SOCIALES en /reservar/[slug]). X (@tentaresoftware) se
// quitó el 1-oct-2026: la cuenta no tenía ni una publicación y enlazarla daba
// imagen de abandono. Si se activa, vuelve aquí y a OrganizationStructuredData.
const REDES_TENTARE = [
  { href: 'https://www.instagram.com/tentareapp/', label: 'Instagram', Icono: IconoInstagram },
  { href: 'https://www.linkedin.com/company/tentare/', label: 'LinkedIn', Icono: IconoLinkedIn },
];

function IconoInstagram({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <rect x={3} y={3} width={18} height={18} rx={5} />
      <circle cx={12} cy={12} r={4} />
      <circle cx={17.2} cy={6.8} r={1.1} fill="currentColor" stroke="none" />
    </svg>
  );
}

// Sin icono LinkedIn en lucide-react (no está en el set): dibujado a mano, como el de Instagram.
function IconoLinkedIn({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x={3} y={3} width={18} height={18} rx={3} fill="none" stroke="currentColor" strokeWidth={1.8} />
      <circle cx={8} cy={8.2} r={1.3} />
      <rect x={6.9} y={10.8} width={2.2} height={7} />
      <path d="M12 10.8h2.1v1.05c.5-.72 1.28-1.2 2.35-1.2 1.9 0 2.85 1.25 2.85 3.35V17.8h-2.2v-3.4c0-.95-.35-1.55-1.2-1.55-.85 0-1.35.58-1.35 1.55v3.4H12v-7z" />
    </svg>
  );
}

export function PieWeb() {
  const enlaceWa = enlaceWhatsApp(WHATSAPP_SOPORTE, 'Hola, tengo una duda sobre Tentare:') ?? `https://wa.me/${WHATSAPP_SOPORTE.replace(/\D/g, '')}`;

  return (
    <footer className="w-pie">
      <div className="w-pie-in">
        <div className="w-pie-rejilla" role="navigation" aria-label="Mapa del sitio">
          <div className="w-pie-marca">
            <Link href="/" aria-label="Tentare — inicio">
              <LogoTentare formato="horizontal" tinta="negativo" alto={26} decorativo />
            </Link>
            <p className="w-pie-lema">
              Software para estudios de Pilates y yoga. Reservas, app con tu marca, bonos y cobros, con precio
              público y sin permanencia.
            </p>
            <div className="w-pie-redes">
              {REDES_TENTARE.map(({ href, label, Icono }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
                  <Icono />
                </a>
              ))}
            </div>
          </div>
          {PIE_PUBLICO.map((col) => (
            <div key={col.titulo} className="w-pie-col">
              <p className="w-pie-titulo">{col.titulo}</p>
              <ul>
                {col.enlaces.map((e) => (
                  <li key={e.href}><Link href={e.href}>{e.label}</Link></li>
                ))}
                {col.titulo === 'Empresa' && (
                  <>
                    <li><a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></li>
                    <li><a href={enlaceWa} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
                  </>
                )}
              </ul>
            </div>
          ))}
        </div>
        <div className="w-pie-base">
          <p>© 2026 {LEGAL.marca} · Software de gestión para estudios de Pilates y yoga · Hecho en España</p>
          <div className="w-pie-base-der">
            <p>Diseñado con el RGPD en mente · Tus datos son tuyos</p>
            <a href="https://sellwithboost.com" target="_blank" rel="noopener noreferrer" className="w-pie-sello">
              {/* eslint-disable-next-line @next/next/no-img-element -- insignia externa, no un recurso propio */}
              <img src="https://sellwithboost.com/badge/listing-dark.svg" alt="Listed on Sell With boost" width={110} height={40} loading="lazy" decoding="async" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
