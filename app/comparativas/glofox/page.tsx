import type { Metadata } from 'next';
import { ComparativaPage, type DatosComparativa } from '@/components/marketing/comparativa';

export const metadata: Metadata = {
  title: 'Tentare vs Glofox | Comparativa',
  description: 'Comparativa de precios, comisiones y funciones entre Tentare y Glofox para estudios de Pilates.',
};

const datos: DatosComparativa = {
  nombre: 'Glofox',
  resumen: 'Glofox se posiciona como alternativa más sencilla y económica a Mindbody, sin comisión de marketplace, para gimnasios y estudios boutique.',
  fechaVerificacion: 'julio de 2026',
  filas: [
    { criterio: 'Precio de partida', tentare: 'Desde 29€/mes, todo incluido', competidor: 'Desde 99$/mes (tramo "Essential"); tramos superiores e Enterprise requieren hablar con ventas' },
    { criterio: 'Comisión sobre cobros', tentare: 'Ninguna — solo la cuota estándar de Stripe', competidor: 'Sin comisión de marketplace (lo marcan como diferenciador); comisión de procesamiento de pago estándar no confirmada en su web oficial' },
    { criterio: 'Facturación España', tentare: 'Factura con NIF, IVA y numeración correlativa desde el primer cobro', competidor: 'Sin integración conocida de IVA/NIF/Verifactu para España' },
    { criterio: 'Enfoque', tentare: 'Un solo vertical: estudios de Pilates, con funciones específicas (reformer, sustituciones)', competidor: 'Gimnasios y estudios boutique en general (boxeo, yoga, pilates, spinning, artes marciales)' },
    { criterio: 'Función destacada', tentare: 'Centro de Control con automatizaciones IA que tú apruebas', competidor: 'App de marca sin marca de Glofox visible, y precio "bloqueado de por vida" al contratar' },
  ],
  fuentes: [
    { label: 'Precios', nota: 'glofox.com/plans (julio 2026); tramos superiores sin cifra pública.' },
    { label: 'Comisión', nota: 'Glofox declara ausencia de comisión de marketplace en su propia web; % de procesamiento de pago no confirmado oficialmente.' },
  ],
};

export default function Page() {
  return <ComparativaPage datos={datos} />;
}
