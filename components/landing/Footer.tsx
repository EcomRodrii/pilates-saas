import Image from 'next/image';
import Link from 'next/link';
import { DARK, MUTED_DARK } from './theme';

export function Footer() {
  return (
    <footer style={{ background: DARK, color: '#8E8E86', padding: 'clamp(52px,7vw,80px) clamp(20px,4vw,44px) 40px' }}>
      <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="tnt-footer" style={{ display: 'grid', gridTemplateColumns: '1.5fr repeat(4,1fr)', gap: 34, marginBottom: 52 }}>
          <div>
            <Image src="/logo-mark.png" alt="Tentare" width={38} height={38} style={{ height: 38, width: 'auto', marginBottom: 16 }} />
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: MUTED_DARK, maxWidth: 260, margin: '0 0 18px' }}>El software completo para tu estudio de pilates. Y el que cubre las bajas de instructoras solo.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <a href="https://instagram.com/tentare.app" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 10, background: '#1A1A1A', color: '#C4C4BC' }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><rect width={20} height={20} x={2} y={2} rx={5} /><circle cx={12} cy={12} r={4} /><circle cx={17.5} cy={6.5} r={1} fill="currentColor" stroke="none" /></svg>
              </a>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8E4', marginBottom: 14 }}>Producto</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 14 }}>
              <a href="#recorrido" style={{ color: '#8E8E86' }}>Todo lo que hace</a>
              <a href="#sustituciones" style={{ color: '#8E8E86' }}>Sustituciones</a>
              <a href="#precio" style={{ color: '#8E8E86' }}>Precio</a>
              <a href="#faq" style={{ color: '#8E8E86' }}>FAQ</a>
              <Link href="/recursos" style={{ color: '#8E8E86' }}>Recursos</Link>
              <Link href="/comparativa" style={{ color: '#8E8E86' }}>Comparativa</Link>
              <Link href="/seguridad" style={{ color: '#8E8E86' }}>Seguridad</Link>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8E4', marginBottom: 14 }}>Plataforma</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 14 }}>
              <a href="#recorrido" style={{ color: '#8E8E86' }}>Reservas y calendario</a>
              <a href="#recorrido" style={{ color: '#8E8E86' }}>Cobros y bonos</a>
              <a href="#recorrido" style={{ color: '#8E8E86' }}>Instructoras</a>
              <a href="#centro-de-control" style={{ color: '#8E8E86' }}>App de marca</a>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8E4', marginBottom: 14 }}>Empresa</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 14 }}>
              <a href="#top" style={{ color: '#8E8E86' }}>Sobre Tentare</a>
              <a href="https://instagram.com/tentare.app" target="_blank" rel="noopener noreferrer" style={{ color: '#8E8E86' }}>@tentare.app</a>
              <a href="mailto:hola@tentare.app" style={{ color: '#8E8E86' }}>Contacto</a>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8E4', marginBottom: 14 }}>Legal</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 14 }}>
              <a href="#top" style={{ color: '#8E8E86' }}>Aviso legal</a>
              <a href="#top" style={{ color: '#8E8E86' }}>Privacidad</a>
              <a href="#top" style={{ color: '#8E8E86' }}>Cookies</a>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, paddingTop: 26, borderTop: '1px solid rgba(255,255,255,.07)' }}>
          <span className="lp-mono" style={{ fontSize: 12, color: '#6E6E68' }}>© 2026 Tentare · Software para estudios de Pilates · Hecho en España 🇪🇸</span>
          <div className="lp-mono" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8E8E86', border: '1px solid rgba(255,255,255,.1)', borderRadius: 999, padding: '7px 13px' }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx={12} cy={12} r={10} /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
            Español (ES)
          </div>
        </div>
      </div>
    </footer>
  );
}
