'use client';

// TEMPORAL — maquetas de mensajes y comunidad (tras estudiar Momence y el sector). No se commitea.
import type { CSSProperties, ReactNode } from 'react';
import '../../portal/[slug]/student.css';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

const M = '/zz-momence';
const FOTO = '/por-defecto/estudio-hero.webp';

function Movil({ titulo, nota, children, img, etiqueta }: { titulo: string; nota?: string; children?: ReactNode; img?: string; etiqueta: 'Momence' | 'Tentare hoy' | 'Propuesta' }) {
  const color = etiqueta === 'Propuesta' ? '#2E5A3A' : etiqueta === 'Momence' ? '#8A6F5E' : '#666';
  return (
    <figure style={{ margin: 0, width: 280, flex: 'none' }}>
      <span style={{ display: 'inline-block', marginBottom: 8, fontSize: 12, fontWeight: 800, letterSpacing: '.08em', color, textTransform: 'uppercase' }}>{etiqueta}</span>
      <div className="student-app" style={{ width: 280, height: 606, borderRadius: 38, overflow: 'hidden', border: '8px solid #111', background: 'var(--background)', position: 'relative', boxShadow: '0 18px 44px rgba(0,0,0,.16)' }}>
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt="" style={{ width: '100%', display: 'block' }} />
          : (
            <>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9, height: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', fontSize: 11, fontWeight: 700 }}>
                <span>9:41</span><span style={{ width: 74, height: 20, borderRadius: 20, background: '#000' }} /><span>●●●</span>
              </div>
              <div style={{ height: 818, overflow: 'hidden', zoom: 0.72, position: 'relative' } as CSSProperties}>{children}</div>
            </>
          )}
      </div>
      <figcaption style={{ marginTop: 10, fontFamily: 'system-ui', fontSize: 13, lineHeight: 1.4 }}>
        <b>{titulo}</b>{nota && <span style={{ display: 'block', color: '#666' }}>{nota}</span>}
      </figcaption>
    </figure>
  );
}

const card: CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, padding: 14 };
const meta: CSSProperties = { fontSize: 14, color: 'var(--muted-foreground)', margin: 0 };
const micro: CSSProperties = { fontSize: 11, letterSpacing: '.08em', fontWeight: 800, color: 'var(--muted-foreground)', textTransform: 'uppercase' };

function Logo({ s = 40 }: { s?: number }) {
  return <span style={{ width: s, height: s, borderRadius: 99, background: '#2B3A2E', color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontSize: s * 0.4 }}>A</span>;
}

function Boton({ n, punto }: { n: NombreIcono; punto?: boolean }) {
  return (
    <span style={{ position: 'relative', width: 40, height: 40, borderRadius: 99, border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icono nombre={n} tamano={20} />
      {punto && <span style={{ position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: 9, background: 'var(--warning, #C9A227)', border: '2px solid #fff' }} />}
    </span>
  );
}

function CabeceraApp() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '46px 18px 10px' }}>
      <Logo s={34} /><b style={{ flex: 1, fontSize: 16 }}>Estudio Aura</b>
      <Boton n="comentario" punto /><Boton n="campana" />
    </div>
  );
}

function Burbuja({ yo, children, quien, estado }: { yo?: boolean; children: ReactNode; quien?: string; estado?: 'enviando' | 'fallo' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: yo ? 'flex-end' : 'flex-start', gap: 3 }}>
      <div style={{ maxWidth: '78%', padding: '9px 13px', borderRadius: 18, fontSize: 16, lineHeight: 1.35, background: yo ? 'var(--accent)' : 'var(--card)', color: yo ? '#fff' : 'var(--foreground)', border: yo ? (estado === 'fallo' ? '2px solid var(--destructive)' : 'none') : '1px solid var(--border)', opacity: estado === 'enviando' ? 0.6 : 1 }}>{children}</div>
      {quien && <span style={{ fontSize: 12, color: 'var(--muted-foreground)', paddingLeft: 6 }}>{quien}</span>}
      {estado === 'enviando' && <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Enviando…</span>}
      {estado === 'fallo' && <span style={{ fontSize: 12, color: 'var(--destructive)', fontWeight: 800 }}>No se ha enviado · Reintentar</span>}
    </div>
  );
}

function CabeceraHilo({ sub }: { sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '44px 14px 10px', borderBottom: '1px solid var(--border)', background: 'var(--background)' }}>
      <Icono nombre="chevron-izquierda" tamano={22} /><Logo />
      <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 17 }}>Estudio Aura</b>{sub && <span style={{ fontSize: 13, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: 9, background: '#999' }} />{sub}</span>}</span>
    </div>
  );
}

