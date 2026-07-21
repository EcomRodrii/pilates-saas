import type { Metadata } from 'next';
import { MarketingShell } from '@/components/marketing/shell';

export const metadata: Metadata = {
  title: 'Guías | Tentare',
  description: 'Guías paso a paso para sacarle partido a Tentare.',
};

const GUIAS = [
  {
    t: 'Migrar tus datos con el importador CSV',
    pasos: [
      'Exporta tus socias, membresías y horario de tu plataforma actual a CSV (Excel, Bsport, Mindbody, Nubapp, Eversports...).',
      'Sube el archivo al importador correspondiente (socias, clases, suscripciones o citas).',
      'El sistema detecta y sugiere el mapeo de columnas automáticamente.',
      'Revisas el mapeo, confirmas y los registros se crean en tu cuenta.',
    ],
  },
  {
    t: 'Configurar automatizaciones sin sustos',
    pasos: [
      'Entra en Automatizaciones IA y revisa las reglas sugeridas (ausencias, pagos pendientes, clases llenas).',
      'Activa las que quieras — cada una tiene su propio umbral (p. ej. días sin venir) configurable.',
      'Para acciones con coste (como un descuento), el sistema prepara el mensaje pero espera tu aprobación antes de enviarlo.',
      'Revisas el registro de cada envío en el propio panel de Automatizaciones.',
    ],
  },
  {
    t: 'Poner tu marca en el portal y los emails',
    pasos: [
      'Ve a Mi estudio → Apariencia.',
      'Sube tu logo y elige tu color principal.',
      'El portal de socias y los emails transaccionales adoptan tu marca automáticamente — sin tocar nada más.',
    ],
  },
];

export default function Page() {
  return (
    <MarketingShell>
      <section style={{ padding: '72px 40px 44px', maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', marginBottom: 16, fontFamily: 'monospace' }}>
          Guías
        </div>
        <h1 style={{ fontWeight: 800, fontSize: 40, letterSpacing: '-.03em', margin: 0 }}>Paso a paso</h1>
      </section>
      <section style={{ padding: '0 40px 110px', maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {GUIAS.map(guia => (
          <div key={guia.t} style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 20, padding: '26px 30px' }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.01em', margin: '0 0 16px' }}>{guia.t}</h2>
            <ol style={{ margin: 0, paddingLeft: 20, color: '#374151', fontSize: 14.5, lineHeight: 2 }}>
              {guia.pasos.map(p => <li key={p}>{p}</li>)}
            </ol>
          </div>
        ))}
      </section>
    </MarketingShell>
  );
}
