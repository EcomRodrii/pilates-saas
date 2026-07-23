'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ACC, MUTED } from '@/components/landing/theme';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';

type Category = 'todos' | 'sustituciones' | 'rentabilidad' | 'operacion' | 'espana' | 'software';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'sustituciones', label: 'Sustituciones y equipo' },
  { key: 'rentabilidad', label: 'Rentabilidad' },
  { key: 'operacion', label: 'Operación' },
  { key: 'espana', label: 'España y fiscalidad' },
  { key: 'software', label: 'Elegir software' },
];

const CATEGORY_GRADIENTS: Record<Exclude<Category, 'todos'>, string> = {
  sustituciones: 'linear-gradient(140deg,#22463a,#4E9E7F)',
  rentabilidad: 'linear-gradient(140deg,#1f3d42,#3E7C86)',
  operacion: 'linear-gradient(140deg,#5e2318,#C2503A)',
  espana: 'linear-gradient(140deg,#3a2148,#8B4F9E)',
  software: 'linear-gradient(140deg,#2b1a52,#6D28D9)',
};

type Article = {
  category: Exclude<Category, 'todos'>;
  title: string;
  body: string;
  href?: string;
  meta: string;
};

const ARTICLES: Article[] = [
  {
    category: 'rentabilidad',
    title: 'Reformer vs. mat: cómo poner precio a cada clase',
    body: 'Dos formatos, dos costes, dos techos de ingresos. Cómo fijar precios que reflejen la diferencia — sin dejar dinero sobre la mesa.',
    href: '/recursos/precios-reformer-mat',
    meta: '7 min · jul 2026',
  },
  {
    category: 'espana',
    title: 'Facturación electrónica para estudios en España',
    body: 'Qué cambia con Veri*factu, cuándo es obligatorio y cómo dejarlo automatizado desde el primer cobro.',
    href: '/recursos/facturacion-electronica-verifactu',
    meta: '7 min · jul 2026',
  },
  {
    category: 'rentabilidad',
    title: 'Cómo subir la ocupación de tus clases valle',
    body: 'Las 10:00 de un martes vacías cuestan dinero. Tácticas de horario, listas de espera y precios para llenarlas.',
    meta: 'En preparación',
  },
  {
    category: 'operacion',
    title: 'Reduce las cancelaciones de última hora',
    body: 'Políticas, recordatorios y listas de espera que protegen tus plazas sin espantar a las alumnas.',
    meta: 'En preparación',
  },
  {
    category: 'software',
    title: 'Checklist: cómo elegir el software de tu estudio',
    body: 'Las preguntas que debes hacer en una demo — y las señales de alarma que ahorran meses de arrepentimiento.',
    meta: 'En preparación',
  },
  {
    category: 'sustituciones',
    title: 'Cómo evitar depender de una sola instructora',
    body: 'El riesgo silencioso de todo estudio: cómo repartir el conocimiento y la carga entre tu equipo.',
    meta: 'En preparación',
  },
];

const FEATURED = {
  category: 'sustituciones' as const,
  title: 'Cómo cubrir una baja de instructora sin hacer una llamada',
  body: 'El proceso que roba noches a las propietarias — y cómo convertirlo en algo que ocurre solo. Paso a paso, con lo que puedes automatizar hoy.',
  href: '/recursos/cubrir-baja-instructora',
  meta: '8 min de lectura · Actualizado jul 2026',
};

