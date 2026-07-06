'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { IBM_Plex_Mono } from 'next/font/google';

const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' });

const ACC = '#FFC8E2';

// ─── Scroll-reveal wrapper (mirrors the design's data-reveal behavior) ──────

function Reveal({
  children,
  delay = 0,
  style,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.unobserve(el);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(28px)',
        transition: `opacity .85s cubic-bezier(.2,.7,0,1) ${delay}ms, transform .85s cubic-bezier(.2,.7,0,1) ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const btnCta =
  'inline-block bg-[#FFC8E2] text-[#171717] rounded-full transition-all duration-250 hover:bg-[#F7B3D2] hover:-translate-y-0.5';

export default function LandingPage() {
  return (
    <div
      className={plexMono.variable}
      style={{ background: '#EEEEE8', color: '#1A1A1A', overflow: 'hidden' }}
    >
      {/* ================= NAV ================= */}
      <nav
        className="lp-nav"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '15px 40px',
          background: 'rgba(238,238,232,.82)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(26,26,26,.07)',
        }}
      >
        <Image src="/logo-wordmark.png" alt="Tentare" width={150} height={48} style={{ height: 34, width: 'auto' }} />
        <div className="lp-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 30, fontSize: 15, fontWeight: 500, color: '#5A5A52' }}>
          <span>Producto</span>
          <span>Sistema autónomo</span>
          <span>Precios</span>
          <span>Historias</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Link href="/login" className="lp-nav-enter" style={{ fontSize: 15, fontWeight: 500, color: '#5A5A52' }}>
            Entrar
          </Link>
          <Link
            href="/crear-estudio"
            className={btnCta}
            style={{ fontSize: 15, fontWeight: 600, padding: '11px 22px', whiteSpace: 'nowrap' }}
          >
            Prueba gratis
          </Link>
        </div>
      </nav>

      {/* ================= HERO ================= */}
      <header className="lp-header" style={{ position: 'relative', padding: '72px 40px 44px' }}>
        <div
          style={{
            position: 'absolute',
            top: -160,
            right: -120,
            width: 520,
            height: 520,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 40%, rgba(255,200,226,.6), transparent 62%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '0.92fr 1.08fr',
            gap: 44,
            alignItems: 'center',
          }}
          className="lp-hero-grid"
        >
          <div>
            <div
              className="lp-mono"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                fontSize: 12,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: '#171717',
                background: ACC,
                padding: '8px 15px',
                borderRadius: 999,
                marginBottom: 28,
                animation: 'lp-riseIn .8s cubic-bezier(.2,.7,0,1) both',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#171717',
                  animation: 'lp-pulse 1.8s ease-in-out infinite',
                }}
              />{' '}
              Software para estudios de Pilates
            </div>
            <h1 className="lp-h1" style={{ fontWeight: 800, fontSize: 58, lineHeight: 1, letterSpacing: '-.035em', margin: '0 0 24px' }}>
              <span style={{ display: 'block', animation: 'lp-riseIn .9s cubic-bezier(.2,.7,0,1) .05s both' }}>
                El estudio se
              </span>
              <span style={{ display: 'block', animation: 'lp-riseIn .9s cubic-bezier(.2,.7,0,1) .14s both' }}>
                gestiona{' '}
                <span style={{ position: 'relative', whiteSpace: 'nowrap' }}>
                  solo.
                  <svg viewBox="0 0 220 16" style={{ position: 'absolute', left: 0, bottom: -6, width: '100%', height: 14, overflow: 'visible' }}>
                    <path
                      d="M3 11 C 55 3, 165 3, 217 9"
                      fill="none"
                      stroke="#F7A6C4"
                      strokeWidth={6}
                      strokeLinecap="round"
                      strokeDasharray={230}
                      strokeDashoffset={230}
                      style={{ animation: 'lp-dash 1s ease .6s forwards' }}
                    />
                  </svg>
                </span>
              </span>
              <span style={{ display: 'block', animation: 'lp-riseIn .9s cubic-bezier(.2,.7,0,1) .23s both' }}>
                Tú, a enseñar.
              </span>
            </h1>
            <p
              className="lp-lead"
              style={{
                fontSize: 20,
                lineHeight: 1.5,
                color: '#5A5A52',
                maxWidth: 450,
                margin: '0 0 32px',
                animation: 'lp-riseIn .9s cubic-bezier(.2,.7,0,1) .34s both',
              }}
            >
              Reservas, membresías, pagos y agenda en una sola plataforma con un{' '}
              <strong style={{ color: '#1A1A1A' }}>sistema autónomo</strong> que decide, cobra y llena tus clases — tú
              apruebas cada acción con un toque.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                marginBottom: 24,
                flexWrap: 'wrap',
                animation: 'lp-riseIn .9s cubic-bezier(.2,.7,0,1) .44s both',
              }}
            >
              <Link
                href="/crear-estudio"
                className={btnCta}
                style={{ fontSize: 16, fontWeight: 600, padding: '16px 30px', boxShadow: '0 14px 30px rgba(255,200,226,.6)' }}
              >
                Empieza gratis →
              </Link>
              <a
                href="#producto"
                className="inline-flex items-center gap-2.5 rounded-full border border-[#E7E7E0] bg-white transition-colors hover:border-[#FFC8E2]"
                style={{ fontSize: 16, fontWeight: 600, color: '#1A1A1A', padding: '15px 22px' }}
              >
                ▷ Ver demo
              </a>
            </div>
            <div
              className="lp-mono"
              style={{ fontSize: 12, letterSpacing: '.04em', color: '#8E8E86', animation: 'lp-riseIn .9s cubic-bezier(.2,.7,0,1) .54s both' }}
            >
              Sin tarjeta · Migración gratuita · +280 estudios ya dentro
            </div>
          </div>

          {/* ===== HERO PRODUCT MOCKUP ===== */}
          <div style={{ position: 'relative', animation: 'lp-riseIn 1.1s cubic-bezier(.2,.7,0,1) .3s both' }}>
            <div
              style={{
                borderRadius: 24,
                background: '#EEEEE8',
                boxShadow: '0 40px 90px -20px rgba(26,26,26,.3), 0 0 0 1px rgba(26,26,26,.05)',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', background: '#E9E9E2', borderBottom: '1px solid #E1E1D9' }}>
                <div style={{ display: 'flex', gap: 7 }}>
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: ACC }} />
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#E1E1D8' }} />
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#E1E1D8' }} />
                </div>
                <div className="lp-mono" style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#A8A89F', letterSpacing: '.03em' }}>
                  estudio.tentare.app
                </div>
              </div>
              <div style={{ display: 'flex' }}>
                {/* sidebar */}
                <div style={{ width: 54, background: '#0F0F0F', padding: '14px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13 }}>
                  <Image src="/logo-mark.png" alt="" width={26} height={26} style={{ objectFit: 'contain' }} />
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: ACC, color: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <rect width={7} height={7} x={3} y={3} rx={1} /><rect width={7} height={7} x={14} y={3} rx={1} /><rect width={7} height={7} x={14} y={14} rx={1} /><rect width={7} height={7} x={3} y={14} rx={1} />
                    </svg>
                  </div>
                  <div style={{ width: 30, height: 30, borderRadius: 9, color: 'rgba(255,255,255,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 8V4H8" /><rect width={16} height={12} x={4} y={8} rx={2} /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
                    </svg>
                  </div>
                  <div style={{ width: 30, height: 30, borderRadius: 9, color: 'rgba(255,255,255,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 2v4" /><path d="M16 2v4" /><rect width={18} height={18} x={3} y={4} rx={2} /><path d="M3 10h18" />
                    </svg>
                  </div>
                  <div style={{ width: 30, height: 30, borderRadius: 9, color: 'rgba(255,255,255,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx={12} cy={12} r={10} /><polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div style={{ width: 30, height: 30, borderRadius: 9, color: 'rgba(255,255,255,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx={9} cy={7} r={4} /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                </div>
                {/* main */}
                <div style={{ flex: 1, padding: 18, background: '#EEEEE8' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
                    <div>
                      <div className="lp-mono" style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: '#A8A89F' }}>Lunes, 6 de julio</div>
                      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>Buenas tardes 👋</div>
                    </div>
                    <div style={{ background: ACC, color: '#171717', fontSize: 11, fontWeight: 700, padding: '8px 13px', borderRadius: 999 }}>Abrir caja</div>
                  </div>
                  {/* autonomous system pill */}
                  <div style={{ background: '#0F0F0F', color: '#E8E8E4', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,.06)', color: '#E8E8E4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 8V4H8" /><rect width={16} height={12} x={4} y={8} rx={2} /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>Sistema autónomo · activo</div>
                      <div className="lp-mono" style={{ fontSize: 10, color: '#8E8E86' }}>14 acciones ejecutadas hoy</div>
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACC, boxShadow: '0 0 0 4px rgba(255,200,226,.2)' }} />
                  </div>
                  {/* stat cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginBottom: 12 }}>
                    <div style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 14, padding: '11px 12px' }}>
                      <div className="lp-mono" style={{ fontSize: 9, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A8A89F' }}>Ingresos mes</div>
                      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, letterSpacing: '-.02em' }}>8.940€</div>
                      <div style={{ fontSize: 10, color: '#4E9E7F', fontWeight: 700 }}>▲ 12%</div>
                    </div>
                    <div style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 14, padding: '11px 12px' }}>
                      <div className="lp-mono" style={{ fontSize: 9, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A8A89F' }}>Ocupación</div>
                      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, letterSpacing: '-.02em' }}>87%</div>
                      <div style={{ height: 4, borderRadius: 99, background: '#EDEDE6', marginTop: 7, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: '87%', background: ACC, borderRadius: 99, transformOrigin: 'left', animation: 'lp-grow 1.2s cubic-bezier(.2,.7,0,1) .8s both' }} />
                      </div>
                    </div>
                    <div style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 14, padding: '11px 12px' }}>
                      <div className="lp-mono" style={{ fontSize: 9, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A8A89F' }}>Reservas hoy</div>
                      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, letterSpacing: '-.02em' }}>64</div>
                      <div style={{ fontSize: 10, color: '#8E8E86' }}>8 clases</div>
                    </div>
                  </div>
                  {/* schedule list */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 16, padding: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px' }}>
                      <div className="lp-mono" style={{ fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase', color: '#A8A89F' }}>Agenda de hoy</div>
                      <div className="lp-mono" style={{ fontSize: 10, color: '#B57A8E' }}>Ver todo</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 9, borderRadius: 11, background: '#F5F5F1', marginBottom: 5 }}>
                      <div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86', width: 38 }}>08:00</div>
                      <div style={{ width: 3, height: 30, borderRadius: 9, background: '#F7A6C4' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>Reformer Flow</div>
                        <div style={{ fontSize: 11, color: '#8E8E86' }}>Ana · Sala 1</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ display: 'flex' }}>
                          <span style={{ width: 18, height: 18, borderRadius: '50%', background: ACC, border: '1.5px solid #FFF' }} />
                          <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#D8C3E0', border: '1.5px solid #FFF', marginLeft: -7 }} />
                          <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#A8C7CE', border: '1.5px solid #FFF', marginLeft: -7 }} />
                        </div>
                        <span className="lp-mono" style={{ fontSize: 10, color: '#4E9E7F' }}>10/10</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 9, borderRadius: 11, background: '#F5F5F1', marginBottom: 5 }}>
                      <div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86', width: 38 }}>09:30</div>
                      <div style={{ width: 3, height: 30, borderRadius: 9, background: '#A8C7CE' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>Mat Pilates</div>
                        <div style={{ fontSize: 11, color: '#8E8E86' }}>Lucía · Sala 2</div>
                      </div>
                      <span className="lp-mono" style={{ fontSize: 10, color: '#8E8E86' }}>7/12</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 9, borderRadius: 11, background: '#F5F5F1' }}>
                      <div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86', width: 38 }}>11:00</div>
                      <div style={{ width: 3, height: 30, borderRadius: 9, background: '#9B5C7A' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>Prenatal</div>
                        <div style={{ fontSize: 11, color: '#8E8E86' }}>Marta · Sala 1</div>
                      </div>
                      <span className="lp-mono" style={{ fontSize: 10, color: '#B57A8E', background: '#FFF2F7', padding: '3px 8px', borderRadius: 99 }}>Espera 3</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* floating badge */}
            <div
              style={{
                position: 'absolute',
                bottom: -22,
                left: -26,
                background: '#FFFFFF',
                borderRadius: 16,
                padding: '12px 15px',
                boxShadow: '0 20px 40px -12px rgba(26,26,26,.24)',
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                animation: 'lp-floatY 4s ease-in-out infinite',
              }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 10, background: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#171717' }}>
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Cobro automático</div>
                <div className="lp-mono" style={{ fontSize: 10, color: '#8E8E86' }}>Bono 10 sesiones · 120€</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ================= MARQUEE ================= */}
      <div style={{ padding: '22px 0', borderTop: '1px solid rgba(26,26,26,.07)', borderBottom: '1px solid rgba(26,26,26,.07)', background: '#F3F3EF' }}>
        <div
          style={{
            display: 'flex',
            width: 'max-content',
            gap: 56,
            animation: 'lp-marq 26s linear infinite',
            whiteSpace: 'nowrap',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-.02em',
            color: '#C4C4BC',
          }}
        >
          {[0, 1].map(i => (
            <div key={i} style={{ display: 'flex', gap: 56 }}>
              <span>Reservas 24/7</span><span style={{ color: '#F7A6C4' }}>✦</span>
              <span>Membresías</span><span style={{ color: '#F7A6C4' }}>✦</span>
              <span>Cobros automáticos</span><span style={{ color: '#F7A6C4' }}>✦</span>
              <span>App de marca</span><span style={{ color: '#F7A6C4' }}>✦</span>
              <span>Lista de espera</span><span style={{ color: '#F7A6C4' }}>✦</span>
              <span>Informes en vivo</span><span style={{ color: '#F7A6C4' }}>✦</span>
            </div>
          ))}
        </div>
      </div>

      {/* ================= AUTONOMOUS SYSTEM ================= */}
      <section className="lp-section" style={{ background: '#0F0F0F', color: '#E8E8E4', padding: '110px 40px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 24, marginBottom: 52 }}>
            <div style={{ maxWidth: 680 }}>
              <Reveal className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: '#171717', background: ACC, padding: '7px 14px', borderRadius: 999, marginBottom: 22 }}>
                ✦ Lo que nadie más tiene
              </Reveal>
              <Reveal delay={80}>
                <h2 className="lp-h2" style={{ fontWeight: 800, fontSize: 56, lineHeight: 1, letterSpacing: '-.04em', margin: 0 }}>Un sistema autónomo que trabaja por ti</h2>
              </Reveal>
            </div>
            <Reveal delay={160} style={{ fontSize: 17, color: '#8E8E86', maxWidth: 320, margin: '0 0 6px' }}>
              <p style={{ margin: 0 }}>No es un panel más. Tentare toma decisiones y ejecuta tareas de gestión solo — tú solo apruebas.</p>
            </Reveal>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }} className="lp-3col">
            <Reveal style={{ background: '#171717', border: '1px solid rgba(255,255,255,.06)', borderRadius: 20, padding: 28 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: ACC, color: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
                <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect width={20} height={14} x={2} y={5} rx={2} /><line x1={2} x2={22} y1={10} y2={10} /></svg>
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 8px' }}>Cobra sin perseguir</h3>
              <p style={{ fontSize: 15, color: '#8E8E86', margin: 0 }}>Renueva bonos, reintenta pagos fallidos y emite facturas automáticamente. El 98% de tus cobros, a tiempo.</p>
            </Reveal>
            <Reveal delay={80} style={{ background: '#171717', border: '1px solid rgba(255,255,255,.06)', borderRadius: 20, padding: 28 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#A8C7CE', color: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
                <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 8px' }}>Llena las clases vacías</h3>
              <p style={{ fontSize: 15, color: '#8E8E86', margin: 0 }}>Detecta huecos y avisa a la lista de espera y a socias inactivas en el momento justo. Menos sillas vacías.</p>
            </Reveal>
            <Reveal delay={160} style={{ background: '#171717', border: '1px solid rgba(255,255,255,.06)', borderRadius: 20, padding: 28 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#C9A8D3', color: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
                <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 8px' }}>Retiene sin que lo notes</h3>
              <p style={{ fontSize: 15, color: '#8E8E86', margin: 0 }}>Identifica a quien deja de venir y le manda el mensaje adecuado antes de que se dé de baja.</p>
            </Reveal>
          </div>

          {/* live activity strip */}
          <Reveal delay={120} style={{ marginTop: 16, background: '#171717', border: '1px solid rgba(255,255,255,.06)', borderRadius: 20, padding: '22px 26px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACC, boxShadow: '0 0 0 4px rgba(255,200,226,.2)' }} />
              <span className="lp-mono" style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8E8E86' }}>Actividad autónoma · en vivo</span>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                { t: '08:12', icon: 'invoice', text: <>Renovó el bono de <strong style={{ color: '#fff' }}>Carla M.</strong> — 120€ cobrados</> },
                { t: '09:03', icon: 'boat', text: <>Avisó a 4 personas de lista de espera — <strong style={{ color: '#fff' }}>Reformer 10:00 completo</strong></> },
                { t: '11:47', icon: 'heart', text: <>Reactivó a <strong style={{ color: '#fff' }}>Nora P.</strong> tras 3 semanas sin venir</> },
              ].map((row) => (
                <div key={row.t} style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 15 }}>
                  <span className="lp-mono" style={{ fontSize: 12, color: '#8E8E86', width: 52 }}>{row.t}</span>
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D8D8D2' }}>
                    {row.icon === 'invoice' && (
                      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect width={20} height={14} x={2} y={5} rx={2} /><line x1={2} x2={22} y1={10} y2={10} /></svg>
                    )}
                    {row.icon === 'boat' && (
                      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
                    )}
                    {row.icon === 'heart' && (
                      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
                    )}
                  </span>
                  <span style={{ color: '#D8D8D2' }}>{row.text}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= CALENDAR SHOWCASE ================= */}
      <section id="producto" className="lp-section" style={{ padding: '110px 40px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <Reveal className="lp-mono" style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', marginBottom: 16 }}>
            Mira el software
          </Reveal>
          <Reveal delay={80}>
            <h2 className="lp-h2" style={{ fontWeight: 800, fontSize: 54, lineHeight: 1, letterSpacing: '-.04em', margin: '0 auto', maxWidth: 640 }}>Tu semana entera, bajo control</h2>
          </Reveal>
        </div>
        <Reveal delay={120} style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 24, overflow: 'hidden', boxShadow: '0 40px 90px -30px rgba(26,26,26,.24)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #EDEDE6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>Calendario semanal</span>
              <span className="lp-mono" style={{ fontSize: 12, color: '#8E8E86' }}>30 jun – 6 jul</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="lp-mono" style={{ fontSize: 12, color: '#8E8E86', border: '1px solid #E7E7E0', padding: '7px 13px', borderRadius: 8 }}>Semana</span>
              <span className="lp-mono" style={{ fontSize: 12, color: '#171717', background: ACC, padding: '7px 13px', borderRadius: 8 }}>Hoy</span>
            </div>
          </div>
          <div className="lp-cal-grid" style={{ display: 'grid', gridTemplateColumns: '52px repeat(6,1fr)', fontSize: 12, overflowX: 'auto' }}>
            <div style={{ borderBottom: '1px solid #EDEDE6' }} />
            {['LUN 30', 'MAR 1', 'MIÉ 2', 'JUE 3', 'VIE 4'].map(d => (
              <div key={d} className="lp-mono" style={{ padding: '11px 8px', textAlign: 'center', borderBottom: '1px solid #EDEDE6', borderLeft: '1px solid #F1F1EC', color: '#8E8E86' }}>{d}</div>
            ))}
            <div className="lp-mono" style={{ padding: '11px 8px', textAlign: 'center', borderBottom: '1px solid #EDEDE6', borderLeft: '1px solid #F1F1EC', background: '#FFF2F7', color: '#B57A8E', fontWeight: 600 }}>SÁB 5</div>

            {/* row 1 — 08:00 */}
            <div className="lp-mono" style={{ padding: '12px 6px', textAlign: 'right', color: '#A8A89F', borderBottom: '1px solid #F1F1EC' }}>08:00</div>
            <CalCell bg="#FFF2F7" bar="#F7A6C4" title="Reformer" sub="Ana · 10/10" />
            <CalCell />
            <CalCell bg="#EDF3F4" bar="#A8C7CE" title="Mat" sub="Lucía · 7/12" />
            <CalCell />
            <CalCell bg="#FFF2F7" bar="#F7A6C4" title="Reformer" sub="Ana · 9/10" />
            <CalCell tint />

            {/* row 2 — 09:30 */}
            <div className="lp-mono" style={{ padding: '12px 6px', textAlign: 'right', color: '#A8A89F', borderBottom: '1px solid #F1F1EC' }}>09:30</div>
            <CalCell />
            <CalCell bg="#F3ECF5" bar="#C9A8D3" title="Prenatal" sub="Marta · 6/8" />
            <CalCell bg="#FFF2F7" bar="#F7A6C4" title="Reformer" sub="Ana · 10/10" />
            <CalCell />
            <CalCell bg="#EDF3F4" bar="#A8C7CE" title="Mat" sub="Lucía · 11/12" />
            <CalCell bg="#FFF2F7" bar="#F7A6C4" title="Reformer" sub="Ana · 8/10" tint />

            {/* row 3 — 11:00 */}
            <div className="lp-mono" style={{ padding: '12px 6px', textAlign: 'right', color: '#A8A89F' }}>11:00</div>
            <CalCell bg="#EDF3F4" bar="#A8C7CE" title="Mat" sub="Lucía · 5/12" last />
            <CalCell last />
            <CalCell last />
            <CalCell bg="#F3ECF5" bar="#C9A8D3" title="Prenatal" sub="Marta · 8/8" last />
            <CalCell last />
            <CalCell tint last />
          </div>
        </Reveal>
      </section>

      {/* ================= FEATURES BENTO ================= */}
      <section className="lp-section" style={{ padding: '0 40px 110px', maxWidth: 1280, margin: '0 auto' }}>
        <Reveal>
          <h2 className="lp-h2" style={{ fontWeight: 800, fontSize: 54, letterSpacing: '-.04em', margin: '0 0 12px', maxWidth: 720, lineHeight: 1 }}>Todo tu estudio, sin fricción</h2>
        </Reveal>
        <Reveal delay={80} style={{ margin: '0 0 44px', maxWidth: 520 }}>
          <p style={{ fontSize: 18, color: '#5A5A52', margin: 0 }}>Herramientas que trabajan juntas para que dejes de saltar entre apps y cuadernos.</p>
        </Reveal>
        <div className="lp-bento" style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gridAutoRows: 200, gap: 16 }}>
          <Reveal className="lp-bento-4" style={{ background: ACC, borderRadius: 22, padding: 32, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden', position: 'relative' }}>
            <div className="lp-mono" style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#171717' }}>01 — Reservas</div>
            <div>
              <h3 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 8px' }}>Reservas 24/7 con lista de espera</h3>
              <p style={{ fontSize: 15, color: '#7A4E60', margin: 0, maxWidth: 380 }}>Tus socias reservan y cancelan solas. Cuando alguien deja hueco, la lista de espera lo llena automáticamente.</p>
            </div>
          </Reveal>
          <Reveal delay={70} className="lp-bento-2" style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 22, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FFF2F7', color: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect width={20} height={14} x={2} y={5} rx={2} /><line x1={2} x2={22} y1={10} y2={10} /></svg>
            </div>
            <div>
              <h3 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 6px' }}>Pagos automáticos</h3>
              <p style={{ fontSize: 14, color: '#5A5A52', margin: 0 }}>Cobros recurrentes y bonos, conciliados solos.</p>
            </div>
          </Reveal>
          <Reveal delay={60} className="lp-bento-2" style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 22, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EDF3F4', color: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect width={14} height={20} x={5} y={2} rx={2} ry={2} /><path d="M12 18h.01" /></svg>
            </div>
            <div>
              <h3 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 6px' }}>App de marca</h3>
              <p style={{ fontSize: 14, color: '#5A5A52', margin: 0 }}>Tu estudio en el móvil, con tu nombre.</p>
            </div>
          </Reveal>
          <Reveal delay={120} className="lp-bento-2" style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 22, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#F3ECF5', color: '#171717', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx={9} cy={7} r={4} /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </div>
            <div>
              <h3 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 6px' }}>CRM de socias</h3>
              <p style={{ fontSize: 14, color: '#5A5A52', margin: 0 }}>Historial, bonos y asistencia de cada persona.</p>
            </div>
          </Reveal>
          <Reveal delay={80} className="lp-bento-2" style={{ background: '#0F0F0F', color: '#E8E8E4', borderRadius: 22, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-.03em', color: ACC }}>−8h</div>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>de admin a la semana</h3>
              <p style={{ fontSize: 14, color: '#8E8E86', margin: 0 }}>Tiempo que recuperas para enseñar.</p>
            </div>
          </Reveal>
          <Reveal delay={140} className="lp-bento-2" style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 22, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#0F0F0F', color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
            </div>
            <div>
              <h3 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 6px' }}>Informes en vivo</h3>
              <p style={{ fontSize: 14, color: '#5A5A52', margin: 0 }}>Ingresos, ocupación y retención al día.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= TESTIMONIAL ================= */}
      <section className="lp-section" style={{ padding: '0 40px 110px', maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
        <Reveal>
          <div style={{ fontSize: 64, lineHeight: 0, color: '#F7A6C4', height: 34, fontWeight: 800 }}>&rdquo;</div>
          <p className="lp-quote" style={{ fontWeight: 700, fontSize: 38, lineHeight: 1.24, letterSpacing: '-.03em', margin: '0 0 30px' }}>
            En tres meses subimos la ocupación un 22%. Tentare hace el trabajo aburrido para que yo pueda enseñar.
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: `linear-gradient(135deg,${ACC},#C9A8D3)` }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Lucía Ferrán</div>
              <div style={{ fontSize: 14, color: '#8E8E86' }}>Fundadora · Reforma Studio, Barcelona</div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= PRICING ================= */}
      <section className="lp-section" style={{ padding: '100px 40px', background: '#F3F3EF', borderTop: '1px solid #E7E7E0' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <Reveal><h2 className="lp-h2" style={{ fontWeight: 800, fontSize: 54, letterSpacing: '-.04em', margin: '0 0 10px' }}>Precios sin letra pequeña</h2></Reveal>
            <Reveal delay={80}><p style={{ fontSize: 18, color: '#5A5A52', margin: 0 }}>Todo incluido, sistema autónomo desde el primer plan. Cancela cuando quieras.</p></Reveal>
          </div>
          <div className="lp-pricing" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, alignItems: 'stretch' }}>
            <Reveal style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 24, padding: 36 }}>
              <div className="lp-mono" style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8E8E86', marginBottom: 16 }}>Estudio</div>
              <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-.03em' }}>49€<span style={{ fontSize: 17, fontWeight: 500, color: '#8E8E86' }}>/mes</span></div>
              <p style={{ fontSize: 14, color: '#5A5A52', margin: '6px 0 24px' }}>Para una sala.</p>
              <div style={{ borderTop: '1px solid #EDEDE6', paddingTop: 20, fontSize: 15, color: '#5A5A52', lineHeight: 2.1 }}>Reservas ilimitadas<br />Cobros automáticos<br />1 instructora</div>
            </Reveal>
            <Reveal delay={90} style={{ background: '#0F0F0F', color: '#E8E8E4', borderRadius: 24, padding: 36, position: 'relative', boxShadow: '0 30px 60px -20px rgba(26,26,26,.4)' }}>
              <div className="lp-mono" style={{ position: 'absolute', top: -12, left: 36, background: ACC, color: '#171717', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', padding: '6px 13px', borderRadius: 999 }}>POPULAR</div>
              <div className="lp-mono" style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: '#F7A6C4', marginBottom: 16 }}>Crecimiento</div>
              <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-.03em' }}>99€<span style={{ fontSize: 17, fontWeight: 500, color: '#8E8E86' }}>/mes</span></div>
              <p style={{ fontSize: 14, color: '#8E8E86', margin: '6px 0 24px' }}>Para estudios en expansión.</p>
              <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 20, fontSize: 15, color: '#D8D8D2', lineHeight: 2.1 }}>Todo lo de Estudio<br />App de marca<br />Instructoras ilimitadas<br />Informes avanzados</div>
              <Link href="/crear-estudio" className="block hover:brightness-95 transition-all" style={{ background: ACC, color: '#171717', textAlign: 'center', fontWeight: 700, padding: 14, borderRadius: 14, marginTop: 24 }}>
                Empezar gratis
              </Link>
            </Reveal>
            <Reveal delay={180} style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 24, padding: 36 }}>
              <div className="lp-mono" style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8E8E86', marginBottom: 16 }}>Cadena</div>
              <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-.03em' }}>A medida</div>
              <p style={{ fontSize: 14, color: '#5A5A52', margin: '6px 0 24px' }}>Multi-sede y franquicias.</p>
              <div style={{ borderTop: '1px solid #EDEDE6', paddingTop: 20, fontSize: 15, color: '#5A5A52', lineHeight: 2.1 }}>Todo lo de Crecimiento<br />Multi-sede<br />Soporte dedicado</div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= COMPLIANCE ESPAÑA ================= */}
      <section className="lp-section" style={{ padding: '70px 40px', maxWidth: 1180, margin: '0 auto' }}>
        <Reveal style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 24, padding: '36px 40px' }}>
          <div className="lp-mono" style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', marginBottom: 10 }}>
            Hecho para España
          </div>
          <h2 style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-.02em', margin: '0 0 28px' }}>Legal, seguro y sin sorpresas</h2>
          <div className="lp-compliance-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
            {[
              { t: 'Facturación legal', d: 'Facturas con NIF, IVA y numeración correlativa desde el primer cobro. Integración Verifactu/AEAT en desarrollo.' },
              { t: 'Pagos vía Stripe', d: 'Tarjeta y SEPA. Tentare no se lleva comisión adicional sobre tus cobros — solo la cuota estándar de Stripe.' },
              { t: 'RGPD', d: 'Tus datos y los de tus socias se quedan en la UE. Exporta o borra todo cuando quieras, sin permanencia.' },
              { t: 'Tus datos son tuyos', d: 'Sin permanencia. Si te vas, exportas socias, historial y facturas — no se quedan retenidos.' },
            ].map(item => (
              <div key={item.t}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4E9E7F', flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{item.t}</span>
                </div>
                <p style={{ fontSize: 13.5, color: '#5A5A52', margin: 0, lineHeight: 1.5 }}>{item.d}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ================= FAQ ================= */}
      <section className="lp-section" style={{ padding: '40px 40px 110px', maxWidth: 820, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <Reveal className="lp-mono" style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', marginBottom: 16 }}>
            Preguntas frecuentes
          </Reveal>
          <Reveal delay={80}>
            <h2 className="lp-h2" style={{ fontWeight: 800, fontSize: 44, lineHeight: 1.05, letterSpacing: '-.04em', margin: 0 }}>Antes de que preguntes</h2>
          </Reveal>
        </div>
        <Reveal delay={120}>
          <Faq />
        </Reveal>
      </section>

      {/* ================= CTA ================= */}
      <section className="lp-section" style={{ padding: '120px 40px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 680, height: 680, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,200,226,.55),transparent 62%)', pointerEvents: 'none' }} />
        <Reveal style={{ position: 'relative' }}>
          <h2 className="lp-cta-h2" style={{ fontWeight: 800, fontSize: 72, lineHeight: .98, letterSpacing: '-.04em', margin: '0 0 22px' }}>Tu estudio merece<br />menos caos.</h2>
          <p style={{ fontSize: 20, color: '#5A5A52', margin: '0 0 34px' }}>14 días gratis. Migramos tus datos por ti. Empieza hoy.</p>
          <Link href="/crear-estudio" className={btnCta} style={{ fontSize: 17, fontWeight: 600, padding: '18px 40px', boxShadow: '0 16px 34px rgba(255,200,226,.6)' }}>
            Crear mi cuenta gratis →
          </Link>
        </Reveal>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="lp-section" style={{ background: '#0F0F0F', color: '#8E8E86', padding: '44px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <Image src="/logo-mark.png" alt="Tentare" width={32} height={32} style={{ height: 32, width: 'auto' }} />
        <span style={{ fontSize: 14 }}>© 2026 Tentare · Software para estudios de Pilates</span>
      </footer>

      <style>{`
        .lp-mono { font-family: var(--font-plex-mono), ui-monospace, monospace; }
        .lp-bento-4 { grid-column: span 4; }
        .lp-bento-2 { grid-column: span 2; }
        @media (max-width: 900px) {
          .lp-hero-grid { grid-template-columns: 1fr !important; }
          .lp-3col { grid-template-columns: 1fr !important; }
          .lp-bento { grid-template-columns: repeat(2,1fr) !important; }
          .lp-bento-4, .lp-bento-2 { grid-column: span 2 !important; }
          .lp-pricing { grid-template-columns: 1fr !important; }
          .lp-compliance-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
        @media (max-width: 640px) {
          .lp-nav-links { display: none !important; }
          .lp-nav-enter { display: none !important; }
          .lp-nav { padding: 14px 20px !important; }
          .lp-header { padding: 44px 20px 28px !important; }
          .lp-h1 { font-size: 38px !important; }
          .lp-lead { font-size: 17px !important; }
          .lp-section { padding-left: 20px !important; padding-right: 20px !important; }
          .lp-h2 { font-size: 34px !important; }
          .lp-cta-h2 { font-size: 42px !important; }
          .lp-bento { grid-template-columns: 1fr !important; grid-auto-rows: auto !important; }
          .lp-bento-4, .lp-bento-2 { grid-column: span 1 !important; min-height: 200px; }
          .lp-quote { font-size: 26px !important; }
          .lp-compliance-grid { grid-template-columns: 1fr !important; gap: 20px !important; }
        }
      `}</style>
    </div>
  );
}

// ─── FAQ accordion ────────────────────────────────────────────────────────────

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: '¿Y si el sistema le cobra a una clienta por error mientras yo duermo?',
    a: 'El sistema autónomo prepara la acción (renovar un bono, reintentar un cobro fallido) pero cada cobro sale con tu aprobación de un toque, no en automático sin control. Tú decides qué acciones requieren tu OK y cuáles se ejecutan solas — configurable por tipo de acción.',
  },
  {
    q: '¿Cuánto tarda de verdad la migración y quién la hace?',
    a: 'La migración de tus socias, planes y bonos la hacemos nosotros a partir de tu export actual (Excel, Bsport, Mindbody u otro). El tiempo depende del volumen de datos; para un estudio típico son 24–48h.',
  },
  {
    q: '¿Esto emite factura legal en España? ¿Verifactu?',
    a: 'Sí generamos factura con NIF, IVA y numeración correlativa desde el primer cobro. La integración con Verifactu/AEAT está en desarrollo — hoy la facturación es real pero aún no envía a Hacienda automáticamente.',
  },
  {
    q: '¿Os lleváis comisión de mis cobros?',
    a: 'No. Los pagos se procesan por Stripe (tarjeta y SEPA) y solo pagas la cuota estándar de Stripe — Tentare no añade ninguna comisión extra sobre tus cobros.',
  },
  {
    q: '¿Funciona con reformer, salas y aforo, o es genérico?',
    a: 'Está pensado para pilates de verdad: gestión de salas con capacidad propia, mapa de spots por reformer, tipos de clase con aforo y precio independiente, y bonos de sesiones — no es un calendario genérico reetiquetado.',
  },
  {
    q: '¿Y si quiero cancelar, me llevo mis datos?',
    a: 'Sí. Sin permanencia: puedes exportar socias, historial de asistencia y facturas en cualquier momento, te quedes o te vayas.',
  },
  {
    q: '¿La app de marca está de verdad en las stores, o es una web?',
    a: 'Hoy es un portal web instalable (PWA) con tu nombre y tus colores — tus socias lo añaden a su pantalla de inicio como una app, sin pasar por App Store ni Google Play. La publicación en tiendas está en el roadmap.',
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 16, overflow: 'hidden' }}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '18px 22px',
                textAlign: 'left',
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '-.01em',
                color: '#1A1A1A',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <span>{item.q}</span>
              <span
                style={{
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: isOpen ? '#FFC8E2' : '#F3F3EF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#171717',
                  transition: 'transform .2s',
                  transform: isOpen ? 'rotate(45deg)' : 'none',
                }}
              >
                +
              </span>
            </button>
            {isOpen && (
              <p style={{ margin: 0, padding: '0 22px 20px', fontSize: 14.5, lineHeight: 1.6, color: '#5A5A52' }}>{item.a}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Calendar grid cell helper ───────────────────────────────────────────────

function CalCell({
  bg,
  bar,
  title,
  sub,
  tint,
  last,
}: {
  bg?: string;
  bar?: string;
  title?: string;
  sub?: string;
  tint?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: title ? 6 : 0,
        borderLeft: '1px solid #F1F1EC',
        borderBottom: last ? undefined : '1px solid #F1F1EC',
        background: tint && !title ? '#FDF8FA' : undefined,
      }}
    >
      {title && (
        <div style={{ background: bg, borderLeft: `3px solid ${bar}`, borderRadius: 8, padding: '8px 9px' }}>
          <div style={{ fontWeight: 700, fontSize: 12 }}>{title}</div>
          <div style={{ color: '#8E8E86', fontSize: 11 }}>{sub}</div>
        </div>
      )}
    </div>
  );
}
