'use client';

// TEMPORAL — maquetas de la app de la alumna (tanda con diseño). No se commitea.
import type { CSSProperties, ReactNode } from 'react';
import '../../portal/[slug]/student.css';
import { Icono } from '@/components/student/ui/Icono';

const FOTO = '/por-defecto/estudio-hero.webp';

const DECISIONES: [string, string, string][] = [
  ['1', 'Inicio según el momento', 'Si tienes clase hoy o mañana, lo primero es esa clase: hora, sala, instructora, tu QR para entrar y «Cómo llegar». La portada se hace pequeña. Sin clase cerca, Inicio queda como hoy. No se quita ningún bloque: solo cambia el orden.'],
  ['2', 'Letra más grande, y la que elijas en tu iPhone', 'El texto pasa de 13,5 a 16 px y los datos pequeños de 11,5 a 13. Si en el iPhone tienes «Texto más grande», la app lo respeta. Mismas tipografías del estudio; cambia la escala.'],
  ['3', 'La pantalla entra deslizando y se vuelve con el dedo', 'Al abrir una clase, entra desde la derecha; para volver, deslizas desde el borde izquierdo como en cualquier app del iPhone. Entre pestañas, un fundido corto. Con «Reducir movimiento», sin animación.'],
  ['4', 'Tu QR en Apple Wallet', '«Añadir a Apple Wallet»: el QR del estudio aparece en la pantalla bloqueada cuando llegas, sin abrir la app. Al enseñarlo en la app, la pantalla sube el brillo sola. Ninguno de los cuatro competidores lo hace (no verificado del todo).'],
  ['5', '¿Qué tal la clase? justo al terminar', 'Un aviso al acabar y una tarjeta arriba en Inicio: «¿Qué tal Reformer con Ana?» con cinco caras y, si quiere, una frase. Un toque. Hoy solo se puede desde el historial.'],
  ['6', 'Tus clases, en tu calendario solas', 'Un interruptor en Perfil: «Añadir mis reservas a mi calendario». Cada reserva aparece en el calendario del iPhone y desaparece si la cancelas. «+ Calendario» de la ficha pasa a ser un toque.'],
  ['7', 'Renovar y pagar sin salir de la app, con Apple Pay', '«Renovar mi plan» y «Pagar ahora» abren la hoja de pago dentro de la app, como ya hace «Comprar», con Apple Pay arriba si el iPhone lo tiene. Hoy te sacan a Safari.'],
];

const HOY_INICIO: [string, string][] = [
  ['Portada con foto, saludo y titular', 'Sigue. Con clase hoy o mañana, más baja (160 px) y encoge al bajar.'],
  ['Buscador y filtros rápidos', 'Sigue, justo debajo de tu clase.'],
  ['Las 4 baldosas (Reservar, Instructoras, Bonos, Favoritas)', 'Siguen.'],
  ['Frase del estudio a mano', 'Sigue.'],
  ['Tu próxima clase', 'Sube arriba del todo si es hoy o mañana, con QR y «Cómo llegar».'],
  ['Activar avisos', 'Sigue.'],
  ['Tu ritmo · Valoración inicial · Plaza fija · Nivel', 'Siguen, en el mismo orden.'],
  ['Descubre · Huecos de hoy', 'Siguen.'],
  ['(nuevo) ¿Qué tal la clase?', 'Solo las 24 h después de una clase, arriba.'],
];

