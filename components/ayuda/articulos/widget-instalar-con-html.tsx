import Link from 'next/link';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';
import { urlDe } from '@/lib/seo/paginas';

// Snippet verificado contra app/widget-bundle/main.tsx (comentario del propio
// archivo: "El estudio lo incrusta así en su propia web"). El origen sale de
// urlDe(), nunca escrito a mano — lo comprueba lib/seo/paginas.test.ts.
export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Necesitas poder editar el HTML de la página donde quieres el calendario — la mayoría de constructores web
        (Wix, Squarespace, WordPress con el bloque adecuado…) tienen un bloque de &ldquo;HTML personalizado&rdquo; para esto.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Copia tu fragmento de código">
        <div style={{ background: '#0F0F0F', color: '#E8E8E4', borderRadius: 12, padding: '14px 16px', fontFamily: 'var(--font-plex-mono, monospace)', fontSize: 12.5, lineHeight: 1.7, overflowX: 'auto', margin: '10px 0' }}>
          <div>&lt;div data-tentare-booking data-studio=&quot;tu-estudio&quot;&gt;&lt;/div&gt;</div>
          <div>&lt;script src=&quot;{urlDe('/widget.js')}&quot; async&gt;&lt;/script&gt;</div>
        </div>
        <p style={{ margin: 0 }}>Cambia <code>tu-estudio</code> por el slug real de tu estudio (el mismo que usa tu portal en <code>tentare.app/reservar/tu-estudio</code>).</p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Pégalo donde quieras que aparezca el calendario">
        <p>Puedes tener más de un widget en la misma página si lo necesitas — cada uno con su propio bloque <code>div</code>.</p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Alternativa: iframe">
        <p style={{ margin: 0 }}>Si tu web no admite pegar un <code>&lt;script&gt;</code>, tu enlace de portal (<code>tentare.app/reservar/tu-estudio</code>) también funciona dentro de un <code>&lt;iframe&gt;</code> normal, con el ancho y alto que le pongas.</p>
      </AyudaPaso>

      <AyudaResultado>
        Si no aparece nada después de instalarlo, revisa{' '}
        <Link href="/ayuda/problemas/el-widget-no-carga" style={{ color: 'inherit', textDecoration: 'underline' }}>el widget no carga</Link>.
      </AyudaResultado>
    </>
  );
}
