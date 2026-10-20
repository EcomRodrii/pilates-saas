import { LEGAL } from '@/lib/legal-info';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { IslaWeb } from '@/components/web/IslaWeb';
import { PieWeb } from '@/components/web/PieWeb';

// Armazón de las páginas legales públicas (/legal, /privacidad, /terminos,
// /cookies, /soporte). Vive bajo el RootLayout (html/body/fuentes/providers).
//
// Desde la fase 2.1 (19-oct-2026) llevan la isla y el pie de toda la web
// pública, en vez de una cabecera blanca propia con enlaces en verde azulado
// (`#0f6b5c`, de ninguna paleta). Los cuatro documentos que listaba aquí abajo
// están ahora en la columna «Legal» del pie, y /soporte en «Empresa».
// Colores: tokens de la web (components/web/tokens.css).

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal-raiz">
      <OrganizationStructuredData />
      <IslaWeb />

      <main className="legal-doc">
        {children}
        <p className="legal-fecha">© 2026 {LEGAL.marca} · Última actualización: {LEGAL.actualizado}</p>
      </main>

      <PieWeb />

      <style>{`
        .legal-raiz { background: var(--w-cream); color: var(--w-texto); min-height: 100vh; font-family: var(--w-fuente); }
        .legal-doc { max-width: calc(var(--w-lectura) + 2 * 24px); margin: 0 auto; padding: 32px 24px var(--w-seccion); }
        .legal-doc h1 { font-size: clamp(30px, 1.4rem + 1.6vw, 40px); font-weight: var(--w-peso-titular); letter-spacing: var(--w-track-h1);
          line-height: var(--w-alto-titular); margin: 0 0 10px; text-wrap: balance; }
        .legal-doc .lead { color: var(--w-texto-2); font-size: 16px; line-height: 1.6; margin-bottom: 28px; }
        .legal-doc h2 { font-size: 20px; font-weight: var(--w-peso-titular); margin: 38px 0 10px; letter-spacing: var(--w-track-h3); }
        .legal-doc h3 { font-size: 16px; font-weight: var(--w-peso-titular); margin: 22px 0 6px; }
        .legal-doc p, .legal-doc li { font-size: 16px; line-height: var(--w-alto-cuerpo); color: var(--w-texto-2); }
        .legal-doc p { margin: 0 0 12px; }
        .legal-doc ul { margin: 0 0 14px 20px; }
        .legal-doc li { margin-bottom: 6px; }
        .legal-doc a { color: var(--w-olive); text-decoration: underline; text-underline-offset: 3px; }
        .legal-doc a:focus-visible { outline: 2px solid var(--w-olive); outline-offset: 2px; border-radius: 2px; }
        .legal-doc strong { font-weight: var(--w-peso-enfasis); color: var(--w-texto); }
        .legal-doc table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; font-size: 14px; }
        .legal-doc th, .legal-doc td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--w-linea); vertical-align: top; }
        .legal-doc th { color: var(--w-texto-3); font-weight: var(--w-peso-enfasis); font-size: 13px; }
        /* A 360–375 px la tabla de /privacidad (tres columnas) se salía 6–21 px
           por la derecha: menos relleno, letra de 13 px y partir palabras largas. */
        @media (max-width: 639px) {
          .legal-doc table { font-size: 13px; }
          .legal-doc th, .legal-doc td { padding: 8px 6px; hyphens: auto; overflow-wrap: anywhere; }
        }
        .legal-doc .legal-fecha { margin: 48px 0 0; padding-top: 20px; border-top: 1px solid var(--w-linea);
          font-size: var(--w-fs-mini); color: var(--w-texto-3); }
      `}</style>
    </div>
  );
}