function Movil({ titulo, nota, children, oscuro }: { titulo: string; nota?: string; children: ReactNode; oscuro?: boolean }) {
  return (
    <figure style={{ margin: 0, width: 300, flex: 'none' }}>
      <div className="student-app" style={{ width: 300, height: 650, borderRadius: 40, overflow: 'hidden', border: '9px solid #111', background: oscuro ? '#111' : 'var(--background)', position: 'relative', boxShadow: '0 20px 50px rgba(0,0,0,.18)' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, height: 34, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 22px', fontSize: 12, fontWeight: 700, color: oscuro ? '#fff' : '#111' }}>
          <span>9:41</span><span style={{ width: 80, height: 22, borderRadius: 20, background: '#000' }} /><span>●●●</span>
        </div>
        <div style={{ height: 810, overflow: 'hidden', zoom: 0.78, position: 'relative' } as CSSProperties}>{children}</div>
      </div>
      <figcaption style={{ marginTop: 12, fontFamily: 'system-ui', fontSize: 13, lineHeight: 1.4 }}>
        <b>{titulo}</b>{nota && <span style={{ display: 'block', color: '#666' }}>{nota}</span>}
      </figcaption>
    </figure>
  );
}

const pad = { padding: '0 20px' } as const;

function Pestanas({ activa = 0 }: { activa?: number }) {
  const t: [Parameters<typeof Icono>[0]['nombre'], string][] = [['inicio', 'Inicio'], ['reservar', 'Reservar'], ['mis-clases', 'Mis clases'], ['bono', 'Bonos'], ['perfil', 'Perfil']];
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 84, background: 'var(--card)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', paddingTop: 10 }}>
      {t.map(([n, l], i) => (
        <span key={l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: i === activa ? 800 : 600, color: i === activa ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
          <Icono nombre={n} tamano={22} />{l}
        </span>
      ))}
    </div>
  );
}

function Baldosas() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
      {[['reservar', 'Reservar'], ['instructoras', 'Instructoras'], ['bono', 'Bonos'], ['favorito', 'Favoritas']].map(([n, l]) => (
        <div key={l} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
          <Icono nombre={n as 'reservar'} tamano={20} />{l}
        </div>
      ))}
    </div>
  );
}

function Buscador() {
  return (
    <div style={{ height: 46, borderRadius: 999, background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: 'var(--muted-foreground)', fontSize: 15 }}>
      <Icono nombre="buscar" tamano={18} /> Clases, instructoras o actividades…
    </div>
  );
}

/** Hoy: portada alta, buscador, baldosas, frase y, después, la próxima clase. */
function InicioHoy() {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ height: 316, background: `linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.55)), url(${FOTO}) center/cover`, color: '#fff', padding: '70px 20px 0', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 22 }}>
        <p style={{ fontSize: 11, letterSpacing: '.12em', fontWeight: 700, margin: 0, opacity: .9 }}>MARTES 7 DE OCTUBRE</p>
        <p style={{ fontSize: 25, fontWeight: 800, margin: '6px 0 0', lineHeight: 1.1 }}>Hola, Lucía</p>
        <p style={{ fontSize: 13.5, margin: '6px 0 0' }}>Muévete hoy con nosotras</p>
      </div>
      <div style={{ ...pad, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        <Buscador />
        <Baldosas />
        <p style={{ fontFamily: 'cursive', fontSize: 20, margin: '4px 0', color: 'var(--muted-foreground)' }}>«Respira, alarga, vuelve a ti»</p>
        <p className="t-label" style={{ margin: 0 }}>TU PRÓXIMA CLASE · queda fuera de la pantalla ↓</p>
      </div>
      <Pestanas />
    </div>
  );
}

function TarjetaClase({ grande }: { grande?: boolean }) {
  return (
    <div style={{ background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)', borderRadius: 22, padding: 18, display: 'flex', flexDirection: 'column', gap: grande ? 12 : 8 }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', opacity: .85 }}>HOY · EN 2 H 10 MIN</span>
      <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.05 }}>18:30 · Reformer</span>
      <span style={{ fontSize: 15, opacity: .9 }}>Con Ana · Sala grande · Plaza 4</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
        <span style={{ background: 'var(--accent-deep-foreground)', color: 'var(--accent-deep)', borderRadius: 999, padding: '11px 0', textAlign: 'center', fontWeight: 800, fontSize: 14 }}>Mi QR para entrar</span>
        <span style={{ border: '1.5px solid rgba(255,255,255,.4)', borderRadius: 999, padding: '11px 0', textAlign: 'center', fontWeight: 800, fontSize: 14 }}>Cómo llegar</span>
      </div>
    </div>
  );
}

/** Propuesta: con clase hoy o mañana, la clase primero y la portada baja. */
function InicioConClase() {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ height: 160, background: `linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.55)), url(${FOTO}) center/cover`, color: '#fff', padding: '0 20px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <p style={{ fontSize: 13, letterSpacing: '.1em', fontWeight: 700, margin: 0, opacity: .9 }}>MARTES 7 DE OCTUBRE</p>
        <p style={{ fontSize: 28, fontWeight: 800, margin: '4px 0 0' }}>Hola, Lucía</p>
      </div>
      <div style={{ ...pad, display: 'flex', flexDirection: 'column', gap: 12, marginTop: -6 }}>
        <TarjetaClase grande />
        <Buscador />
        <Baldosas />
      </div>
      <Pestanas />
    </div>
  );
}

