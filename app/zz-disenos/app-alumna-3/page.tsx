'use client';

// TEMPORAL — maquetas tras comparar la app de marca de un estudio en Momence. No se commitea.
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

const card: CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 20, padding: 16 };
const label: CSSProperties = { fontSize: 12, letterSpacing: '.1em', fontWeight: 800, color: 'var(--muted-foreground)', margin: 0, textTransform: 'uppercase' };
const meta: CSSProperties = { fontSize: 14, color: 'var(--muted-foreground)', margin: 0 };

function Fila({ icono, children, sub, derecha }: { icono: NombreIcono; children: ReactNode; sub?: ReactNode; derecha?: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '11px 0' }}>
      <span style={{ color: 'var(--accent)', marginTop: 2 }}><Icono nombre={icono} tamano={20} /></span>
      <span style={{ flex: 1, fontSize: 16, lineHeight: 1.35 }}>{children}{sub && <span style={{ display: 'block', marginTop: 2, fontSize: 14, color: 'var(--accent)', fontWeight: 800 }}>{sub}</span>}</span>
      {derecha}
    </div>
  );
}

function Pestanas({ activa }: { activa: number }) {
  const t: [NombreIcono, string][] = [['inicio', 'Inicio'], ['reservar', 'Reservar'], ['mis-clases', 'Mis clases'], ['bono', 'Bonos'], ['perfil', 'Perfil']];
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 84, background: 'var(--card)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', paddingTop: 10, zIndex: 5 }}>
      {t.map(([n, l], i) => (
        <span key={l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: i === activa ? 800 : 600, color: i === activa ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
          <Icono nombre={n} tamano={22} />{l}
        </span>
      ))}
    </div>
  );
}

function Circulo({ n, style }: { n: NombreIcono; style?: CSSProperties }) {
  return <span style={{ width: 38, height: 38, borderRadius: 99, background: 'rgba(0,0,0,.35)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}><Icono nombre={n} tamano={18} /></span>;
}

// ─── FICHA ───────────────────────────────────────────────────────────────────
function FichaNueva({ conBono }: { conBono?: boolean }) {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ height: 290, background: `url(${FOTO}) center/cover`, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 80, background: 'linear-gradient(180deg,rgba(0,0,0,.35),transparent)' }} />
        <Circulo n="chevron-izquierda" style={{ position: 'absolute', top: 48, left: 16 }} />
        <div style={{ position: 'absolute', top: 48, right: 16, display: 'flex', gap: 10 }}><Circulo n="favorito" /><Circulo n="enviar" /></div>
      </div>
      <div style={{ padding: '18px 20px 120px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={label}>Reformer · todos los niveles</p>
        <p style={{ fontSize: 30, fontWeight: 800, margin: 0, lineHeight: 1.05, letterSpacing: '-.02em' }}>Reformer Flow</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)', fontSize: 13, padding: '5px 10px' }}>Quedan 3 de 10</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{conBono ? 'Con tu bono · 1 sesión' : 'Desde 16 €'}</span>
        </div>
        {conBono ? (
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
            <span style={{ color: 'var(--accent)' }}><Icono nombre="bono" tamano={22} /></span>
            <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 16 }}>Bono 10 clases</b><span style={meta}>Te quedan 3 · caduca el 12 nov</span></span>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>Ver ›</span>
          </div>
        ) : (
          <div style={{ ...card, padding: '12px 16px' }}>
            <p style={{ ...label, marginBottom: 6 }}>Cómo venir a esta clase</p>
            {[['Tu primera clase', '16 €', 'Solo la primera vez', true], ['Clase suelta', '20 €', '', false], ['Bono 6 clases', '89 €', '14,83 €/clase', false]].map(([n, p, d, dest]) => (
              <div key={n as string} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', margin: '6px -4px', borderRadius: 14, border: `1.5px solid ${dest ? 'var(--accent)' : 'var(--border)'}` }}>
                <span style={{ flex: 1 }}><b style={{ fontSize: 15 }}>{n}</b>{d && <span style={{ display: 'block', fontSize: 13, color: 'var(--muted-foreground)' }}>{d}</span>}</span>
                <b style={{ fontSize: 16 }}>{p}</b>
              </div>
            ))}
            <p style={{ ...meta, fontWeight: 800, color: 'var(--accent)', marginTop: 4 }}>Ver las 5 opciones ›</p>
          </div>
        )}
        <div style={{ ...card, padding: '4px 16px' }}>
          <Fila icono="calendario">Lunes 6 de octubre<br /><span style={meta}>7:00 – 8:00 · 60 min</span></Fila>
          <Fila icono="plaza" sub="Cómo llegar ›">Estudio Aura · Sala Sol<br /><span style={meta}>C/ Ejemplo 12, Barcelona</span></Fila>
          <Fila icono="reloj">Cancelación gratis hasta 12 h antes</Fila>
        </div>
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
          <span style={{ width: 44, height: 44, borderRadius: 99, background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>LM</span>
          <span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 16 }}>Lucía</b><span style={meta}>★ 4,9 · Reformer y Mat</span></span>
          <Icono nombre="chevron-derecha" tamano={18} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 20px 30px', background: 'var(--background)', borderTop: '1px solid var(--border)', zIndex: 6 }}>
        <span className="btn btn--primary btn--full">{conBono ? 'Reservar · con tu bono' : 'Reservar · desde 16 €'}</span>
      </div>
    </div>
  );
}

