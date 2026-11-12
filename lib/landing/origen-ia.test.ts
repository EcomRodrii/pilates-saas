import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motorDeIA } from './origen-ia.ts';

test('por el referrer de cada asistente', () => {
  assert.equal(motorDeIA('https://chatgpt.com/'), 'chatgpt');
  assert.equal(motorDeIA('https://chat.openai.com/c/abc'), 'chatgpt');
  assert.equal(motorDeIA('https://www.perplexity.ai/search/x'), 'perplexity');
  assert.equal(motorDeIA('https://gemini.google.com/app'), 'gemini');
  assert.equal(motorDeIA('https://claude.ai/chat/1'), 'claude');
  assert.equal(motorDeIA('https://copilot.microsoft.com/'), 'copilot');
});

test('por utm_source cuando no hay referrer', () => {
  assert.equal(motorDeIA('', 'chatgpt.com'), 'chatgpt');
  assert.equal(motorDeIA(null, 'Perplexity'), 'perplexity');
  assert.equal(motorDeIA(undefined, 'copilot.com'), 'copilot');
});

test('Google, Meta, directo y los sitios que solo se parecen no cuentan', () => {
  assert.equal(motorDeIA('https://www.google.com/'), null);
  assert.equal(motorDeIA('https://l.facebook.com/'), null);
  assert.equal(motorDeIA(''), null);
  assert.equal(motorDeIA('no es una url'), null);
  assert.equal(motorDeIA('https://notchatgpt.com.evil.example/'), null);
  assert.equal(motorDeIA('https://claude.ai.evil.example/'), null);
  assert.equal(motorDeIA(null, 'meta_ads'), null);
});
