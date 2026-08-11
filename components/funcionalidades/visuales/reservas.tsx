import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro, PasoVertical } from './comunes';

// ── Dibujos de /funcionalidades/reservas-online y /funcionalidades/lista-de-espera ──
// Fuente: lib/booking-logic.ts (`heredaOverride`: NULL en el tipo de clase =
// hereda el valor del estudio), las reglas de las fases 1 a 3 y el ciclo de
// oferta de lista de espera (reservas.oferta_expira_en + el cron que la caduca).

const REGLAS = [
  { r: 'Exigir bono o plan activo', estudio: 'Sí', tipo: 'Hereda', ej: 'salvo en la clase de prueba' },
  { r: 'Antelación mínima para reservar', estudio: '2 h antes', tipo: '30 min', ej: 'el mat aguanta último minuto' },
  { r: 'Antelación máxima para reservar', estudio: '14 días', tipo: 'Hereda', ej: '' },
  { r: 'Permitir lista de espera', estudio: 'Sí', tipo: 'Hereda', ej: '' },
  { r: 'Ventana de cancelación', estudio: '12 h', tipo: '24 h', ej: 'el reformer se cierra antes' },
  { r: 'Aprobación manual', estudio: 'No', tipo: 'Sí', ej: 'solo en prenatal' },
  { r: 'Mínimo de asistentes', estudio: '0', tipo: '3', ej: 'la de las 07:00 no sale con dos' },
];

export function ReglasQueSeHeredan() {
  return (
    <PanelClaro
      titulo="La misma regla, dos niveles"
      nota="Un valor vacío en el tipo de clase significa «hereda lo del estudio», no «desactivado». Así se configura una vez y solo se escribe la excepción — que es como funciona un estudio de verdad: unas reglas generales y dos o tres clases que van a su aire."
    >
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 520, borderCollapse: 'separate', borderSpacing: 0, fontSize: 13.5 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '11px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8E8E86', borderBottom: '1px solid #E7E7E0', minWidth: 200 }}>Regla</th>
              <th style={{ textAlign: 'left', padding: '11px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8E8E86', borderBottom: '1px solid #E7E7E0' }}>Tu estudio</th>
              <th style={{ textAlign: 'left', padding: '11px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#343825', background: '#F1F2EA', borderBottom: '1px solid #E1E5D4' }}>Reformer avanzado</th>
            </tr>
          </thead>
          <tbody>
            {REGLAS.map((f, i) => (
              <tr key={f.r}>
                <td style={{ padding: '11px 14px', borderBottom: i === REGLAS.length - 1 ? 'none' : '1px solid #F0F0EA', fontWeight: 600, color: '#1A1A1A' }}>{f.r}</td>
                <td style={{ padding: '11px 14px', borderBottom: i === REGLAS.length - 1 ? 'none' : '1px solid #F0F0EA', color: MUTED }}>{f.estudio}</td>
                <td style={{ padding: '11px 14px', borderBottom: i === REGLAS.length - 1 ? 'none' : '1px solid #E1E5D4', background: '#F8F9F2' }}>
                  <span style={{ color: f.tipo === 'Hereda' ? '#A8A89F' : '#343825', fontWeight: f.tipo === 'Hereda' ? 400 : 700, fontStyle: f.tipo === 'Hereda' ? 'italic' : 'normal' }}>{f.tipo}</span>
                  {f.ej && <span style={{ display: 'block', fontSize: 11.5, color: '#8E8E86', marginTop: 2 }}>{f.ej}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelClaro>
  );
}

export function CicloDeReserva() {
  return (
    <PanelOscuro titulo="Una reserva, de principio a fin">
      <PasoVertical tono="oscuro" indice="1" titulo="Elige su clase">
        Desde el enlace del estudio, en el móvil. Sin instalar nada.
      </PasoVertical>
      <PasoVertical tono="oscuro" indice="2" titulo="Se comprueban las reglas">
        ¿Tiene bono? ¿Queda plaza? ¿Está dentro de la antelación permitida?
      </PasoVertical>
      <PasoVertical tono="oscuro" indice="3" titulo="Se confirma y se descuenta">
        La plaza se ocupa y se consume la sesión del bono, en una sola operación.
      </PasoVertical>
      <PasoVertical tono="oscuro" indice="4" titulo="Recibe su confirmación" ultimo>
        Y el recordatorio el día antes, si tienes la regla encendida.
      </PasoVertical>
    </PanelOscuro>
  );
}

// ── Lista de espera ──────────────────────────────────────────────────────────

export function CicloDeLaOferta() {
  return (
    <PanelClaro
      titulo="Se libera una plaza: qué pasa en los minutos siguientes"
      nota="Sin plazo configurado, la primera de la cola entra directamente y se acabó. Con plazo, el sistema le abre una oferta y espera — y si no responde, la pierde y se la ofrece a la siguiente."
    >
      <div style={{ display: 'grid', gap: 0 }}>
        <PasoVertical indice="1" titulo="Alguien cancela" color="#C2503A">
          Queda un hueco en una clase que estaba llena.
        </PasoVertical>
        <PasoVertical indice="2" titulo="Se busca a la primera de la lista" color="#5A6142">
          Por orden de apuntada. No es una rifa.
        </PasoVertical>
        <PasoVertical indice="3" titulo="Se le abre una oferta con plazo" color="#C79A2E">
          Recibe el aviso en el móvil con el tiempo que tiene para aceptar. Su sitio en la cola no se toca todavía.
        </PasoVertical>
        <PasoVertical indice="4a" titulo="Acepta → plaza confirmada" color="#4E9E7F">
          Se le descuenta el bono en ese momento, no antes.
        </PasoVertical>
        <PasoVertical indice="4b" titulo="No responde → pierde el sitio" color="#8E8E86" ultimo>
          Y la oferta pasa a la siguiente. Es duro a propósito: si volviera al final de la cola, la clase se quedaría vacía
          mientras la lista da vueltas.
        </PasoVertical>
      </div>
    </PanelClaro>
  );
}

export function EsperaSinPlazo() {
  return (
    <PanelOscuro titulo="Dos formas de gestionar la cola">
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 12, padding: '15px 16px' }}>
          <div className="lp-mono" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#A8B080', marginBottom: 8 }}>Por defecto</div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', marginBottom: 5 }}>Promoción instantánea</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,.65)' }}>La plaza se confirma sola a la primera de la cola. Rápido, y nadie se queda sin cubrir el hueco.</div>
        </div>
        <div style={{ background: 'rgba(217,194,158,.1)', border: '1px solid rgba(217,194,158,.22)', borderRadius: 12, padding: '15px 16px' }}>
          <div className="lp-mono" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#D9C29E', marginBottom: 8 }}>Con plazo</div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', marginBottom: 5 }}>Oferta con tiempo para aceptar</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,.65)' }}>Evita meter a alguien en una clase de dentro de una hora sin que se haya enterado — y que después no aparezca.</div>
        </div>
      </div>
    </PanelOscuro>
  );
}