function Escala({ nueva }: { nueva?: boolean }) {
  const s = nueva ? { h1: 28, h3: 17, body: 16, meta: 13, label: 12 } : { h1: 25, h3: 15, body: 13.5, meta: 11.5, label: 11 };
  return (
    <div style={{ ...pad, paddingTop: 54, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: s.h1, fontWeight: 800, margin: 0 }}>Reservar</p>
      <div style={{ display: 'flex', gap: 6 }}>
        {['Hoy', 'Mié 8', 'Jue 9', 'Vie 10'].map((d, i) => <span key={d} style={{ padding: '8px 12px', borderRadius: 999, background: i === 0 ? 'var(--foreground)' : 'var(--card)', color: i === 0 ? 'var(--background)' : 'var(--foreground)', border: '1px solid var(--border)', fontSize: s.meta + 1, fontWeight: 700 }}>{d}</span>)}
      </div>
      {[['09:00', 'Mat suelo', 'Con Marta · 3 plazas'], ['18:30', 'Reformer', 'Con Ana · Última plaza'], ['20:00', 'Barre', 'Con Laura · Completa · lista de espera']].map(([h, c, d]) => (
        <div key={h} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: s.h3, fontWeight: 800, width: 52 }}>{h}</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: s.h3, fontWeight: 800 }}>{c}</span>
            <span style={{ display: 'block', fontSize: s.meta, color: 'var(--muted-foreground)' }}>{d}</span>
          </span>
          <Icono nombre="chevron-derecha" tamano={18} />
        </div>
      ))}
      <p style={{ fontSize: s.body, margin: 0, lineHeight: 1.45 }}>Texto corrido de ejemplo: así se lee una descripción de clase o un aviso del estudio.</p>
      <p style={{ fontSize: s.label, letterSpacing: '.1em', fontWeight: 700, margin: 0, color: 'var(--muted-foreground)' }}>MICRO-ETIQUETA</p>
    </div>
  );
}

