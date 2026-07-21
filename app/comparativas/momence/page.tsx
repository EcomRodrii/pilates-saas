import type { Metadata } from 'next';
import { ComparativaPage, type DatosComparativa } from '@/components/marketing/comparativa';

export const metadata: Metadata = {
  title: 'Tentare vs Momence | Comparativa',
  description: 'Comparativa de precios, comisiones y funciones entre Tentare y Momence para estudios de Pilates.',
};

const datos: DatosComparativa = {
  nombre: 'Momence',
  resumen: 'Momence tiene un plan gratuito para empezar, pero su comisión sobre cobros baja según el plan que pagues — con Tentare no hay comisión en ningún plan.',
  fechaVerificacion: 'julio de 2026',
  filas: [
    { criterio: 'Precio de partida', tentare: 'Desde 29€/mes, todo incluido, sin comisión', competidor: 'Plan "Basic" gratuito, Pro 60$/mes, Custom 199$/mes' },
    { criterio: 'Comisión sobre cobros', tentare: 'Ninguna — solo la cuota estándar de Stripe', competidor: 'Del 5% (plan gratuito) al 0% (plan Custom, el más caro) — la comisión baja según lo que pagas de suscripción' },
    { criterio: 'Facturación España', tentare: 'Factura con NIF, IVA y numeración correlativa desde el primer cobro', competidor: 'Sin mención de IVA/NIF/Verifactu; procesamiento de pagos limitado a EE. UU., Reino Unido, Australia y Canadá' },
    { criterio: 'Enfoque', tentare: 'Un solo vertical: estudios de Pilates, con funciones específicas (reformer, sustituciones)', competidor: 'Genérico para instructoras/estudios de cualquier tamaño, desde particulares hasta estudios establecidos' },
    { criterio: 'Función destacada', tentare: 'Centro de Control con automatizaciones IA que tú apruebas', competidor: 'Plan de entrada gratuito para probar sin coste fijo' },
  ],
  fuentes: [
    { label: 'Precios y comisión', nota: 'momence.com/pricing (julio 2026).' },
    { label: 'Cobertura de pagos', nota: 'Momence limita el procesamiento de pagos a EE. UU., Reino Unido, Australia y Canadá según su propia web — sin cobertura confirmada en España.' },
  ],
};

export default function Page() {
  return <ComparativaPage datos={datos} />;
}
