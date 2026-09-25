// AU-4 / E-10 (RGPD art. 7.3): una socia que se dio de baja del marketing y
// aparece como «Sin consentimiento» es, a ojos del mostrador, igual que la que
// nunca dijo nada — y registrarle un consentimiento «en mostrador» prueba por
// escrito que se le volvió a pedir lo que había retirado. Esto NO lo bloquea
// (decisión de producto: puede haber vuelto a aceptar de verdad); solo hace que
// quien lo registra sepa que la había retirado, con fecha y por dónde.

export interface EventoConsentimiento {
  en: string;
  accion: 'DAR' | 'RETIRAR';
  origen: string;
}

export interface RetiroVigente {
  retiradoEn: string;
  origen: string;
}

/** El último evento decide: si es una retirada, sigue retirado. */
export function retiroVigente(eventos: readonly EventoConsentimiento[]): RetiroVigente | null {
  if (eventos.length === 0) return null;
  const ultimo = [...eventos].sort((a, b) => a.en.localeCompare(b.en)).at(-1)!;
  return ultimo.accion === 'RETIRAR' ? { retiradoEn: ultimo.en, origen: ultimo.origen } : null;
}

export function textoRetiro(r: RetiroVigente, fecha: string): string {
  return r.origen === 'BAJA_EMAIL'
    ? `Se dio de baja del marketing el ${fecha}, desde el enlace de un email.`
    : `Retiró su consentimiento de marketing el ${fecha}.`;
}