function Compositor() {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 12px 30px', background: 'var(--background)', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <span style={{ flex: 1, minHeight: 42, borderRadius: 21, border: '1px solid var(--border)', background: 'var(--card)', padding: '10px 14px', fontSize: 16, color: 'var(--muted-foreground)' }}>Escribe a Estudio Aura…</span>
      <span style={{ width: 42, height: 42, borderRadius: 99, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icono nombre="enviar" tamano={18} /></span>
    </div>
  );
}

// 1 · Mensajes desde la cabecera
function ListaMensajes() {
  return (
    <div>
      <CabeceraApp />
      <div style={{ padding: '6px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Mensajes</p><span className="btn btn--secondary btn--sm">Escribir al estudio</span>
      </div>
      <div style={{ padding: '10px 18px', display: 'flex', flexDirection: 'column' }}>
        {[
          { n: 'Tablón de Estudio Aura', t: '📌 Fijado: Horario de Navidad…', h: 'Ayer', p: true, tablon: true },
          { n: 'Estudio Aura', t: 'Marta: ¡Claro! Te guardo la plaza del jueves', h: '18:12', p: true },
          { n: 'Lucía · instructora', t: 'Tú: Gracias por la clase de hoy', h: 'Lun', p: false },
        ].map((c) => (
          <div key={c.n} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            {c.tablon ? <span style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icono nombre="megafono" tamano={22} /></span> : <Logo s={46} />}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}><b style={{ fontSize: 16 }}>{c.n}</b><span style={{ fontSize: 13, color: c.p ? 'var(--accent)' : 'var(--muted-foreground)', fontWeight: c.p ? 800 : 400 }}>{c.h}</span></span>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ ...meta, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: c.p ? 700 : 400, color: c.p ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{c.t}</span>{c.p && <span style={{ width: 9, height: 9, borderRadius: 9, background: 'var(--accent)', flex: 'none', marginTop: 5 }} />}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 2 · Hilo con el estudio
function Hilo() {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <CabeceraHilo sub="Cerrado ahora · te contestarán mañana a las 9:00" />
      <div style={{ padding: '14px 14px 110px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ ...micro, alignSelf: 'center' }}>Hoy</span>
        <Burbuja yo>Hola! ¿Queda sitio el jueves por la mañana?</Burbuja>
        <Burbuja quien="Marta">¡Hola Lucía! Te dejo la de las 9:00, quedan 2 plazas 😊</Burbuja>
        <div style={{ ...card, width: '80%', display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 18 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ width: 52, height: 52, borderRadius: 12, background: `url(${FOTO}) center/cover`, flex: 'none' }} />
            <span><b style={{ display: 'block', fontSize: 15 }}>Reformer intermedio</b><span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Jue 9 oct · 9:00 · Marta</span></span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>2 plazas libres</span>
          <span className="btn btn--primary btn--sm" style={{ width: '100%' }}>Reservar</span>
        </div>
        <Burbuja yo estado="enviando">Perfecto, la reservo ahora. ¡Gracias!</Burbuja>
      </div>
      <Compositor />
    </div>
  );
}

// 3 · Primer mensaje
function Primero() {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <CabeceraHilo />
      <div style={{ padding: '40px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <Logo s={56} />
        <p style={{ fontSize: 18, fontWeight: 800, margin: '6px 0 0' }}>Escribe lo que necesites a Estudio Aura</p>
        <p style={meta}>Algunas cosas puedes hacerlas tú ahora mismo:</p>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
          {[['mis-clases', 'Cancelar una clase'], ['bono', 'Ver mi bono'], ['calendario', 'Mis pagos']].map(([i, t]) => (
            <div key={t} style={{ ...card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, textAlign: 'left' }}>
              <span style={{ color: 'var(--accent)' }}><Icono nombre={i as NombreIcono} tamano={20} /></span><span style={{ flex: 1, fontSize: 16 }}>{t}</span><Icono nombre="chevron-derecha" tamano={16} />
            </div>
          ))}
        </div>
      </div>
      <Compositor />
    </div>
  );
}

// 4 · Denunciar y bloquear
function Denunciar() {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '44px 14px 10px', borderBottom: '1px solid var(--border)' }}>
        <Icono nombre="chevron-izquierda" tamano={22} />
        <span style={{ width: 40, height: 40, borderRadius: 99, background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>MR</span>
        <b style={{ flex: 1, fontSize: 17 }}>Marta · instructora</b><span style={{ fontSize: 22 }}>⋯</span>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.5 }}>
        <Burbuja>Te escribo por lo de ayer…</Burbuja>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--background)', borderRadius: '22px 22px 0 0', padding: '12px 18px 34px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 9, background: 'var(--border-strong)' }} />
        <p style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>¿Qué ha pasado con este mensaje?</p>
        <div className="input" style={{ color: 'var(--muted-foreground)', minHeight: 70 }}>Cuéntanoslo (opcional)</div>
        <span className="btn btn--primary btn--full">Enviar denuncia</span>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <b style={{ color: 'var(--destructive)' }}>Bloquear a Marta</b>
          <span style={meta}>No podrá escribirte ni abrir una conversación contigo. Puedes desbloquearla en Privacidad y datos.</span>
        </div>
      </div>
    </div>
  );
}

// 5 · Aviso sin contenido
function Push() {
  return (
    <div style={{ height: '100%', background: 'linear-gradient(160deg,#3b4a3f,#151a16)', color: '#fff', padding: '70px 14px 0' }}>
      <p style={{ fontSize: 64, fontWeight: 200, textAlign: 'center', margin: 0 }}>18:12</p>
      <p style={{ textAlign: 'center', margin: '-8px 0 22px', opacity: .8 }}>Domingo, 5 de octubre</p>
      <div style={{ background: 'rgba(245,245,240,.92)', color: '#111', borderRadius: 20, padding: 12, display: 'flex', gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 9, background: '#2B3A2E', color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A</span>
        <span style={{ flex: 1 }}><b style={{ fontSize: 14 }}>Estudio Aura</b><span style={{ fontSize: 12, color: '#666', float: 'right' }}>ahora</span>
          <span style={{ display: 'block', fontSize: 14 }}>Estudio Aura te ha escrito</span></span>
      </div>
      <p style={{ textAlign: 'center', fontSize: 13, opacity: .85, marginTop: 14, padding: '0 10px' }}>Nunca el texto del mensaje en la pantalla bloqueada: en ese hilo se habla de salud. Al tocar, abre la conversación.</p>
    </div>
  );
}

// 6 · Tablón
function Tablon() {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ padding: '46px 18px 8px' }}><p style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Tablón</p></div>
      <div style={{ padding: '6px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12 }}>
            <Logo s={34} /><span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 15 }}>Estudio Aura</b><span style={{ ...micro, fontSize: 10 }}>📌 Fijado · hace 2 h</span></span>
          </div>
          <div style={{ height: 300, background: `url(${FOTO}) center/cover` }} />
          <div style={{ padding: 12 }}>
            <b style={{ fontSize: 17 }}>Horario de Navidad</b>
            <p style={{ ...meta, fontSize: 15, marginTop: 4, lineHeight: 1.45 }}>Del 23 al 6 cambiamos algunas clases. Lo tienes todo en el horario. <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Ver más</span></p>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--destructive)', fontWeight: 800 }}>♥ 12</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: 'var(--accent)' }}><Icono nombre="comentario" tamano={18} /> Responder al estudio</span>
            </div>
          </div>
        </div>
        <div style={{ ...card, display: 'flex', gap: 12 }}>
          <span style={{ width: 52, height: 56, borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><span style={{ ...micro, fontSize: 10 }}>SÁB</span><b style={{ fontSize: 20 }}>18</b></span>
          <span style={{ flex: 1 }}>
            <b style={{ display: 'block', fontSize: 16 }}>Taller de respiración</b>
            <span style={meta}>Sáb 18 oct · 11:00-13:00 · Sala grande</span>
            <span style={{ display: 'block', height: 4, borderRadius: 9, background: 'var(--muted)', margin: '8px 0 4px' }}><span style={{ display: 'block', width: '66%', height: 4, borderRadius: 9, background: 'var(--accent)' }} /></span>
            <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>8 de 12 plazas</span>
            <span style={{ display: 'flex', gap: 8, marginTop: 10 }}><span className="btn btn--primary btn--sm">✓ Vas</span><span className="btn btn--secondary btn--sm">Al calendario</span><span className="btn btn--secondary btn--sm">Invitar</span></span>
          </span>
        </div>
      </div>
    </div>
  );
}

// 7 · Responder al estudio
function Responder() {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <CabeceraHilo />
      <div style={{ padding: '14px 14px 150px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ ...micro, alignSelf: 'flex-end', color: 'var(--accent)' }}>Sobre: Horario de Navidad ›</span>
        <Burbuja yo>¿El 26 hay Reformer por la tarde?</Burbuja>
        <Burbuja quien="Marta">Sí, a las 19:00. ¡Te esperamos!</Burbuja>
      </div>
      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 92, display: 'flex' }}>
        <span style={{ fontSize: 13, fontWeight: 800, background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)', borderRadius: 999, padding: '6px 12px' }}>Sobre: Horario de Navidad ✕</span>
      </div>
      <Compositor />
    </div>
  );
}

// 8 · Panel del estudio
function Panel({ children, titulo }: { children: ReactNode; titulo: string }) {
  return (
    <figure style={{ margin: 0, flex: '1 1 560px', maxWidth: 760 }}>
      <span style={{ display: 'inline-block', marginBottom: 8, fontSize: 12, fontWeight: 800, letterSpacing: '.08em', color: '#2E5A3A', textTransform: 'uppercase' }}>Propuesta · panel del estudio</span>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ddd', overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,.08)', fontSize: 14 }}>{children}</div>
      <figcaption style={{ marginTop: 10, fontSize: 13 }}><b>{titulo}</b></figcaption>
    </figure>
  );
}

function Bandeja() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 220px', minHeight: 340 }}>
      <div style={{ borderRight: '1px solid #eee', padding: 12 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>{['Sin contestar (2)', 'Todas'].map((t, i) => <span key={t} style={{ padding: '5px 10px', borderRadius: 99, fontWeight: 700, fontSize: 12, background: i === 0 ? '#1b1b1b' : '#f2f1ec', color: i === 0 ? '#fff' : '#333' }}>{t}</span>)}</div>
        {[['Lucía P.', 'hace 3 h', '¿Queda sitio el jueves…', true], ['Sara M.', 'hace 5 h', 'No podré ir mañana', true], ['Ana T.', 'ayer', 'Gracias!!', false]].map(([n, h, t, s]) => (
          <div key={n as string} style={{ padding: '9px 6px', borderBottom: '1px solid #f0f0f0', background: n === 'Lucía P.' ? '#f6f5f0' : 'transparent', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{n}</b><span style={{ color: '#888', fontSize: 12 }}>{h}</span></div>
            <div style={{ color: '#666', fontSize: 13 }}>{t}</div>
            {s && <span style={{ fontSize: 11, fontWeight: 800, color: '#9a6a00' }}>Sin contestar</span>}
          </div>
        ))}
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: '#fbfaf7' }}>
        <div style={{ alignSelf: 'flex-start', background: '#fff', border: '1px solid #e5e3da', borderRadius: 14, padding: '8px 12px', maxWidth: '70%' }}>¿Queda sitio el jueves por la mañana?</div>
        <div style={{ alignSelf: 'flex-end', background: '#2E5A3A', color: '#fff', borderRadius: 14, padding: '8px 12px', maxWidth: '70%' }}>¡Hola Lucía! Te dejo la de las 9:00</div>
        <span style={{ alignSelf: 'flex-end', fontSize: 11, color: '#888' }}>Marta</span>
        <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}><span style={{ flex: 1, border: '1px solid #ddd', borderRadius: 10, padding: '9px 12px', color: '#999' }}>Escribe… (+ compartir una clase)</span><span style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid #ddd' }}>Resolver sin escribir</span><span style={{ padding: '9px 14px', borderRadius: 10, background: '#1b1b1b', color: '#fff', fontWeight: 700 }}>Enviar</span></div>
      </div>
      <div style={{ borderLeft: '1px solid #eee', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b>Sobre Lucía</b>
        <span>Bono 10 · quedan 3 · caduca 12 nov</span>
        <span>Próxima: jue 9:00 Reformer</span>
        <span style={{ color: '#9a3b2a' }}>Recibo pendiente 45 €</span>
        <span style={{ color: '#2E5A3A', fontWeight: 700 }}>Ver ficha ›</span>
      </div>
    </div>
  );
}

function EscribirClase() {
  return (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <b style={{ fontSize: 17 }}>Escribir a las alumnas de Reformer · jue 9:00</b>
      <span style={{ color: '#666' }}>8 alumnas · 2 no tienen la app: avísalas por correo o por teléfono</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{['Empezamos 10 min tarde', 'Hoy cambiamos de sala', 'Trae calcetines antideslizantes'].map((t) => <span key={t} style={{ padding: '6px 11px', borderRadius: 99, background: '#f2f1ec', fontWeight: 600 }}>{t}</span>)}</div>
      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12, minHeight: 60 }}>Hoy empezamos 10 minutos tarde. ¡Perdón!</div>
      <span style={{ alignSelf: 'flex-end', padding: '9px 16px', borderRadius: 10, background: '#1b1b1b', color: '#fff', fontWeight: 700 }}>Enviar a 6</span>
      <span style={{ color: '#666', fontSize: 13 }}>Cada alumna lo recibe en SU chat con el estudio («Mensaje a toda la clase»). Si contesta, solo lo lee el estudio.</span>
    </div>
  );
}

