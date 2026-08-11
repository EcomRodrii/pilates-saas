import { Text } from '@react-email/components';
import { EmailLayout } from '@/lib/emails/layout';

interface Props {
  propietariaNombre: string;
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  rangoTexto: string; // p.ej. "4–10 de agosto"
  crecimientoPct?: number; // solo presente si es > 0 (ver resumen-semanal.ts)
}

// El Umbral (lib/decision/umbral.ts) decide cada día si hay UNA cosa que
// merezca interrumpir a la propietaria. Cuando una semana entera pasa sin
// que encuentre nada así, hoy esa "semana tranquila" solo se ve si ella abre
// la app — este email cierra ese hueco: activo por defecto (opt-out vía
// decision_feature_flags, ver lib/decision/resumen-semanal-cron.ts), deliberadamente
// el ÚNICO caso en que el Umbral manda algo por email en vez de push (el
// mensaje diario es push en exclusiva a propósito, para no diluir esa
// promesa — un resumen semanal no urgente encaja mejor con email).
export function ResumenSemanalEmail({ propietariaNombre, estudioNombre, logoUrl, colorPrimario, rangoTexto, crecimientoPct }: Props) {
  return (
    <EmailLayout
      studioNombre={estudioNombre}
      logoUrl={logoUrl}
      colorPrimario={colorPrimario}
      titulo="Semana tranquila"
      preview={`${estudioNombre}: nada urgente esta semana`}
    >
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 12px' }}>Hola {propietariaNombre},</Text>
      <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>
        Repasamos <strong>{estudioNombre}</strong> cada día de la semana del <strong>{rangoTexto}</strong> y no
        encontramos nada que mereciera interrumpirte. Sin sorpresas, sin nada pendiente de tu parte.
      </Text>
      {crecimientoPct !== undefined && (
        <Text style={{ color: '#374151', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>
          Y de paso: tus ingresos crecieron un <strong>{crecimientoPct}%</strong> respecto a la semana anterior.
        </Text>
      )}
      <Text style={{ color: '#63635D', fontSize: 12, margin: '22px 0 0' }}>
        Este es el único aviso que mandamos cuando una semana ha sido así de tranquila — puedes
        desactivarlo desde Centro de Control si prefieres no recibirlo.
      </Text>
    </EmailLayout>
  );
}
