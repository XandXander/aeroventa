import test from 'node:test';
import assert from 'node:assert/strict';
import { PILOT_PATH, assertPilotDraft, snapshot, buildDraftPatch, normalizeExcerpt } from '../src/pilot-guards.js';
const item = Object.freeze({
  id: 'uuid-001',path:PILOT_PATH,status:'draft',owner_approved_at:null,excerpt:'Исходный текст'
});
test('only precise unapproved pilot draft is writable',()=>{
  assert.equal(assertPilotDraft(item),true);
  for(const mutation of [
    {status:'published'}, {owner_approved_at:'2026-10-29'}, {path:'/about/'},{id:''},{excerpt:null}
  ]) assert.throws(()=>assertPilotDraft({...item,...mutation}));
});
test('only excerpt field is ever patched',()=>{
  const patch=buildDraftPatch(snapshot(item),item,'  Новый текст  ');
  assert.deepEqual({...patch},{excerpt:'Новый текст'});
  assert.equal(Object.keys(patch).length,1);
});
test('stale data rejected before any write',()=>{
  assert.throws(()=>buildDraftPatch(snapshot(item),{...item,excerpt:'Other editor update'},'Наш текст'));
  assert.throws(()=>buildDraftPatch(snapshot(item),{...item,status:'published'},'Наш текст'));
});
test('blank, oversize, unchanged drafts rejected',()=>{
  assert.throws(()=>normalizeExcerpt(' '));
  assert.throws(()=>normalizeExcerpt('x'.repeat(1601)));
  assert.throws(()=>buildDraftPatch(snapshot(item),item,'Исходный текст'));
});
