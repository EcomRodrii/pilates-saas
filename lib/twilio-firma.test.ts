import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmaTwilioValida } from './twilio-firma.ts';

// Vector de prueba oficial de Twilio (documentación de firma de webhooks):
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
const AUTH_TOKEN = '12345';
const URL = 'https://mycompany.com/myapp.php?foo=1&bar=2';
const PARAMS = { CallSid: 'CA1234567890ABCDE', Caller: '+14158675309', Digits: '1234', From: '+14158675309', To: '+18005551212' };
const FIRMA_ESPERADA = 'RSOYDt4T1cUTdK1PDd93/VVr8B8=';

test('firmaTwilioValida: acepta la firma real del vector de prueba de Twilio', () => {
  assert.equal(firmaTwilioValida(AUTH_TOKEN, URL, PARAMS, FIRMA_ESPERADA), true);
});

test('firmaTwilioValida: rechaza una firma alterada', () => {
  assert.equal(firmaTwilioValida(AUTH_TOKEN, URL, PARAMS, 'RSOYDt4T1cUTdK1PDd93/VVr8B9='), false);
});

test('firmaTwilioValida: rechaza si cambia cualquier parámetro', () => {
  assert.equal(firmaTwilioValida(AUTH_TOKEN, URL, { ...PARAMS, Digits: '9999' }, FIRMA_ESPERADA), false);
});

test('firmaTwilioValida: rechaza si cambia la URL', () => {
  assert.equal(firmaTwilioValida(AUTH_TOKEN, URL + '&extra=1', PARAMS, FIRMA_ESPERADA), false);
});

test('firmaTwilioValida: sin firma recibida, siempre falso', () => {
  assert.equal(firmaTwilioValida(AUTH_TOKEN, URL, PARAMS, null), false);
});

test('firmaTwilioValida: token equivocado no valida', () => {
  assert.equal(firmaTwilioValida('otro-token', URL, PARAMS, FIRMA_ESPERADA), false);
});
