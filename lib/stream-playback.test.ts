import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlIframeStream, urlThumbnailStream } from './stream-playback.ts';

// Sin NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE (no definido en test) se usa el
// dominio genérico videodelivery.net, que no requiere el código de cliente.
test('urlIframeStream / urlThumbnailStream: sin customer code → videodelivery.net', () => {
  assert.equal(urlIframeStream('abc123'), 'https://iframe.videodelivery.net/abc123');
  assert.equal(urlThumbnailStream('abc123'), 'https://videodelivery.net/abc123/thumbnails/thumbnail.jpg');
});