function Transicion() {
  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden', background: 'var(--background)' }}>
      <div style={{ position: 'absolute', inset: 0, padding: '54px 20px', opacity: .45, transform: 'translateX(-30%)' }}>
        <p style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Reservar</p>
        <div style={{ marginTop: 14, height: 70, borderRadius: 18, background: 'var(--card)', border: '1px solid var(--border)' }} />
        <div style={{ marginTop: 10, height: 70, borderRadius: 18, background: 'var(--card)', border: '1px solid var(--border)' }} />
      </div>
      <div style={{ position: 'absolute', inset: 0, left: '38%', background: 'var(--background)', boxShadow: '-12px 0 30px rgba(0,0,0,.18)', padding: '54px 18px' }}>
        <div style={{ height: 150, borderRadius: 18, background: `url(${FOTO}) center/cover` }} />
        <p style={{ fontSize: 24, fontWeight: 800, margin: '12px 0 4px' }}>Reformer</p>
        <p style={{ fontSize: 14, margin: 0, color: 'var(--muted-foreground)' }}>18:30 · Con Ana</p>
      </div>
      <div style={{ position: 'absolute', left: 6, top: '45%', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>
        <span style={{ width: 4, height: 60, borderRadius: 4, background: 'var(--accent)' }} /> desliza
      </div>
    </div>
  );
}

function Wallet() {
  return (
    <div style={{ height: '100%', background: '#111', color: '#fff', padding: '70px 18px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 64, fontWeight: 200, textAlign: 'center', margin: 0 }}>18:12</p>
      <p style={{ textAlign: 'center', margin: '-10px 0 10px', opacity: .8 }}>Martes, 7 de octubre</p>
      <div style={{ background: '#2B3A2E', borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}><span>ALBA PILATES</span><span>Wallet</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span><span style={{ display: 'block', fontSize: 11, opacity: .7 }}>SOCIA</span><b>Lucía</b></span>
          <span style={{ textAlign: 'right' }}><span style={{ display: 'block', fontSize: 11, opacity: .7 }}>HOY</span><b>18:30 Reformer</b></span>
        </div>
        <div style={{ alignSelf: 'center', width: 120, height: 120, background: '#fff', borderRadius: 8, display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', padding: 8, gap: 2 }}>
          {Array.from({ length: 64 }, (_, i) => <span key={i} style={{ background: (i * 7 + (i >> 3)) % 3 ? '#111' : '#fff' }} />)}
        </div>
      </div>
      <p style={{ textAlign: 'center', fontSize: 13, opacity: .8 }}>Aparece sola al llegar al estudio</p>
    </div>
  );
}

function QrEnApp() {
  return (
    <div style={{ ...pad, paddingTop: 54, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'stretch' }}>
      <p style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Tu acceso</p>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 22, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 170, height: 170, display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gap: 2 }}>
          {Array.from({ length: 100 }, (_, i) => <span key={i} style={{ background: (i * 13 + (i >> 2)) % 3 ? '#111' : '#fff' }} />)}
        </div>
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 6 }}>☀︎ Brillo al máximo mientras lo enseñas</span>
      </div>
      <div style={{ background: '#000', color: '#fff', borderRadius: 14, padding: '13px 0', textAlign: 'center', fontWeight: 700 }}> Añadir a Apple Wallet</div>
    </div>
  );
}

function Valorar() {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ ...pad, paddingTop: 54, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Hola, Lucía</p>
        <div style={{ background: 'var(--card)', border: '1.5px solid var(--accent)', borderRadius: 22, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', letterSpacing: '.06em' }}>HACE 20 MIN</span>
          <span style={{ fontSize: 21, fontWeight: 800 }}>¿Qué tal Reformer con Ana?</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 30 }}>
            {['😣', '😕', '🙂', '😊', '🤩'].map((c, i) => <span key={c} style={{ width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: i === 4 ? 'var(--accent-soft)' : 'var(--muted)' }}>{c}</span>)}
          </div>
          <div className="input" style={{ color: 'var(--muted-foreground)', fontSize: 15 }}>Cuéntale algo a Ana (opcional)</div>
          <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Lo ve tu estudio. No se publica.</span>
        </div>
        <Buscador />
      </div>
      <Pestanas />
    </div>
  );
}

function Calendario() {
  return (
    <div style={{ ...pad, paddingTop: 54, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <p style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px' }}>Perfil</p>
      {['Mis datos', 'Avisos'].map((t) => <div key={t} style={{ padding: '15px 0', borderBottom: '1px solid var(--border)', fontSize: 16, display: 'flex', justifyContent: 'space-between' }}>{t}<Icono nombre="chevron-derecha" tamano={16} /></div>)}
      <div style={{ padding: '15px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 16 }}>Mis reservas en mi calendario</span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--muted-foreground)' }}>Se añaden solas y se quitan si cancelas</span>
        </span>
        <span style={{ width: 51, height: 31, borderRadius: 99, background: 'var(--accent)', position: 'relative' }}><span style={{ position: 'absolute', right: 2, top: 2, width: 27, height: 27, borderRadius: 99, background: '#fff' }} /></span>
      </div>
      <div style={{ marginTop: 22, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icono nombre="calendario" tamano={20} />
        <span style={{ flex: 1, fontSize: 15 }}><b>Reformer · jue 18:30</b><span style={{ display: 'block', fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>✓ En tu calendario</span></span>
      </div>
    </div>
  );
}

function Pago() {
  return (
    <div style={{ position: 'relative', height: '100%', background: 'rgba(0,0,0,.35)' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--card)', borderRadius: '24px 24px 0 0', padding: '12px 20px 34px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 9, background: 'var(--border-strong)' }} />
        <p style={{ fontSize: 21, fontWeight: 800, margin: 0 }}>Renovar · Mensual 8 clases</p>
        <p style={{ fontSize: 15, margin: 0, color: 'var(--muted-foreground)' }}>69,00 € · del 1 al 31 de noviembre</p>
        <div style={{ background: '#000', color: '#fff', borderRadius: 12, padding: '14px 0', textAlign: 'center', fontWeight: 700, fontSize: 17 }}> Pay</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted-foreground)', fontSize: 13 }}><span style={{ flex: 1, height: 1, background: 'var(--border)' }} />o con tarjeta<span style={{ flex: 1, height: 1, background: 'var(--border)' }} /></div>
        <div className="input" style={{ color: 'var(--muted-foreground)' }}>•••• 4242 (guardada)</div>
        <div className="btn btn--primary btn--full">Pagar 69,00 €</div>
        <p style={{ fontSize: 12, margin: 0, color: 'var(--muted-foreground)', textAlign: 'center' }}>Sin salir de la app</p>
      </div>
    </div>
  );
}

export default function Maquetas() {
  return (
    <main style={{ background: '#EEECE6', minHeight: '100vh', padding: 40, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 6px' }}>App de la alumna · lo que cambia el diseño</h1>
      <p style={{ margin: '0 0 28px', color: '#555', maxWidth: 980 }}>De la auditoría pantalla a pantalla, comparada con bsport, Momence, Mindbody y Eversports. Lo que NO cambia el diseño ya está en construcción (sin «tics» de web, pestañas instantáneas, vibración al reservar, barra de estado, tirar para actualizar, color del estudio en «Tu próxima clase», compartir con la hoja del iPhone, textos que inventaban datos). Aquí, lo que necesita tu visto bueno.</p>

      <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>1 · Inicio según el momento</h2>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 34 }}>
        <Movil titulo="Hoy" nota="Tu clase de hoy queda debajo de la portada, el buscador, las baldosas y la frase."><InicioHoy /></Movil>
        <Movil titulo="Propuesta · con clase hoy o mañana" nota="Lo primero, tu clase: QR para entrar y Cómo llegar. Debajo, lo de siempre."><InicioConClase /></Movil>
      </div>

      <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>2 · Letra · 3 · Transiciones</h2>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 34 }}>
        <Movil titulo="Hoy · cuerpo 13,5 px"><Escala /></Movil>
        <Movil titulo="Propuesta · cuerpo 16 px" nota="Y si el iPhone tiene «Texto más grande», más."><Escala nueva /></Movil>
        <Movil titulo="Abrir una clase" nota="Entra desde la derecha; se vuelve deslizando desde el borde."><Transicion /></Movil>
      </div>

      <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>4 · Wallet · 5 · Valorar · 6 · Calendario · 7 · Pago</h2>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Movil titulo="Tu acceso" nota="Brillo al máximo y «Añadir a Apple Wallet»."><QrEnApp /></Movil>
        <Movil titulo="Pantalla bloqueada" nota="El pase sale solo al llegar al estudio." oscuro><Wallet /></Movil>
        <Movil titulo="¿Qué tal la clase?" nota="Un toque, al terminar."><Valorar /></Movil>
        <Movil titulo="Calendario automático" nota="Un interruptor en Perfil."><Calendario /></Movil>
        <Movil titulo="Renovar dentro de la app" nota="Apple Pay arriba; hoy te saca a Safari."><Pago /></Movil>
      </div>

      <section style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 28, alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 24 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>Decisiones</h2>
          {DECISIONES.map(([n, t, d]) => (
            <div key={n} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <b style={{ width: 24, flex: 'none', color: '#B4537E' }}>{n}</b>
              <div><b style={{ display: 'block' }}>{t}</b><span style={{ color: '#444', fontSize: 14, lineHeight: 1.45 }}>{d}</span></div>
            </div>
          ))}
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 24 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>Inicio: dónde queda cada cosa de hoy · no se quita nada</h2>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
            <tbody>
              {HOY_INICIO.map(([a, b]) => (
                <tr key={a} style={{ borderTop: '1px solid #eee' }}><td style={{ padding: '9px 10px 9px 0', fontWeight: 700, verticalAlign: 'top', width: '45%' }}>{a}</td><td style={{ padding: '9px 0', color: '#444' }}>{b}</td></tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ margin: '22px 0 8px', fontSize: 16 }}>Lo que cuesta</h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#444', fontSize: 14, lineHeight: 1.6 }}>
            <li>1, 2, 3, 5: solo web. Llegan a la app sin pasar otra vez por Apple.</li>
            <li>4 (Wallet) y 6 (calendario): piezas nativas. Conviene meterlas ANTES del primer envío a Apple; después, cada una es una actualización con revisión.</li>
            <li>4 necesita un certificado «Pass Type» de tu cuenta de Apple Developer.</li>
            <li>7: hay que probar Apple Pay en un iPhone de verdad (dentro de una app no siempre sale).</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