// ─── HOJA DE RESERVA Y PAGO ──────────────────────────────────────────────────
function HojaReserva() {
  return (
    <div style={{ position: 'relative', height: '100%', background: 'rgba(0,0,0,.4)' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 46, background: 'var(--background)', borderRadius: '22px 22px 0 0', padding: '10px 18px 0', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ width: 50 }} /><b style={{ fontSize: 17 }}>Reservar</b><span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>Cerrar</span>
        </div>
        <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', padding: 12 }}>
          <span style={{ width: 56, height: 56, borderRadius: 12, background: `url(${FOTO}) center/cover`, flex: 'none' }} />
          <span style={{ flex: 1 }}><b style={{ fontSize: 16, display: 'block' }}>Reformer Flow</b><span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Lun 6 oct · 7:00 · Sala Sol · con Lucía</span></span>
          <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)' }}>Quedan 3</span>
        </div>
        <div style={{ ...card, padding: '10px 14px' }}>
          <p style={{ ...label, marginBottom: 4 }}>Cómo vienes</p>
          {[['Tu primera clase', '16 €', 'Solo la primera vez', true], ['Clase suelta', '20 €', '', false], ['Bono 6 clases', '89 €', '14,83 €/clase · ahorras un 26 %', false]].map(([n, p, d, sel]) => (
            <div key={n as string} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: n === 'Tu primera clase' ? 'none' : '1px solid var(--border)' }}>
              <span style={{ width: 20, height: 20, borderRadius: 99, border: `2px solid ${sel ? 'var(--accent)' : 'var(--border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{sel && <span style={{ width: 10, height: 10, borderRadius: 99, background: 'var(--accent)' }} />}</span>
              <span style={{ flex: 1 }}><b style={{ fontSize: 15 }}>{n}</b>{d && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted-foreground)' }}>{d}</span>}</span>
              <b>{p}</b>
            </div>
          ))}
        </div>
        <div style={{ ...card, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 800 }}>¿Tienes un código? ›</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>Tu primera clase</span><span>16,00 €</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, borderTop: '1px solid var(--border)', paddingTop: 6 }}><span>Total</span><span>16,00 €</span></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ flex: 1, background: '#000', color: '#fff', borderRadius: 12, padding: '12px 0', textAlign: 'center', fontWeight: 700 }}> Pay</span>
          <span style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 12, padding: '12px 0', textAlign: 'center', fontWeight: 700, background: 'var(--card)' }}>Tarjeta</span>
        </div>
        <p style={{ ...meta, fontSize: 13 }}>Cancelación gratis hasta 12 h antes. Después pierdes la clase y no se devuelve el dinero.</p>
        <span className="btn btn--primary btn--full">Pagar 16 € y reservar</span>
      </div>
    </div>
  );
}

function HojaEstados() {
  const E = ({ t, d, tono }: { t: string; d: string; tono?: 'ok' | 'aviso' }) => (
    <div style={{ ...card, borderColor: tono === 'ok' ? 'var(--accent)' : tono === 'aviso' ? '#C9A227' : 'var(--border)' }}>
      <b style={{ fontSize: 16 }}>{t}</b><p style={{ ...meta, marginTop: 4, lineHeight: 1.4 }}>{d}</p>
    </div>
  );
  return (
    <div style={{ padding: '52px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={label}>Lo que dice la hoja, paso a paso</p>
      <E t="Comprobando la plaza…" d="Antes de cobrar. Si se ha llenado: «Se acaba de llenar. ¿Te apunto a la lista de espera? Es gratis.»" />
      <E t="Pago hecho. Confirmando tu plaza…" d="Sin ✓ todavía. «No cierres la app.»" />
      <E tono="ok" t="Reservada ✓ · Lun 6 · 7:00" d="[Añadir al calendario] [Ver mi reserva]" />
      <E tono="aviso" t="Se llenó mientras pagabas" d="«Has pagado, pero la clase se ha llenado. Tienes 1 clase a tu favor y eres la 1.ª en la lista de espera. El estudio ya lo sabe.»" />
      <E t="Pago rechazado" d="El motivo del banco y «Prueba con otra tarjeta». La plaza no se ha tocado." />
    </div>
  );
}

// ─── HORARIO ─────────────────────────────────────────────────────────────────
function HorarioNuevo() {
  const dias = [['HOY', '6', true, true], ['MAR', '7', false, false], ['MIÉ', '8', false, true], ['JUE', '9', false, false], ['VIE', '10', false, false], ['SÁB', '11', false, false]] as const;
  const clases: [string, string, string, string, string, boolean][] = [
    ['07:00 · 60 min', 'Reformer Flow', 'Lucía · Sala Sol', 'Quedan 3', 'Bono', true],
    ['09:30 · 50 min', 'Mat suelo', 'Marta · Sala Luna', 'Quedan 8', 'Bono', true],
    ['18:30 · 60 min', 'Barre Burn', 'Laura · Sala Sol', 'Completa', 'Lista de espera', false],
    ['20:00 · 50 min', 'Reformer Stretch', 'Ana · Sala Sol', 'Quedan 1', 'Bono', true],
  ];
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ padding: '50px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Horario</p><span className="btn btn--secondary btn--sm">Calendario</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {dias.map(([d, n, sel, mia]) => (
            <span key={n} style={{ flex: 1, textAlign: 'center', padding: '7px 0 5px', borderRadius: 14, background: sel ? 'var(--accent-soft)' : 'transparent', color: sel ? 'var(--accent-soft-foreground)' : 'var(--foreground)' }}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 800 }}>{d}</span><span style={{ display: 'block', fontSize: 19, fontWeight: 800 }}>{n}</span>
              <span style={{ display: 'block', height: 5 }}>{mia && <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: 9, background: 'var(--accent)' }} />}</span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {['Todas', 'Mañana', 'Tarde', 'Sala ▾', 'Con hueco'].map((t, i) => <span key={t} style={{ padding: '6px 11px', borderRadius: 999, fontSize: 13, fontWeight: 800, border: '1px solid var(--border)', background: i === 0 ? 'var(--foreground)' : 'var(--card)', color: i === 0 ? 'var(--background)' : 'var(--foreground)', whiteSpace: 'nowrap' }}>{t}</span>)}
        </div>
        <p style={{ ...label, margin: '14px 0 8px' }}>4 clases · lunes 6 · ya terminadas (2) ▾</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {clases.map(([h, n, q, b, p, reservable], i) => (
            <div key={n} style={{ ...card, padding: 10, display: 'flex', gap: 10, alignItems: 'center', borderColor: i === 0 ? 'var(--accent)' : 'var(--border)' }}>
              <span style={{ width: 56, height: 56, borderRadius: 12, background: `url(${FOTO}) ${i * 20}% center/cover`, flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--muted-foreground)' }}>{h}</span>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 800 }}>{n}</span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--muted-foreground)' }}>{q}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: b === 'Completa' ? 'var(--muted-foreground)' : 'var(--accent)' }}>{b}</span>
                {i === 0 ? <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>Reservada ✓</span>
                  : reservable ? <span style={{ fontSize: 13, fontWeight: 800, padding: '6px 12px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)' }}>Reservar</span>
                    : <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{p}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
      <Pestanas activa={1} />
    </div>
  );
}

// ─── TIENDA ──────────────────────────────────────────────────────────────────
function TiendaNueva() {
  const P = ({ n, p, x, v, para, b }: { n: string; p: string; x?: string; v: string; para: string; b: string }) => (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <b style={{ fontSize: 18 }}>{n}</b>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 26, fontWeight: 800 }}>{p}</span>{x && <span style={meta}>{x}</span>}</div>
      <span style={{ fontSize: 14 }}>{v}</span>
      <span style={meta}>{para}</span>
      <span className="btn btn--secondary btn--full" style={{ marginTop: 8 }}>{b}</span>
    </div>
  );
  return (
    <div style={{ padding: '50px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Comprar</p>
      <div style={{ ...card, borderColor: 'var(--accent)', borderWidth: 1.5 }}>
        <p style={{ ...label, color: 'var(--accent)' }}>Solo la primera vez</p>
        <b style={{ fontSize: 20, display: 'block', marginTop: 4 }}>Tu primera clase · 16 €</b>
        <p style={{ ...meta, marginTop: 4 }}>Una clase, la que elijas. Te la guardamos al pagar.</p>
        <span className="btn btn--primary btn--full" style={{ marginTop: 10 }}>Elegir mi clase</span>
      </div>
      <P n="Bono 10 clases" p="136 €" x="13,60 €/clase · ahorras un 32 %" v="Vale 150 días: si lo compras hoy, hasta el 3 de marzo" para="Para todas las clases" b="Comprar · 136 €" />
      <P n="Cuota mensual 2 días" p="69 €/mes" x="8,63 €/clase" v="Se renueva cada mes; la cancelas cuando quieras" para="Para Reformer y Mat" b="Contratar · 69 €/mes" />
    </div>
  );
}

// ─── INICIO RECIÉN LLEGADA ───────────────────────────────────────────────────
function InicioNueva() {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ height: 210, background: `linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,.55)), url(${FOTO}) center/cover`, color: '#fff', padding: '0 20px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <p style={{ fontSize: 12, letterSpacing: '.1em', fontWeight: 800, margin: 0, opacity: .9 }}>ESTUDIO AURA · LUNES 6</p>
        <p style={{ fontSize: 28, fontWeight: 800, margin: '4px 0 0' }}>Bienvenida, Lucía</p>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...card, padding: 18 }}>
          <p style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Tu primera clase</p>
          <p style={{ ...meta, margin: '6px 0 12px', fontSize: 15 }}>Esta semana hay <b style={{ color: 'var(--foreground)' }}>23 clases con plaza</b>. Elige una y te la guardamos.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, border: '1.5px solid var(--accent)', marginBottom: 12 }}>
            <span style={{ flex: 1 }}><b>Primera clase</b><span style={{ display: 'block', fontSize: 13, color: 'var(--muted-foreground)' }}>Solo la primera vez</span></span><b style={{ fontSize: 18 }}>16 €</b>
          </div>
          <span className="btn btn--primary btn--full">Elegir mi primera clase</span>
          <p style={{ ...meta, textAlign: 'center', marginTop: 10, fontWeight: 800, color: 'var(--accent)' }}>Ver precios</p>
        </div>
        <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'center' }}><Icono nombre="campana" tamano={22} /><span style={{ flex: 1, fontSize: 15 }}>Activa los avisos para saber cuándo se libera una plaza</span><span className="btn btn--secondary btn--sm">Activar</span></div>
      </div>
      <Pestanas activa={0} />
    </div>
  );
}

// ─── PERFIL ──────────────────────────────────────────────────────────────────
function PerfilNuevo() {
  const G = ({ t, filas }: { t: string; filas: [NombreIcono, string, string?][] }) => (
    <>
      <p style={{ ...label, margin: '14px 0 6px' }}>{t}</p>
      <div style={{ ...card, padding: '0 14px' }}>
        {filas.map(([i, n, v], k) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: k ? '1px solid var(--border)' : 'none' }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--muted)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icono nombre={i} tamano={18} /></span>
            <span style={{ flex: 1, fontSize: 16 }}>{n}</span>{v && <span style={meta}>{v}</span>}<Icono nombre="chevron-derecha" tamano={16} />
          </div>
        ))}
      </div>
    </>
  );
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ padding: '50px 20px 100px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 64, height: 64, borderRadius: 99, background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>LP</span>
          <span><b style={{ fontSize: 22, display: 'block' }}>Lucía Pérez</b><span style={meta}>Alumna de Estudio Aura desde marzo</span></span>
        </div>
        <div style={{ ...card, marginTop: 14, display: 'flex', padding: '12px 4px' }}>
          {[['14', 'clases contigo'], ['3', 'te quedan · hasta 12 nov'], ['1', 'recuperación']].map(([n, t], i) => (
            <span key={t} style={{ flex: 1, textAlign: 'center', borderLeft: i ? '1px solid var(--border)' : 'none', padding: '0 6px' }}><b style={{ fontSize: 24, display: 'block' }}>{n}</b><span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{t}</span></span>
          ))}
        </div>
        <div style={{ marginTop: 12, background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)', borderRadius: 18, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 8, border: '2px dashed rgba(255,255,255,.5)' }} /><span style={{ flex: 1 }}><b>QR de acceso</b><span style={{ display: 'block', fontSize: 13, opacity: .85 }}>Enséñalo al llegar</span></span>
        </div>
        <G t="Cuenta" filas={[['perfil', 'Datos personales'], ['editar', 'Preferencias'], ['alerta', 'Seguridad']]} />
        <G t="Bonos y pagos" filas={[['bono', 'Comprar bonos y cuotas'], ['calendario', 'Pagos y recibos'], ['bono', 'Método de pago', 'Visa ··42']]} />
      </div>
      <Pestanas activa={4} />
    </div>
  );
}

// ─── ENTRADA AL ESTUDIO ──────────────────────────────────────────────────────
function EntradaCodigo() {
  return (
    <div style={{ height: '100%' }}>
      <div style={{ height: 200, background: `linear-gradient(180deg,rgba(0,0,0,.2),rgba(0,0,0,.6)), url(${FOTO}) center/cover`, color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 20 }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', color: '#2B3A2E', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A</span>
        <b style={{ fontSize: 22, marginTop: 8 }}>Estudio Aura</b><span style={{ fontSize: 13, opacity: .85 }}>Barcelona</span>
      </div>
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>‹ Cambiar correo</span>
        <p style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Mira tu correo</p>
        <p style={{ ...meta, fontSize: 15, lineHeight: 1.45 }}>Te hemos mandado un código a l•••@•••.com. Caduca en 10 minutos. Mira también en spam.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          {['4', '8', '2', '', '', ''].map((c, i) => <span key={i} style={{ width: 44, height: 54, borderRadius: 12, border: `1.5px solid ${i === 3 ? 'var(--accent)' : 'var(--border-strong)'}`, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800 }}>{c}</span>)}
        </div>
        <p style={{ ...meta, textAlign: 'center' }}>iOS lo rellena desde Mail · No me ha llegado · reenviar en 0:42</p>
        <p style={{ ...meta, textAlign: 'center', fontWeight: 800 }}>Usar mi contraseña</p>
      </div>
    </div>
  );
}

const DECISIONES: [string, string, string][] = [
  ['1', 'Ficha de clase: la foto respira y dice cómo vienes', 'Foto grande sin el título encima, título debajo; fila de plazas en vivo; «Cómo vienes» con TUS datos (tu bono con lo que te queda, o solo las opciones que cubren ESA clase con su precio por clase); filas con icono (cuándo, dónde + «Cómo llegar», cancelación); la instructora; compartir como icono sobre la foto. Momence enseña cinco chips cortados sin decir cuál sirve, y no enseña plazas ni cancelación.'],
  ['2', 'Pagar y reservar en la misma hoja', 'Sin bono: eliges cómo vienes (primera clase, suelta o un bono), código si lo tienes, total calculado por el servidor, Apple Pay o tarjeta, y «Pagar 16 € y reservar». Comprueba la plaza antes de cobrar; si se llena mientras pagas, te lo dice y te deja compensada (clase a favor + 1.ª en lista de espera). Hoy acaba en un aviso rojo «compra desde Perfil → Comprar». Es dinero: va por revisión de pagos.'],
  ['3', 'La primera clase, dentro de la app', 'Hoy la clase de prueba solo existe en la web del estudio. Aparece en Inicio, ficha, hoja y tienda solo a quien el servidor considera nueva; a quien ya vino no le sale nada.'],
  ['4', 'Horario: foto de la sala, reservar desde la fila y empezar donde hay clases', 'Miniatura con la foto de la sala o del tipo de clase (solo fotos propias del estudio, nunca la misma por defecto repetida); «Reservar» en la fila si tu bono o cuota la cubre (la misma hoja de la ficha); 14 días con punto en los que tienes reserva; Mañana/Tarde y Sala; si hoy ya no quedan, abre el siguiente día con clases y lo dice; las ya terminadas, plegadas.'],
  ['5', 'Tienda que se lee sin hacer cuentas', '«Tu primera clase» arriba; precio grande y por clase, cuánto ahorras, hasta QUÉ FECHA vale (no «5 meses»), para qué clases, y el importe en el botón.'],
  ['6', 'Inicio de la recién llegada: una tarjeta, ningún cero', 'Hoy ve «No tienes clases próximas», «0 clases», «Sin bono». Propuesta: «Bienvenida, Lucía», cuántas clases con plaza hay de verdad esta semana, su primera clase y «Elegir mi primera clase».'],
  ['7', 'Perfil con tu tarjeta de alumna', 'Arriba tres cifras útiles que llevan a su sitio (clases contigo, lo que te queda, recuperaciones), nunca un cero; QR como hoy; filas estilo Ajustes del iPhone con icono en baldosa.'],
  ['8', 'Entrar en el estudio con código en casillas', 'Como la entrada de la app Tentare: correo → código de 6 cifras en casillas que iOS rellena → dentro. Contraseña como segunda opción. Solo a la nueva se le piden sus datos y la privacidad DEL ESTUDIO.'],
];

const DUDAS: [string, string][] = [
  ['Pagar y reservar (2)', '¿Empezamos ya con «cobrar y luego reservar, con compensación si se llena» (Fase A), o esperamos a «retener la plaza antes de cobrar» (Fase B, más trabajo)? Recomiendo A con la compensación que ves en los estados.'],
  ['Traer a una amiga', 'Momence pide nombre y email de la invitada cada vez (datos de otra persona sin su consentimiento ni su cuestionario de salud). Propongo «Invita a una amiga a ESTA clase»: le llega la ficha de la clase, reserva y paga ella, y tú te llevas el premio de invitar. ¿Te vale, o quieres reservar para otra persona?'],
  ['Primera clase (3)', '¿Solo para quien nunca ha venido (como la web hoy), o también para quien no viene hace mucho?'],
  ['Foto en el horario (4)', 'Solo fotos que suba el estudio (sala o tipo de clase); sin foto, el color y la inicial como hoy. ¿OK?'],
  ['Varias sedes', '¿«Sala ▾» basta, o quieres un horario «Todas las sedes» para cadenas (más grande: si un bono vale en otra sede)?'],
  ['Tarjeta guardada', '¿Activamos «Guárdala para la próxima» para pagar bonos y clases sueltas en un toque?'],
];

export default function Maquetas() {
  const Fila3 = ({ t, children }: { t: string; children: ReactNode }) => (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>{t}</h2>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>{children}</div>
    </section>
  );
  return (
    <main style={{ background: '#EEECE6', minHeight: '100vh', padding: 36, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 6px' }}>Lo mejor de Momence, hecho mejor</h1>
      <p style={{ margin: '0 0 28px', color: '#555', maxWidth: 1100 }}>Cada fila: la app de marca del estudio en Momence (tus capturas), cómo está hoy Tentare y la propuesta. La marca del estudio (su color, sus fotos) manda dentro de su app, como en Momence. Lo que Tentare ya hace mejor (plazas en vivo, lista de espera en la app, clase fija, recuperaciones, QR) se queda.</p>

      <Fila3 t="1 · Ficha de clase">
        <Movil etiqueta="Momence" titulo="Ficha" nota="Foto grande, mapa, profesora. Sin plazas, sin cancelación." img={`${M}/m-01-ficha-clase.png`} />
        <Movil etiqueta="Momence" titulo="…y debajo, sus bonos" nota="Chips cortados: no dice cuál sirve para ESTA clase." img={`${M}/m-02-ficha-membresias.png`} />
        <Movil etiqueta="Tentare hoy" titulo="Ficha sin bono" nota="«Solo con bono» y nada que hacer desde aquí." img={`${M}/ficha-sin-bono.png`} />
        <Movil etiqueta="Propuesta" titulo="Sin bono" nota="Cómo venir, con precio por clase."><FichaNueva /></Movil>
        <Movil etiqueta="Propuesta" titulo="Con bono" nota="Tu bono, lo que te queda y cuándo caduca."><FichaNueva conBono /></Movil>
      </Fila3>

      <Fila3 t="2 · Pagar y reservar en la misma hoja">
        <Movil etiqueta="Momence" titulo="Hoja de reserva" nota="Packs, Apple Pay, código, desglose. Lo mejor de su app." img={`${M}/m-05-hoja-reserva-resumen-packs.png`} />
        <Movil etiqueta="Momence" titulo="…pago" img={`${M}/m-04-hoja-reserva-pago.png`} />
        <Movil etiqueta="Tentare hoy" titulo="Hoja sin bono" nota="Aviso rojo y «compra desde Perfil → Comprar»." img={`${M}/hoja-reserva-sin-bono.png`} />
        <Movil etiqueta="Propuesta" titulo="Una hoja: eliges, pagas, reservada" nota="El servidor calcula el total; plaza comprobada antes de cobrar."><HojaReserva /></Movil>
        <Movil etiqueta="Propuesta" titulo="Qué dice en cada momento" nota="Nunca «reservada» antes de que lo esté."><HojaEstados /></Movil>
      </Fila3>

      <Fila3 t="3 · Horario">
        <Movil etiqueta="Momence" titulo="Clases" nota="Foto de la sala y botón en cada clase. Sin plazas." img={`${M}/m-08-estudio-clases-horario.png`} />
        <Movil etiqueta="Tentare hoy" titulo="Horario" img={`${M}/horario.png`} />
        <Movil etiqueta="Propuesta" titulo="Foto, plazas y «Reservar» en la fila" nota="Punto en tus días; Mañana/Tarde/Sala; terminadas plegadas."><HorarioNuevo /></Movil>
      </Fila3>

      <Fila3 t="4 · Tienda · 5 · Inicio de la recién llegada">
        <Movil etiqueta="Momence" titulo="Suscripciones" nota="«Caduca después de 5 meses», carrusel que esconde productos." img={`${M}/m-09-estudio-suscripciones.png`} />
        <Movil etiqueta="Tentare hoy" titulo="Comprar" img={`${M}/tienda.png`} />
        <Movil etiqueta="Propuesta" titulo="Tienda" nota="Primera clase arriba; fecha real; importe en el botón."><TiendaNueva /></Movil>
        <Movil etiqueta="Momence" titulo="Inicio nueva" nota="Dos cajas grises vacías y un «0»." img={`${M}/m-13-inicio-vacio.png`} />
        <Movil etiqueta="Tentare hoy" titulo="Inicio nueva" img={`${M}/inicio-recien-llegada.png`} />
        <Movil etiqueta="Propuesta" titulo="Bienvenida, con su primera clase"><InicioNueva /></Movil>
      </Fila3>

      <Fila3 t="6 · Perfil · 7 · Entrar en el estudio">
        <Movil etiqueta="Tentare hoy" titulo="Perfil" img={`${M}/perfil.png`} />
        <Movil etiqueta="Propuesta" titulo="Tu tarjeta de alumna" nota="(La captura de Cuenta de Momence no se enseña: lleva un email real.)"><PerfilNuevo /></Movil>
        <Movil etiqueta="Momence" titulo="Arranque" nota="Dos botones: hay que saber si ya tienes cuenta." img={`${M}/m-12-arranque-registro.png`} />
        <Movil etiqueta="Propuesta" titulo="Correo y código en casillas" nota="Una sola puerta; iOS rellena el código."><EntradaCodigo /></Movil>
      </Fila3>

      <section style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 24 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>Decisiones</h2>
          {DECISIONES.map(([n, t, d]) => (
            <div key={n} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <b style={{ width: 22, flex: 'none', color: '#B4537E' }}>{n}</b>
              <div><b style={{ display: 'block' }}>{t}</b><span style={{ color: '#444', fontSize: 14, lineHeight: 1.45 }}>{d}</span></div>
            </div>
          ))}
          <h3 style={{ fontSize: 16, margin: '18px 0 8px' }}>No copiamos</h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#444', fontSize: 14, lineHeight: 1.6 }}>
            <li>Esconder plazas libres y la política de cancelación.</li>
            <li>El mismo «Reservar ahora» para todo (Tentare ya cambia según el estado: lista de espera, se abre a las…, reservada).</li>
            <li>Textos sin traducir, usted y tú mezclados, tres nombres para lo mismo y ceros como datos.</li>
            <li>La doble navegación (Inicio → estudio → Clases) y la pestaña de vídeos (congelada).</li>
            <li>Un mapa embebido (pide clave y cuesta dinero): «Cómo llegar» abre Mapas en un toque.</li>
          </ul>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 24 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>Decisiones tuyas</h2>
          {DUDAS.map(([t, d]) => (
            <div key={t} style={{ marginBottom: 12 }}><b style={{ display: 'block' }}>{t}</b><span style={{ color: '#444', fontSize: 14, lineHeight: 1.45 }}>{d}</span></div>
          ))}
          <h3 style={{ fontSize: 16, margin: '18px 0 8px' }}>Ya arreglado sin esperar</h3>
          <p style={{ color: '#444', fontSize: 14, lineHeight: 1.45, margin: 0 }}>La «Imagen de la sala» del panel no se guardaba nunca (ninguna sala la tenía). Corregido en #2527: es lo que permite poner la foto de la sala en el horario.</p>
        </div>
      </section>
    </main>
  );
}