const DECISIONES: [string, string, string][] = [
  ['1', 'Mensajes a un toque', 'Un bocadillo junto a la campana, con punto si hay algo sin leer. Arriba de Mensajes, el tablón del estudio si ha publicado este mes. Inicio no cambia (los bloques que quitaste siguen fuera).'],
  ['2', 'El chat como WhatsApp', 'En vivo con la conversación abierta, la caja crece, «Enviando…» y «Reintentar» sin perder el texto, el nombre de quien contesta del estudio («Marta»), y cuándo te contestarán si está cerrado. El aviso abre la conversación y el punto de sin leer se apaga al leer (hoy no).'],
  ['3', 'Una clase dentro del chat, con «Reservar»', 'El estudio comparte una clase y a ti te llega como tarjeta con plazas en vivo y el botón de reservar (abre la ficha normal: nada se reserva desde el chat).'],
  ['4', 'Denunciar y bloquear (lo exige Apple)', 'Mantener pulsado un mensaje → denunciar; bloquear a una instructora; el estudio puede silenciar o cerrar un hilo y ve las denuncias en su bandeja de «por decidir».'],
  ['5', 'Avisos sin contenido', '«Estudio Aura te ha escrito», nunca el texto en la pantalla bloqueada (hoy se ven 80 caracteres en un hilo donde se habla de salud).'],
  ['6', 'Tablón que cumple', 'Fijados arriba, foto entera que se amplía, enlaces que se abren, corazón que late cuando el estudio lo confirma, y «Responder al estudio» en privado (sin comentarios públicos entre alumnas: nadie expone su nombre ni nada de salud).'],
  ['7', 'Eventos útiles', 'Plazas con barra, «Me apunto», al calendario, recordatorio el día antes e invitar a una amiga. No se enseña quién va (un taller de suelo pélvico con lista de asistentes revela salud).'],
  ['8', 'El estudio contesta a tiempo', 'Bandeja con «Sin contestar», ficha de la alumna al lado, «Resolver sin escribir» y, en Resumen, «2 mensajes sin contestar desde hace más de 4 h».'],
  ['9', 'El estudio escribe primero, con motivo', 'Escribir a toda una clase (cada una en su chat privado) y que el Centro de Control redacte «Te echamos de menos…» con la clase y su «Reservar». Es lo que el agente de IA de Momence (399 $/mes) no hace: solo contesta si la clienta escribe antes.'],
  ['10', 'Antes de mandar a Apple, privacidad completa', 'Los comentarios ya no enseñan apellidos; borrar una publicación borra su foto; «Descargar mis datos» incluye tablón y chat; normas y contacto en Ayuda. Y pedir la valoración de la App Store tras la 3.ª clase, con el aviso del propio iPhone.'],
];

