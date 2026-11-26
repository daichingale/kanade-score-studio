import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareOmrRequest, OMR_ALLOWED_MIME, OMR_BODY_LIMIT } from './omr-pc.mjs';

test('prepareOmrRequest validates mime and size',()=>{
  const bytes=Buffer.alloc(1024,'x');
  const prepared=prepareOmrRequest({
    mime:'image/jpeg',
    dataBase64:bytes.toString('base64'),
    filename:'scan.jpg'
  });
  assert.equal(prepared.mime,'image/jpeg');
  assert.equal(prepared.engine,'auto');
});

test('prepareOmrRequest rejects oversize payloads',()=>{
  const huge=Buffer.alloc(OMR_BODY_LIMIT+1);
  assert.throws(()=>prepareOmrRequest({mime:'image/png',dataBase64:huge.toString('base64')}),/payload-too-large/);
});

test('allowed mime set includes pdf',()=>{
  assert.ok(OMR_ALLOWED_MIME.has('application/pdf'));
});