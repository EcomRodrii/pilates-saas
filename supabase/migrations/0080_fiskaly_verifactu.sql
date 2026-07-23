-- Fiskaly SIGN ES / Veri*Factu — persistencia del QR y CSV oficiales de la AEAT.
--
-- La huella propia (verifactu_hash/prev_hash/ts/seq) se conserva intacta: es la
-- cadena de respaldo. Estas columnas guardan el resultado de la firma+transmisión
-- de Fiskaly cuando el estudio lo tiene configurado.

-- Emisor: ids de firmante y cliente de Fiskaly, creados una vez por estudio.
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS fiskaly_signer_id text,
  ADD COLUMN IF NOT EXISTS fiskaly_client_id text;

-- Factura: identificador en Fiskaly + representación oficial de la AEAT.
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS fiskaly_invoice_id   text,
  ADD COLUMN IF NOT EXISTS verifactu_qr_url      text,  -- URL de validación en la AEAT
  ADD COLUMN IF NOT EXISTS verifactu_qr_imagen   text,  -- data URI del QR (PNG base64)
  ADD COLUMN IF NOT EXISTS verifactu_estado      text,  -- estado de transmisión: PENDING/REGISTERED/STORED/...
  ADD COLUMN IF NOT EXISTS verifactu_csv         text;  -- CSV seguro de la AEAT (tras transmisión real)
