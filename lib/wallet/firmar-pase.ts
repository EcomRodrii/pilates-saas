import { PKPass } from 'passkit-generator';
import { paseJson, type ConfigWallet, type DatosPase } from './pase.ts';

// Firma el `.pkpass` (servidor). La librería es `passkit-generator` (MIT,
// mantenida): arma el paquete, el `manifest.json` con los SHA-1 y la firma
// PKCS#7 con el certificado del Pass Type ID y el intermedio WWDR de Apple.
//
// Los iconos son los del ESTUDIO (marca blanca: el pase es suyo, no de
// Tentare), los mismos PNG que ya sirve `urlIconoEstudio` para su app.

export async function firmarPase(
  config: ConfigWallet,
  datos: Omit<DatosPase, 'config'>,
  iconos: { icono: Buffer; icono2x: Buffer },
): Promise<Buffer> {
  const json = paseJson({ ...datos, config });
  const pase = new PKPass(
    {
      'pass.json': Buffer.from(JSON.stringify(json)),
      'icon.png': iconos.icono,
      'icon@2x.png': iconos.icono2x,
      'logo.png': iconos.icono,
      'logo@2x.png': iconos.icono2x,
    },
    {
      wwdr: config.wwdr,
      signerCert: config.signerCert,
      signerKey: config.signerKey,
      signerKeyPassphrase: config.signerKeyPassphrase,
    },
  );
  return pase.getAsBuffer();
}
