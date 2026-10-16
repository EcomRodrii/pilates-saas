'use client';

// TEMPORAL — maquetas de Clase fija, Bonos y Avisos (tras ver Momence). No se commitea.
import type { CSSProperties, ReactNode } from 'react';
import '../../portal/[slug]/student.css';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

const HOY = '/zz-hoy';

function Movil({ titulo, nota, children, img }: { titulo: string; nota?: string; children?: ReactNode; img?: string }) {
  return (
    <figure style={{ margin: 0, width: 300, flex: 'none' }}>
      <div className="student-app" style={{ width: 300, height: 650, borderRadius: 40, overflow: 'hidden', border: '9px solid #111', background: 'var(--background)', position: 'relative', boxShadow: '0 20px 50px rgba(0,0,0,.18)' }}>
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt="" style={{ width: '100%', display: 'block' }} />
          : (
            <>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, height: 34, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 22px', fontSize: 12, fontWeight: 700 }}>
                <span>9:41</span><span style={{ width: 80, height: 22, borderRadius: 20, background: '#000' }} /><span>●●●</span>
              </div>
              <div style={{ height: 810, overflow: 'hidden', zoom: 0.78, position: 'relative' } as CSSProperties}>{children}</div>
            </>
          )}
      </div>
      <figcaption style={{ marginTop: 12, fontFamily: 'system-ui', fontSize: 13, lineHeight: 1.4 }}>
        <b>{titulo}</b>{nota && <span style={{ display: 'block', color: '#666' }}>{nota}</span>}
      </figcaption>
    </figure>
  );
}

const card: CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 20, padding: 16 };
const label: CSSProperties = { fontSize: 12, letterSpacing: '.1em', fontWeight: 800, color: 'var(--muted-foreground)', margin: 0, textTransform: 'uppercase' };
const fila: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderTop: '1px solid var(--border)' };

function Cabecera({ titulo, sub, accion }: { titulo: string; sub?: string; accion?: string }) {
  return (
    <div style={{ padding: '50px 20px 4px', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: '-.02em' }}>{titulo}</p>
        {sub && <p style={{ fontSize: 15, margin: '2px 0 0', color: 'var(--muted-foreground)' }}>{sub}</p>}
      </div>
      {accion && <span className="btn btn--secondary btn--sm">{accion}</span>}
    </div>
  );
}

function Segmentos({ activo }: { activo: number }) {
  return (
    <div style={{ margin: '12px 20px 0', background: 'var(--muted)', borderRadius: 999, padding: 4, display: 'flex' }}>
      {['Próximas', 'Fija', 'Historial'].map((t, i) => (
        <span key={t} style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 999, fontWeight: 800, fontSize: 15, background: i === activo ? 'var(--card)' : 'transparent', boxShadow: i === activo ? '0 1px 3px rgba(0,0,0,.08)' : 'none', color: i === activo ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{t}</span>
      ))}
    </div>
  );
}

