import { ImageOff } from 'lucide-react';

// Envoltorio de captura de pantalla para un artículo de /ayuda. Si `src` no
// existe todavía en /public/help/, se pinta un estado "captura pendiente"
// EXPLÍCITO en vez de un placeholder genérico o una imagen inventada — la
// instrucción del brief es tajante: nada de capturas falsas ni placeholders
// permanentes. Este estado es temporal por definición: en cuanto se toma la
// captura real y se guarda en la ruta indicada, la misma prop `src` la sirve.
export function AyudaCaptura({ src, alt, caption, pendiente }: {
  src?: string; alt: string; caption?: string; pendiente?: string;
}) {
  return (
    <figure style={{ margin: '20px 0', borderRadius: 16, overflow: 'hidden', border: '1px solid #E7E7E0', background: '#fff' }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- artículos de contenido con muchas capturas distintas; no aporta usar next/image aquí.
        <img src={src} alt={alt} style={{ width: '100%', display: 'block' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 220, background: '#F6F4EF', color: '#8E8E86', padding: 24, textAlign: 'center' }}>
          <ImageOff size={22} aria-hidden />
          <span className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.04em' }}>Captura pendiente{pendiente ? ` — ${pendiente}` : ''}</span>
        </div>
      )}
      {caption && <figcaption style={{ padding: '10px 16px', fontSize: 12.5, color: '#8E8E86', borderTop: '1px solid #F0F0EA' }}>{caption}</figcaption>}
    </figure>
  );
}