const DUDAS: [string, string][] = [
  ['Tablón', 'Recomiendo «Responder al estudio» en privado y sin comentarios públicos (más seguro, menos trabajo para la dueña). La otra opción son comentarios públicos con nombre e inicial y moderación. ¿Cuál?'],
  ['Quién contesta', '¿Enseñamos el nombre de pila de quien contesta («Marta»)? Recomiendo sí. ¿Y «Visto 18:42»? Recomiendo no por ahora: mete presión a una dueña sola y no se puede quitar después.'],
  ['Fotos en el chat', '¿Dejamos mandar fotos (justificantes médicos, transferencias)? Tiene datos de salud en imágenes y es más trabajo. Si no, el chat dice «por ahora solo texto».'],
  ['Menores de 14', '¿Puede una instructora escribir 1:1 a una alumna menor de 14 años? Hoy puede.'],
  ['Denuncias', '¿Quién atiende las denuncias contra el propio estudio y quién figura como contacto en la App Store: Tentare o cada estudio?'],
  ['«Clase 50»', '¿La instructora ve en su lista «Clase 50 de Lucía» para felicitarla en persona, sin pedir permiso (ya ve su asistencia) o solo si la alumna lo acepta?'],
];

export default function Maquetas() {
  const Fila = ({ t, children }: { t: string; children: ReactNode }) => (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>{t}</h2>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>{children}</div>
    </section>
  );
  return (
    <main style={{ background: '#EEECE6', minHeight: '100vh', padding: 36, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 6px' }}>Mensajes y comunidad, hechos para un estudio pequeño</h1>
      <p style={{ margin: '0 0 28px', color: '#555', maxWidth: 1100 }}>Momence: su chat es un hilo de texto por estudio y su feed, un tablón donde publica el estudio con fotos grandes (lo que ves en tus capturas). Lo potente lo tiene del lado del estudio. Aquí: lo básico impecable, seguro antes de publicar en Apple, y que el estudio escriba primero con un motivo.</p>

      <Fila t="1 · Mensajes y chat">
        <Movil etiqueta="Momence" titulo="Bandeja" nota="Una fila por estudio." img={`${M}/m-10-bandeja-entrada.png`} />
        <Movil etiqueta="Tentare hoy" titulo="Mensajes" nota="Solo desde Perfil; el punto no se apaga." img={`${M}/hoy-mensajes.png`} />
        <Movil etiqueta="Propuesta" titulo="Desde la cabecera, con el tablón arriba"><ListaMensajes /></Movil>
        <Movil etiqueta="Propuesta" titulo="Hilo: en vivo, quién contesta, clase con «Reservar»"><Hilo /></Movil>
        <Movil etiqueta="Propuesta" titulo="Primer mensaje con atajos" nota="Lo más común lo hace ella sola."><Primero /></Movil>
      </Fila>

      <Fila t="2 · Seguro antes de publicar">
        <Movil etiqueta="Propuesta" titulo="Denunciar y bloquear" nota="Lo exige Apple (guía 1.2)."><Denunciar /></Movil>
        <Movil etiqueta="Propuesta" titulo="Aviso sin el texto del mensaje"><Push /></Movil>
      </Fila>

      <Fila t="3 · Tablón">
        <Movil etiqueta="Momence" titulo="Feed" nota="Fotos grandes; solo publica el estudio." img={`${M}/m-11-feed.png`} />
        <Movil etiqueta="Tentare hoy" titulo="Comunidad" nota="Foto recortada; el «Fijar» no llega." img={`${M}/hoy-comunidad.png`} />
        <Movil etiqueta="Propuesta" titulo="Fijado, foto entera, eventos útiles"><Tablon /></Movil>
        <Movil etiqueta="Propuesta" titulo="«Responder al estudio», en privado"><Responder /></Movil>
      </Fila>

      <Fila t="4 · Lado del estudio">
        <Panel titulo="Bandeja que no deja un mensaje sin contestar"><Bandeja /></Panel>
        <Panel titulo="Escribir a toda una clase, cada una en su chat"><EscribirClase /></Panel>
      </Fila>

      <section style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 24 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>Decisiones</h2>
          {DECISIONES.map(([n, t, d]) => (
            <div key={n} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <b style={{ width: 22, flex: 'none', color: '#B4537E' }}>{n}</b>
              <div><b style={{ display: 'block' }}>{t}</b><span style={{ color: '#444', fontSize: 14, lineHeight: 1.45 }}>{d}</span></div>
            </div>
          ))}
          <h3 style={{ fontSize: 16, margin: '18px 0 8px' }}>No hacemos</h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#444', fontSize: 14, lineHeight: 1.6 }}>
            <li>Grupos de chat entre alumnas (imposible de moderar para una dueña sola).</li>
            <li>Rankings, «top asistentes», antes y después, peso o calorías.</li>
            <li>Un chat con IA que contesta a las alumnas, o reservar y cobrar desde el chat.</li>
            <li>El texto del mensaje en el aviso, o pedir permiso de avisos nada más abrir.</li>
            <li>Volver a meter Mensajes o «Del estudio» en Inicio (lo quitaste por peso).</li>
          </ul>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 24 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>Decisiones tuyas</h2>
          {DUDAS.map(([t, d]) => (
            <div key={t} style={{ marginBottom: 12 }}><b style={{ display: 'block' }}>{t}</b><span style={{ color: '#444', fontSize: 14, lineHeight: 1.45 }}>{d}</span></div>
          ))}
        </div>
      </section>
    </main>
  );
}
