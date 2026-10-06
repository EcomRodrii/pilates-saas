import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conTopeDeEscala, esIOS } from './viewport-ios.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const IPAD_COMO_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

test('iPhone e iPad, también Chrome en iOS y el iPad que dice ser un Mac', () => {
  assert.equal(esIOS(IPHONE, 5), true);
  assert.equal(esIOS(CHROME_IOS, 5), true);
  assert.equal(esIOS(IPAD_COMO_MAC, 5), true);
});

test('ni Android (ahí maximum-scale sí quita el pellizco) ni un Mac de verdad', () => {
  assert.equal(esIOS(ANDROID, 5), false);
  assert.equal(esIOS(IPAD_COMO_MAC, 0), false);
  assert.equal(esIOS('', 0), false);
});

test('añade maximum-scale=1 sin tocar el resto ni duplicarlo', () => {
  assert.equal(conTopeDeEscala('width=device-width, initial-scale=1'), 'width=device-width, initial-scale=1, maximum-scale=1');
  assert.equal(conTopeDeEscala('width=device-width, initial-scale=1, maximum-scale=1'), 'width=device-width, initial-scale=1, maximum-scale=1');
  assert.equal(conTopeDeEscala('width=device-width,maximum-scale=5,viewport-fit=cover'), 'width=device-width, viewport-fit=cover, maximum-scale=1');
  assert.equal(conTopeDeEscala(''), 'maximum-scale=1');
});