function Circ({ n, tono = 'var(--accent)', fondo = 'var(--accent-soft)' }: { n: NombreIcono; tono?: string; fondo?: string }) {
  return <span style={{ width: 40, height: 40, borderRadius: 13, background: fondo, color: tono, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icono nombre={n} tamano={20} /></span>;
}

// ─── CLASE FIJA ──────────────────────────────────────────────────────────────

function FijaNueva() {
  const semanas: [string, string, 'va' | 'no' | 'pausa'][] = [['MIÉ', '8', 'va'], ['MIÉ', '15', 'no'], ['MIÉ', '22', 'va'], ['MIÉ', '29', 'va'], ['MIÉ', '5', 'va']];
  return (
    <div>
      <Cabecera titulo="Mis clases" />
      <Segmentos activo={1} />
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)', borderRadius: 22, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', opacity: .85 }}>TU CLASE FIJA</span>
            <span style={{ fontSize: 12, fontWeight: 800, background: 'rgba(255,255,255,.16)', borderRadius: 999, padding: '4px 10px' }}>✓ Sin fecha de fin</span>
          </div>
          <p style={{ fontSize: 30, fontWeight: 800, margin: '10px 0 0', lineHeight: 1.05 }}>Miércoles 10:00</p>
          <p style={{ fontSize: 16, margin: '6px 0 0', opacity: .9 }}>Reformer · Sala 1 · con Ana</p>
          <p style={{ fontSize: 14, margin: '10px 0 0', opacity: .8 }}>Se reserva sola cada semana. Tú solo avisa si un día no vas.</p>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p style={label}>Próximas semanas</p>
            <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Toca un día si no vas</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {semanas.map(([d, n, e]) => (
              <span key={n} style={{ flex: 1, borderRadius: 16, padding: '10px 0 8px', textAlign: 'center', border: `1.5px solid ${e === 'va' ? 'var(--accent)' : 'var(--border)'}`, background: e === 'va' ? 'var(--accent-soft)' : 'var(--muted)', color: e === 'va' ? 'var(--accent-soft-foreground)' : 'var(--muted-foreground)' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>{d}</span>
                <span style={{ display: 'block', fontSize: 22, fontWeight: 800, textDecoration: e === 'no' ? 'line-through' : 'none' }}>{n}</span>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 800 }}>{e === 'va' ? '✓ Vas' : 'No vas'}</span>
              </span>
            ))}
          </div>
          <div style={{ marginTop: 12, background: 'var(--muted)', borderRadius: 14, padding: '10px 12px', fontSize: 14, lineHeight: 1.4 }}>
            <b>Mié 15: no vas.</b> Avisaste a tiempo: tienes <b>1 clase por recuperar</b> hasta el 15 nov. <span style={{ color: 'var(--accent)', fontWeight: 800 }}>Deshacer</span>
          </div>
        </div>

        <div style={{ ...card, padding: '4px 16px' }}>
          <div style={{ ...fila, borderTop: 'none' }}>
            <Circ n="plaza" />
            <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 16 }}>1 clase por recuperar</b><span style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>Caduca el 15 nov</span></span>
            <span className="btn btn--secondary btn--sm">Elegir clase</span>
          </div>
          <div style={fila}>
            <Circ n="reloj" tono="var(--foreground)" fondo="var(--muted)" />
            <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 16 }}>Pausar unas semanas</b><span style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>Vacaciones, lesión… tu estudio la confirma</span></span>
            <Icono nombre="chevron-derecha" tamano={18} />
          </div>
          <div style={fila}>
            <Circ n="calendario" tono="var(--foreground)" fondo="var(--muted)" />
            <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 16 }}>Ver el mes entero</b><span style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>Octubre: 4 clases, 1 que no vas</span></span>
            <Icono nombre="chevron-derecha" tamano={18} />
          </div>
          <div style={fila}>
            <Circ n="cerrar" tono="var(--destructive)" fondo="var(--muted)" />
            <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: 'var(--destructive)' }}>Dejar mi clase fija</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FijaVacia() {
  return (
    <div>
      <Cabecera titulo="Mis clases" />
      <Segmentos activo={1} />
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...card, textAlign: 'center', padding: 22 }}>
          <span style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icono nombre="calendario" tamano={30} /></span>
          <p style={{ fontSize: 21, fontWeight: 800, margin: '12px 0 6px' }}>Tu hueco, cada semana</p>
          <p style={{ fontSize: 15, margin: 0, color: 'var(--muted-foreground)', lineHeight: 1.45 }}>Con una clase fija tu plaza se reserva sola. Sin estar pendiente de que se llene.</p>
        </div>
        <p style={label}>Así se pide</p>
        {[['1', 'Abre la clase a la que vas siempre'], ['2', 'Activa «Clase fija» y elige hasta cuándo'], ['3', 'Tu estudio la confirma y ya está']].map(([n, t]) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 30, height: 30, borderRadius: 99, background: 'var(--foreground)', color: 'var(--background)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
            <span style={{ fontSize: 16 }}>{t}</span>
          </div>
        ))}
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 16 }}>Clase fija</b><span style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>Miércoles a las 10:00, cada semana</span></span>
          <span style={{ width: 51, height: 31, borderRadius: 99, background: 'var(--accent)', position: 'relative' }}><span style={{ position: 'absolute', right: 2, top: 2, width: 27, height: 27, borderRadius: 99, background: '#fff' }} /></span>
        </div>
        <span className="btn btn--primary btn--full">Ver el horario</span>
      </div>
    </div>
  );
}

// ─── BONOS ───────────────────────────────────────────────────────────────────

