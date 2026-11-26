const test=require('node:test'),assert=require('node:assert/strict');
const {DOMParser}=require('linkedom');
global.DOMParser=DOMParser;
require('../src/core');
require('../src/notation');
require('../src/instruments');
require('../src/percussion');
require('../src/samples');
require('../src/musicxml-import');

const TPQ=global.KanadeCore.TPQ;

const wrap=body=>`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">${body}</part>
</score-partwise>`;

test('tolerates overflow duration with repair warnings',()=>{
  const xml=wrap(`
    <measure number="1">
      <attributes><divisions>${TPQ}</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>${TPQ*5}</duration><type>whole</type></note>
    </measure>`);
  const {score,warnings}=global.KanadeMusicXMLImport.parse(xml);
  const used=global.KanadeCore.usedTicks(score.measures[0]);
  assert.equal(used,TPQ*4);
  assert.ok(warnings.some(w=>w.includes('短縮')||w.includes('超える')));
});

test('merges backup voice into playable measure',()=>{
  const xml=wrap(`
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>
      <backup><duration>480</duration></backup>
      <note><voice>2</voice><pitch><step>G</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>
    </measure>`);
  const {score}=global.KanadeMusicXMLImport.parse(xml);
  assert.ok(score.measures[0].events.length>=1);
  assert.equal(global.KanadeCore.usedTicks(score.measures[0]),TPQ*4);
});

test('parse does not throw on homr-like overlapping notes',()=>{
  const xml=wrap(`
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type><chord/></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1920</duration><type>whole</type></note>
    </measure>`);
  assert.doesNotThrow(()=>global.KanadeMusicXMLImport.parse(xml));
});