export default function RecursosPage() {
  const [cat, setCat] = useState<Category>('todos');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      ARTICLES.filter((a) => (cat === 'todos' || a.category === cat) && (!q || a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q))),
    [cat, q]
  );
  const featuredVisible = (cat === 'todos' || cat === FEATURED.category) && (!q || FEATURED.title.toLowerCase().includes(q) || FEATURED.body.toLowerCase().includes(q));

  return (
    <PageShell>
      <SiteNav backHref="/recursos" backLabel="Recursos" />

      <header style={{ position: 'relative', padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) clamp(32px,4vw,48px)' }}>
        <div style={{ position: 'absolute', top: -140, right: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle at 42% 42%, rgba(124,58,237,.16), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
          <div className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5B21B6', background: '#F1ECFB', padding: '8px 15px', borderRadius: 999, marginBottom: 24 }}>Centro de Recursos</div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(36px,5.4vw,62px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px' }}>Cómo llenar, cobrar y<br />automatizar tu estudio.</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 560, margin: '0 0 30px' }}>Guías prácticas para propietarias de estudios de pilates: ocupación, precios, sustituciones, retención y la parte administrativa que nadie te contó. Sin humo.</p>
          <div style={{ position: 'relative', maxWidth: 460 }}>
            <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#A8A89F' }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={11} cy={11} r={8} /><path d="m21 21-4.3-4.3" /></svg>
            </span>
            <input
              aria-label="Buscar en recursos"
              placeholder="Busca: sustituciones, precios, ocupación…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%', fontFamily: 'inherit', fontSize: 15, color: '#1A1A1A', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, padding: '15px 16px 15px 46px', outline: 'none' }}
            />
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(20px,4vw,44px)', marginBottom: 34 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CATEGORIES.map((c) => {
            const active = cat === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                style={{ border: active ? 'none' : '1px solid #E1E1D8', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 999, background: active ? ACC : '#fff', color: active ? '#fff' : '#5A5A52', transition: 'background .2s, color .2s' }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {featuredVisible && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(20px,4vw,44px)', marginBottom: 44 }}>
          <div className="rec-card" style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 24, overflow: 'hidden', boxShadow: '0 30px 60px -40px rgba(26,26,26,.3)' }}>
            <div className="rec-feat">
              <div style={{ position: 'relative', minHeight: 280, background: CATEGORY_GRADIENTS[FEATURED.category], overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'flex-end', padding: 26, background: 'linear-gradient(to top, rgba(15,15,15,.5), transparent 55%)' }}>
                  <div>
                    <span className="lp-mono" style={{ display: 'inline-block', fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#fff', background: 'rgba(255,255,255,.18)', padding: '5px 11px', borderRadius: 999, marginBottom: 14 }}>★ Guía destacada</span>
                    <div className="lp-mono" style={{ fontSize: 12, color: 'rgba(255,255,255,.82)' }}>Sustituciones y equipo</div>
                  </div>
                </div>
              </div>
              <Link href={FEATURED.href} style={{ padding: 'clamp(26px,3vw,40px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', textDecoration: 'none', color: 'inherit' }}>
                <h2 style={{ fontWeight: 800, fontSize: 'clamp(24px,2.6vw,34px)', lineHeight: 1.08, letterSpacing: '-.03em', margin: '0 0 12px' }}>{FEATURED.title}</h2>
                <p style={{ fontSize: 16, lineHeight: 1.6, color: MUTED, margin: '0 0 20px' }}>{FEATURED.body}</p>
                <div className="lp-mono" style={{ fontSize: 12, color: '#8E8E86' }}>{FEATURED.meta}</div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 22, fontSize: 15, fontWeight: 700, color: ACC }}>
                  Leer la guía <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                </span>
              </Link>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(20px,4vw,44px) clamp(60px,8vw,96px)' }}>
        <div className="rec-grid">
          {filtered.map((a) => {
            const card = (
              <>
                <div style={{ position: 'relative', aspectRatio: '16/10', background: CATEGORY_GRADIENTS[a.category], overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: 16, background: 'linear-gradient(to top, rgba(15,15,15,.42), transparent 55%)' }}>
                    <span className="lp-mono" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#fff', background: 'rgba(255,255,255,.18)', padding: '5px 10px', borderRadius: 999 }}>
                      {CATEGORIES.find((c) => c.key === a.category)?.label}
                    </span>
                    {!a.href && <span className="lp-mono" style={{ fontSize: 9.5, color: '#fff', background: 'rgba(0,0,0,.3)', padding: '4px 9px', borderRadius: 999 }}>Próximamente</span>}
                  </div>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.15, margin: 0 }}>{a.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED, margin: 0, flex: 1 }}>{a.body}</p>
                  <div className="lp-mono" style={{ fontSize: 11.5, color: a.href ? '#8E8E86' : '#A8A89F' }}>{a.meta}</div>
                </div>
              </>
            );
            const style: React.CSSProperties = { display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 20, overflow: 'hidden' };
            return a.href ? (
              <Link key={a.title} href={a.href} className="rec-card" style={{ ...style, textDecoration: 'none', color: 'inherit' }}>{card}</Link>
            ) : (
              <div key={a.title} className="rec-card" style={style}>{card}</div>
            );
          })}
          {filtered.length === 0 && !featuredVisible && (
            <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: MUTED, padding: '40px 0' }}>No hay guías que coincidan con tu búsqueda todavía.</p>
          )}
        </div>

        <div style={{ marginTop: 'clamp(48px,6vw,72px)', background: '#0F0F0F', color: '#E8E8E4', borderRadius: 26, padding: 'clamp(32px,5vw,56px)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-30%', right: '-6%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.3), transparent 64%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', maxWidth: 520 }}>
            <div className="lp-mono" style={{ fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: '#C08BE8', marginBottom: 14 }}>La newsletter de Tentare</div>
            <h2 style={{ fontWeight: 800, fontSize: 'clamp(26px,3.4vw,40px)', lineHeight: 1.05, letterSpacing: '-.03em', margin: '0 0 12px', color: '#fff' }}>Una idea al mes para llenar tu estudio.</h2>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: '#A6A69E', margin: '0 0 24px' }}>Guías nuevas, plantillas y datos del sector. Sin spam — cancelas cuando quieras.</p>
            <a
              href="mailto:hola@tentare.app?subject=Suscribirme%20a%20la%20newsletter"
              className="hover:brightness-110"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: '#fff', background: ACC, borderRadius: 12, padding: '14px 24px' }}
            >
              Suscribirme por email
            </a>
          </div>
        </div>
      </div>

      <SiteFooter links={[{ href: '/comparativa', label: 'Comparativa' }, { href: '/seguridad', label: 'Seguridad' }]} />

      <style>{`
        .rec-feat { display: grid; grid-template-columns: 1.08fr .92fr; gap: 0; }
        .rec-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 22px; }
        .rec-card { transition: transform .28s cubic-bezier(.2,.7,0,1), box-shadow .28s; }
        .rec-card:hover { transform: translateY(-6px); box-shadow: 0 40px 74px -40px rgba(26,26,26,.32); }
        @media (max-width: 900px) {
          .rec-feat { grid-template-columns: 1fr; }
          .rec-grid { grid-template-columns: repeat(2,1fr); }
        }
        @media (max-width: 600px) {
          .rec-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </PageShell>
  );
}
