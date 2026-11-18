// Unit tests that need no database: `npm test`
const test = require('node:test');
const assert = require('node:assert');
const sharp = require('sharp');
const { normaliseProductImage } = require('../src/services/image.service');
const { normalisePhone, render } = require('../src/services/sms.service');

test('any image becomes a 500x500 WebP without cropping', async () => {
  for (const [w, h] of [[1800, 600], [300, 1500], [4000, 4000], [120, 80]]) {
    const input = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 20, g: 120, b: 220 } } }).png().toBuffer();
    const out = await normaliseProductImage(input);
    const meta = await sharp(out).metadata();
    assert.equal(meta.width, 500);
    assert.equal(meta.height, 500);
    assert.equal(meta.format, 'webp');
    assert.ok(out.length < 80 * 1024, `compressed (${out.length} bytes)`);
  }
});

test('Bangladeshi phone numbers are normalised', () => {
  assert.equal(normalisePhone('01711-000000'), '8801711000000');
  assert.equal(normalisePhone('+8801811000000'), '8801811000000');
  assert.equal(normalisePhone('12345'), null);
});

test('SMS templates fill placeholders', () => {
  assert.equal(render('Hi {name}, due {due}', { name: 'Karim', due: 50 }), 'Hi Karim, due 50');
});