function Anillo({ quedan, de }: { quedan: number; de: number }) {
  const r = 46, c = 2 * Math.PI * r;
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden>
      <circle cx="56" cy="56" r={r} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="10" />
      <circle cx="56" cy="56" r={r} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(quedan / de) * c} ${c}`} transform="rotate(-90 56 56)" />
      <text x="56" y="58" textAnchor="middle" fontSize="34" fontWeight="800" fill="currentColor">{quedan}</text>
      <text x="56" y="78" textAnchor="middle" fontSize="12" fill="currentColor" opacity=".8">de {de}</text>
    </svg>
  );
}

function BonosNuevo() {
  return (
    <div>
      <Cabecera titulo="Bonos" sub="Lo que tienes y lo que te queda" accion="Pagos" />
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)', borderRadius: 22, padding: 18 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Anillo quedan={3} de={8} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', opacity: .85, margin: 0 }}>BONO 8 SESIONES</p>
              <p style={{ fontSize: 22, fontWeight: 800, margin: '6px 0 0', lineHeight: 1.1 }}>Te quedan 3</p>
              <p style={{ fontSize: 14, margin: '6px 0 0', opacity: .9 }}>1 ya reservada (mié 8)<br />2 para reservar</p>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.18)', fontSize: 14 }}>
            <span>Caduca el <b>31 oct</b> · en 26 días</span><span style={{ opacity: .85 }}>12 € por clase</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {['Reformer', 'Mat', 'Barre'].map((t) => <span key={t} style={{ fontSize: 12, fontWeight: 800, background: 'rgba(255,255,255,.14)', borderRadius: 999, padding: '4px 10px' }}>Sirve para {t}</span>)}
          </div>
        </div>

        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, borderColor: 'var(--accent)' }}>
          <Circ n="alerta" />
          <span style={{ flex: 1, fontSize: 15, lineHeight: 1.35 }}><b>Te quedan pocas.</b> Renueva y no pierdas tu ritmo de 2 por semana.</span>
          <span className="btn btn--primary btn--sm">Renovar</span>
        </div>

        <div style={{ ...card, padding: '14px 16px 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><p style={label}>Movimientos</p><span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>Ver todo</span></div>
          {[
            ['−1', 'Reformer · mié 8 oct', 'Reservada', 'var(--foreground)'],
            ['+1', 'Barre · lun 6 oct', 'Devuelta: cancelaste a tiempo', 'var(--accent)'],
            ['−1', 'Mat · jue 2 oct', 'Fuiste', 'var(--foreground)'],
            ['+8', 'Bono 8 sesiones', 'Comprado el 1 oct · 96 €', 'var(--accent)'],
          ].map(([n, t, d, c], i) => (
            <div key={i} style={{ ...fila, borderTop: i === 0 ? 'none' : fila.borderTop, padding: '11px 0' }}>
              <span style={{ width: 40, textAlign: 'center', fontSize: 17, fontWeight: 800, color: c }}>{n}</span>
              <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 15 }}>{t}</b><span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>{d}</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CuotaNueva() {
  return (
    <div>
      <Cabecera titulo="Bonos" sub="Lo que tienes y lo que te queda" accion="Pagos" />
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={label}>Tu cuota</p><span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)' }}>Al día</span>
          </div>
          <p style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0' }}>Mensual · 2 días por semana</p>
          <p style={{ fontSize: 15, margin: '4px 0 0', color: 'var(--muted-foreground)' }}>69 € · se renueva sola el 1 nov</p>
          <p style={{ ...label, marginTop: 16 }}>Esta semana</p>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {[1, 1, 0].map((u, i) => i < 2 && <span key={i} style={{ flex: 1, height: 10, borderRadius: 9, background: u ? 'var(--accent)' : 'var(--muted)' }} />)}
          </div>
          <p style={{ fontSize: 14, margin: '8px 0 0' }}><b>2 de 2 usadas</b> · el lunes vuelves a tener 2</p>
        </div>
        <div style={{ ...card, padding: '4px 16px' }}>
          <div style={{ ...fila, borderTop: 'none' }}><Circ n="plaza" /><span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 16 }}>1 clase por recuperar</b><span style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>Caduca el 15 nov · no cuenta en las 2</span></span><Icono nombre="chevron-derecha" tamano={18} /></div>
          <div style={fila}><Circ n="calendario" tono="var(--foreground)" fondo="var(--muted)" /><span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 16 }}>Tu clase fija</b><span style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>Miércoles 10:00 · la paga tu cuota</span></span><Icono nombre="chevron-derecha" tamano={18} /></div>
          <div style={fila}><Circ n="bono" tono="var(--foreground)" fondo="var(--muted)" /><span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 16 }}>Recibos y facturas</b><span style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>Último: 1 oct · 69 € · pagado</span></span><Icono nombre="chevron-derecha" tamano={18} /></div>
        </div>
        <p style={label}>Si quieres más</p>
        <div style={{ display: 'flex', gap: 10, overflow: 'hidden' }}>
          {[['Clase suelta', '15 €', 'Para un día extra'], ['Bono 5 sesiones', '65 €', '13 € por clase']].map(([t, p, d]) => (
            <div key={t} style={{ ...card, minWidth: 190 }}><b style={{ fontSize: 16 }}>{t}</b><p style={{ fontSize: 13, margin: '2px 0 10px', color: 'var(--muted-foreground)' }}>{d}</p><span className="btn btn--secondary btn--sm" style={{ width: '100%' }}>Comprar · {p}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AVISOS ──────────────────────────────────────────────────────────────────

function Aviso({ icono, tono, titulo, texto, hora, nuevo, accion, accion2 }: { icono: NombreIcono; tono?: string; titulo: string; texto: string; hora: string; nuevo?: boolean; accion?: string; accion2?: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: '1px solid var(--border)' }}>
      <Circ n={icono} tono={tono ?? 'var(--foreground)'} fondo={tono ? 'var(--accent-soft)' : 'var(--muted)'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <b style={{ flex: 1, fontSize: 16, fontWeight: nuevo ? 800 : 700 }}>{titulo}</b>
          <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>{hora}</span>
          {nuevo && <span style={{ width: 8, height: 8, borderRadius: 9, background: 'var(--accent)' }} />}
        </div>
        <p style={{ fontSize: 15, margin: '2px 0 0', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>{texto}</p>
        {accion && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <span className="btn btn--primary btn--sm">{accion}</span>
            {accion2 && <span className="btn btn--secondary btn--sm">{accion2}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function AvisosNuevo() {
  return (
    <div>
      <Cabecera titulo="Avisos" sub="2 sin leer" accion="Marcar leídas" />
      <div style={{ display: 'flex', gap: 8, padding: '12px 20px 0' }}>
        {['Todo', 'Reservas', 'Pagos', 'Del estudio'].map((t, i) => <span key={t} style={{ whiteSpace: 'nowrap', padding: '7px 12px', borderRadius: 999, fontSize: 14, fontWeight: 800, background: i === 0 ? 'var(--foreground)' : 'var(--card)', color: i === 0 ? 'var(--background)' : 'var(--foreground)', border: '1px solid var(--border)' }}>{t}</span>)}
      </div>
      <div style={{ padding: '6px 20px' }}>
        <p style={{ ...label, margin: '14px 0 0' }}>Hoy</p>
        <Aviso icono="plaza" tono="var(--accent)" nuevo titulo="Hay sitio para ti" texto="Barre · jue 9 a las 19:00. Te guardamos la plaza 24 min más." hora="18:12" accion="Aceptar la plaza" accion2="No, gracias" />
        <Aviso icono="hecho" tono="var(--accent)" nuevo titulo="Reserva confirmada" texto="Reformer · mié 8 a las 10:00 con Ana. Sala 1, plaza 4." hora="09:40" accion="Añadir al calendario" />
        <p style={{ ...label, margin: '18px 0 0' }}>Ayer</p>
        <Aviso icono="bono" titulo="Te quedan 3 sesiones" texto="Tu Bono 8 sesiones caduca el 31 oct." hora="20:05" accion="Renovar" />
        <Aviso icono="reloj" titulo="Mañana: Mat suelo a las 9:00" texto="Con Marta, Sala 2." hora="19:00" />
        <Aviso icono="instructoras" titulo="Cambio de profesora" texto="Pilates suave del vie 10 la da Laura (Marta está de baja)." hora="11:20" />
      </div>
    </div>
  );
}

function PushBloqueo() {
  return (
    <div style={{ height: '100%', background: 'linear-gradient(160deg,#3b4a3f,#151a16)', color: '#fff', padding: '70px 14px 0' }}>
      <p style={{ fontSize: 64, fontWeight: 200, textAlign: 'center', margin: 0 }}>18:12</p>
      <p style={{ textAlign: 'center', margin: '-8px 0 22px', opacity: .8 }}>Domingo, 5 de octubre</p>
      <div style={{ background: 'rgba(245,245,240,.92)', color: '#111', borderRadius: 20, padding: 12 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 9, background: '#2B3A2E', color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A</span>
          <span style={{ flex: 1 }}><b style={{ fontSize: 14 }}>Alba Pilates</b> <span style={{ fontSize: 12, color: '#666', float: 'right' }}>ahora</span>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>Hay sitio para ti en Barre</span>
            <span style={{ display: 'block', fontSize: 14 }}>Jue 9 a las 19:00. Te la guardamos 30 min.</span></span>
        </div>
      </div>
      <div style={{ marginTop: 6, background: 'rgba(245,245,240,.92)', color: '#111', borderRadius: 14, overflow: 'hidden' }}>
        {['Aceptar la plaza', 'No, gracias'].map((t, i) => <div key={t} style={{ padding: '12px 14px', fontSize: 15, borderTop: i ? '1px solid #ddd' : 'none', fontWeight: i ? 400 : 700 }}>{t}</div>)}
      </div>
      <p style={{ textAlign: 'center', fontSize: 13, opacity: .8, marginTop: 14 }}>Mantén pulsado el aviso: aceptas sin abrir la app</p>
    </div>
  );
}

// ─── PÁGINA ──────────────────────────────────────────────────────────────────

const DECISIONES: [string, string, string][] = [
  ['A', 'Clase fija: tu clase arriba, en el color del estudio', 'Día y hora en grande, clase, sala y profesora, y hasta cuándo («Sin fecha de fin» o «Hasta el 31 dic»). Debajo, las 5 próximas semanas: un toque en un día = «no voy», con lo que pasa (recuperación sí o no, según la política) y «Deshacer». Pausar, ver el mes entero y dejarla quedan como filas claras, no como botones sueltos. Lo que Momence no tiene: pantalla de gestión de la serie.'],
  ['B', 'Clase fija sin tener ninguna: se explica y se enseña cómo pedirla', 'Hoy pone «Aún no tienes clase fija». Propuesta: qué es en una frase, los 3 pasos y el interruptor tal como se verá en la ficha, con «Ver el horario». También le sirve a la propietaria para entenderlo.'],
  ['C', 'Bonos: saldo legible de un vistazo', 'Anillo con «Te quedan 3 de 8», cuántas están ya reservadas y cuántas quedan para reservar, cuándo caduca y en cuántos días, precio por clase y para qué clases sirve. Si quedan ≤2 o caduca en ≤7 días, aviso con «Renovar» (pago dentro de la app).'],
  ['D', 'Bonos: movimientos', '−1 al reservar, +1 si se devuelve (y por qué), +8 al comprar. Es la queja de 1★ de Momence («mis créditos desaparecen»). Sale del registro de movimientos que ya tenemos; hace falta una lectura para la alumna, solo de lo suyo.'],
  ['E', 'Cuota: cuánto has usado esta semana', '«2 de 2 usadas · el lunes vuelves a tener 2», cuándo se renueva y cuánto, tu clase fija y recuperaciones, recibos, y «Si quieres más» (clase suelta, bono) en tarjetas con su precio.'],
  ['F', 'Avisos: cada uno con su icono, por días y con acción', 'Hoy / Ayer / Esta semana; filtros Todo · Reservas · Pagos · Del estudio; sin el fondo gris de no leído (punto de color). Los que piden algo traen el botón: «Aceptar la plaza» con lo que queda de tiempo, «Renovar», «Añadir al calendario». Nuevo: «Cambio de profesora».'],
  ['G', 'El aviso del iPhone con botones', 'Mantener pulsado «Hay sitio para ti» → «Aceptar la plaza» sin abrir la app; el recordatorio, «Voy / No puedo ir». Momence lo hace por SMS respondiendo «1». Es una pieza nativa: va en la primera versión que se mande a Apple.'],
];

const DONDE: [string, string][] = [
  ['Fija · «Tu plaza está reservada automáticamente…»', 'Pasa a la frase dentro de la tarjeta de tu clase.'],
  ['Fija · estado «Activa» / «En pausa» / «Sin clase»', 'Arriba a la derecha de la tarjeta, con la fecha de fin.'],
  ['Fija · próximas clases y «No puedo ir»', 'Las 5 semanas: un toque = no voy; «Deshacer».'],
  ['Fija · pausa (pedir, anular, la que tienes)', 'Fila «Pausar unas semanas»; la pausa en curso sale en la tarjeta.'],
  ['Fija · calendario del mes', 'Fila «Ver el mes entero» (mismo calendario).'],
  ['Fija · dejarla', 'Última fila, en rojo, con la misma confirmación.'],
  ['Fija · recuperaciones (y las de recompensa)', 'Fila con «Elegir clase».'],
  ['Bonos · «Pagos»', 'Igual, arriba a la derecha.'],
  ['Bonos · Pagar ahora / Renovar mi plan', 'Aviso «Renovar» y en la tarjeta del bono; recibo pendiente arriba del todo.'],
  ['Bonos · «Reservar una clase» / «Ver bonos y suscripciones»', 'Siguen, debajo de «Si quieres más».'],
  ['Avisos · volver, «Marcar leídas», «N sin leer»', 'Siguen.'],
  ['Avisos · tocar un aviso abre su pantalla', 'Sigue, además del botón.'],
];

export default function Maquetas() {
  return (
    <main style={{ background: '#EEECE6', minHeight: '100vh', padding: 40, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 6px' }}>Clase fija · Bonos · Avisos — rediseño</h1>
      <p style={{ margin: '0 0 28px', color: '#555', maxWidth: 1000 }}>Hoy (capturas reales de la app) frente a la propuesta. Hecho tras estudiar la app de Momence (4,8★): nos quedamos con lo que elogian (reservar en segundos, botones claros, ver lo que tienes) y resolvemos lo que más critican (créditos que «desaparecen» sin historial, avisos pobres, la lista de espera por SMS, la serie sin pantalla para gestionarla).</p>

      <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>Clase fija</h2>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 34 }}>
        <Movil titulo="Hoy" nota="Aviso gris, botones sueltos, «Próximas clases» sin fechas y un calendario que no se entiende." img={`${HOY}/mis-clases-fija.png`} />
        <Movil titulo="Propuesta" nota="Tu clase arriba; un toque en un día = no voy."><FijaNueva /></Movil>
        <Movil titulo="Propuesta · sin clase fija" nota="Qué es y cómo pedirla, en vez de «Aún no tienes»."><FijaVacia /></Movil>
      </div>

      <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>Bonos</h2>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 34 }}>
        <Movil titulo="Hoy" nota="El saldo y poco más." img={`${HOY}/bonos.png`} />
        <Movil titulo="Propuesta · con bono" nota="Te quedan, reservadas, caducidad, para qué sirve y movimientos."><BonosNuevo /></Movil>
        <Movil titulo="Propuesta · con cuota" nota="Cuánto llevas esta semana y qué más tienes."><CuotaNueva /></Movil>
      </div>

      <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>Avisos</h2>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Movil titulo="Hoy" nota="El mismo megáfono para todo; sin acción." img={`${HOY}/avisos.png`} />
        <Movil titulo="Propuesta" nota="Por días, con su icono y su botón."><AvisosNuevo /></Movil>
        <Movil titulo="Propuesta · en el iPhone" nota="Aceptar la plaza sin abrir la app."><PushBloqueo /></Movil>
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
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>Dónde queda cada cosa de hoy · no se quita nada</h2>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
            <tbody>
              {DONDE.map(([a, b]) => (
                <tr key={a} style={{ borderTop: '1px solid #eee' }}><td style={{ padding: '9px 10px 9px 0', fontWeight: 700, verticalAlign: 'top', width: '48%' }}>{a}</td><td style={{ padding: '9px 0', color: '#444' }}>{b}</td></tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ margin: '22px 0 8px', fontSize: 16 }}>Lo que cuesta</h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#444', fontSize: 14, lineHeight: 1.6 }}>
            <li>A, B, C, E, F: solo pantallas, con los datos que ya hay.</li>
            <li>D (movimientos): una lectura nueva del registro de movimientos, solo de la alumna.</li>
            <li>F «Cambio de profesora»: un aviso nuevo cuando el estudio cambia la profesora de una clase con reservas.</li>
            <li>G (botones en el aviso del iPhone): pieza nativa → conviene antes del primer envío a Apple.</li>
            <li>Los textos de «no voy» dicen lo que de verdad pasa con la política del estudio (recuperación sí o no).</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
