import Link from 'next/link';
import { btnCta } from './theme';
import { Reveal } from './Reveal';

export function CtaFinal() {
  return (
    <section style={{ padding: 'clamp(90px,11vw,150px) clamp(20px,4vw,44px)', textAlign: 'center', position: 'relative', overflow: 'hidden', background: '#141026', minHeight: 480, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(720px,92vw)', height: 720, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,139,232,.28), transparent 62%)', pointerEvents: 'none' }} />
      <Reveal style={{ position: 'relative' }}>
        <h2 style={{ fontWeight: 800, fontSize: 'clamp(40px,7vw,80px)', lineHeight: .98, letterSpacing: '-.04em', margin: '0 0 22px', color: '#fff' }}>Tu estudio entero.<br />Menos caos.</h2>
        <p style={{ fontSize: 'clamp(17px,1.6vw,20px)', color: 'rgba(255,255,255,.82)', margin: '0 0 34px' }}>Todo el software que necesitas — y el que cubre las bajas de instructoras solo. Importas tus datos con asistentes guiados y te acompañamos. Sin permanencia.</p>
        <Link href="#lista-espera" className={btnCta} style={{ fontSize: 17, fontWeight: 700, padding: '18px 40px', boxShadow: '0 18px 38px rgba(109,40,217,.36)' }}>
          Unirme a la lista de espera →
        </Link>
      </Reveal>
    </section>
  );
}
