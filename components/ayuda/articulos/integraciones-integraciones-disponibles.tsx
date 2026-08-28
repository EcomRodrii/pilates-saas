import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>Hoy Tentare conecta de verdad con:</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '20px 0' }}>
        <div style={{ border: '1px solid #E7E7E0', borderRadius: 14, padding: '14px 18px' }}>
          <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>Stripe</p>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#5A5A52', margin: 0 }}>
            Cobros con tarjeta, tarjeta guardada, renovaciones automáticas y facturación —{' '}
            <Link href="/ayuda/pagos/conectar-stripe" style={{ color: 'inherit', textDecoration: 'underline' }}>ver cómo conectarla</Link>.
          </p>
        </div>
        <div style={{ border: '1px solid #E7E7E0', borderRadius: 14, padding: '14px 18px' }}>
          <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>Widget para tu web</p>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#5A5A52', margin: 0 }}>
            No es una integración con un tercero, sino tu propio calendario incrustado en cualquier web (WordPress,
            Wix, HTML a mano) —{' '}
            <Link href="/ayuda/widget/que-es-el-widget" style={{ color: 'inherit', textDecoration: 'underline' }}>ver qué es el widget</Link>.
          </p>
        </div>
        <div style={{ border: '1px solid #E7E7E0', borderRadius: 14, padding: '14px 18px' }}>
          <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>WhatsApp</p>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#5A5A52', margin: 0 }}>Como canal de avisos automáticos, no como una bandeja de mensajería completa.</p>
        </div>
      </div>

      <AyudaResultado>
        No hay hoy integración directa con Zapier, Google Calendar ni Meta — si necesitas alguna en concreto,
        cuéntanoslo por soporte: es la mejor forma de que decidamos qué construir después.
      </AyudaResultado>
    </>
  );
}
