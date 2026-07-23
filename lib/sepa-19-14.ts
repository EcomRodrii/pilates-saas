// F2 (B2.10) — Cuaderno 19.14 (AEB): remesa de adeudos SEPA Core. Genera el XML
// pain.008.001.02, que es lo que el banco español acepta como "cuaderno 19.14".
// Puro y determinista (msgId/fechas se pasan como parámetros) → 100% testeable.
// Ningún competidor anglosajón tiene esto: es la remesa "para el banco de siempre",
// sin pasarela.

export interface AcreedorSEPA {
  nombre: string;      // InitgPty (quien inicia la remesa)
  titular: string;     // Cdtr (titular de la cuenta acreedora)
  iban: string;        // cuenta del estudio donde entra el dinero
  idAcreedor: string;  // Identificador de acreedor SEPA (Creditor Scheme Id)
}

export interface AdeudoSEPA {
  id: string;           // EndToEndId (id de la operación)
  nombreDeudor: string;
  iban: string;         // IBAN de la socia
  refMandato: string;   // referencia única del mandato
  fechaFirma: string;   // YYYY-MM-DD (fecha de firma del mandato)
  importe: number;      // EUR
  concepto: string;
}

export interface OpcionesRemesa {
  msgId: string;        // id único del mensaje (≤35)
  creDtTm: string;      // ISO 8601 de creación (p.ej. 2026-07-24T12:00:00)
  fechaCobro: string;   // YYYY-MM-DD (fecha de cargo pedida)
  secuencia?: 'FRST' | 'RCUR' | 'OOFF' | 'FNAL'; // por defecto RCUR (rulebook 2021 lo admite para todos)
}

// ── IBAN (mod-97, ISO 7064) ──────────────────────────────────────────────────
export function normalizarIBAN(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

export function validarIBAN(iban: string): boolean {
  const s = normalizarIBAN(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(s)) return false;
  // Reordena (4 primeros al final) y convierte letras a números (A=10 … Z=35).
  const reord = s.slice(4) + s.slice(0, 4);
  let resto = 0;
  for (const ch of reord) {
    const v = ch >= 'A' && ch <= 'Z' ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    resto = (resto * (v > 9 ? 100 : 10) + v) % 97;
  }
  return resto === 1;
}

// ── Saneado al juego de caracteres SEPA ──────────────────────────────────────
// El estándar limita textos a: a-z A-Z 0-9 / - ? : ( ) . , ' + y espacio. Se
// translitera lo común (acentos, ñ) y se descarta el resto para no romper el banco.
function saneaSEPA(texto: string, max: number): string {
  const sinAcentos = texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ñ/g, 'n').replace(/Ñ/g, 'N');
  return sinAcentos.replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function importe2dp(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

// ── Generador ────────────────────────────────────────────────────────────────
export function generarRemesaSEPA(acreedor: AcreedorSEPA, adeudos: AdeudoSEPA[], opts: OpcionesRemesa): string {
  const seqTp = opts.secuencia ?? 'RCUR';
  const nb = adeudos.length;
  const total = importe2dp(adeudos.reduce((s, a) => s + a.importe, 0));
  const pmtInfId = `PMT-${opts.msgId}`.slice(0, 35);

  const txs = adeudos.map(a => `      <DrctDbtTxInf>
        <PmtId><EndToEndId>${esc(saneaSEPA(a.id, 35)) || 'NOTPROVIDED'}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${importe2dp(a.importe)}</InstdAmt>
        <DrctDbtTx><MndtRltdInf>
          <MndtId>${esc(saneaSEPA(a.refMandato, 35))}</MndtId>
          <DtOfSgntr>${a.fechaFirma.slice(0, 10)}</DtOfSgntr>
        </MndtRltdInf></DrctDbtTx>
        <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>
        <Dbtr><Nm>${esc(saneaSEPA(a.nombreDeudor, 70))}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${esc(normalizarIBAN(a.iban))}</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>${esc(saneaSEPA(a.concepto, 140))}</Ustrd></RmtInf>
      </DrctDbtTxInf>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${esc(saneaSEPA(opts.msgId, 35))}</MsgId>
      <CreDtTm>${opts.creDtTm}</CreDtTm>
      <NbOfTxs>${nb}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <InitgPty><Nm>${esc(saneaSEPA(acreedor.nombre, 70))}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(pmtInfId)}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${nb}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>CORE</Cd></LclInstrm>
        <SeqTp>${seqTp}</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${opts.fechaCobro.slice(0, 10)}</ReqdColltnDt>
      <Cdtr><Nm>${esc(saneaSEPA(acreedor.titular, 70))}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${esc(normalizarIBAN(acreedor.iban))}</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId><Id><PrvtId><Othr>
        <Id>${esc(acreedor.idAcreedor.replace(/\s+/g, ''))}</Id>
        <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>
      </Othr></PrvtId></Id></CdtrSchmeId>
${txs}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;
}

// Empareja recibos pendientes con mandatos vigentes (por socia) y genera la remesa.
// Devuelve también cuántos recibos quedaron fuera por no tener mandato.
export function construirRemesa(params: {
  acreedor: AcreedorSEPA;
  recibosPendientes: { id: string; socioId: string | null; importe: number; concepto: string }[];
  mandatosVigentes: { socioId: string; iban: string; refMandato: string; fechaFirma: string }[];
  nombreSocio: (socioId: string) => string;
  msgId: string; creDtTm: string; fechaCobro: string;
}): { xml: string; nAdeudos: number; sinMandato: number } {
  const mandatoPorSocio = new Map(params.mandatosVigentes.map(m => [m.socioId, m]));
  const adeudos: AdeudoSEPA[] = [];
  let sinMandato = 0;
  for (const r of params.recibosPendientes) {
    if (!r.socioId) continue;
    const m = mandatoPorSocio.get(r.socioId);
    if (!m) { sinMandato++; continue; }
    adeudos.push({
      id: r.id, nombreDeudor: params.nombreSocio(r.socioId), iban: m.iban,
      refMandato: m.refMandato, fechaFirma: m.fechaFirma, importe: r.importe, concepto: r.concepto,
    });
  }
  const xml = generarRemesaSEPA(params.acreedor, adeudos, { msgId: params.msgId, creDtTm: params.creDtTm, fechaCobro: params.fechaCobro });
  return { xml, nAdeudos: adeudos.length, sinMandato };
}
