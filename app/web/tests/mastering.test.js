const test=require('node:test'),assert=require('node:assert/strict');
const {PeakLimiter}=require('../src/limiter-worklet');
const M=require('../src/mastering');

test('mastering loads old mix settings and bounds saved parameters',()=>{
 assert.deepEqual(M.settings(),{gain:0,low:0,high:0,limiter:true,ceiling:-1});
 assert.deepEqual(M.settings({gain:100,low:-30,high:'bad',limiter:false,ceiling:0}),{
   gain:24,low:-12,high:0,limiter:false,ceiling:-.1
 });
 assert.ok(Math.abs(M.linear(6)-2)<.01);
});

test('the limiter delays both channels, preserves their balance and caps their sample peak',()=>{
 const dsp=new PeakLimiter(48000),a=new Float32Array(480),b=new Float32Array(480);
 const l=new Float32Array(480),r=new Float32Array(480);
 a[50]=2;b[50]=-.5;
 dsp.process(a,b,l,r,[.8],[1]);
 assert.equal(l[50],0);
 assert.ok(Math.abs(l[50+dsp.delay]-.8)<1e-6);
 assert.ok(Math.abs(r[50+dsp.delay]+.2)<1e-6);
 assert.ok(Math.abs(dsp.peak-.8)<1e-6);
 assert.ok(Math.abs(dsp.reduction+20*Math.log10(.4))<1e-6);
});

test('bypass stays at unity and the enabled limiter also catches a moving ceiling',()=>{
 const a=Float32Array.of(...Array.from({length:480},()=>1.5)),l=new Float32Array(480),r=new Float32Array(480);
 const ceilings=Float32Array.from(a,(_,i)=>i<310?.9:.4);
 const enabled=new PeakLimiter(44100);
 enabled.process(a,undefined,l,r,ceilings,[1]);
 assert.ok(l.every((value,i)=>Math.abs(value)<=ceilings[i]+1e-6));
 const bypass=new PeakLimiter(44100);
 bypass.process(a,undefined,l,r,ceilings,[0]);
 assert.equal(l[bypass.delay],1.5);
 assert.equal(r[bypass.delay],1.5);
 assert.equal(bypass.reduction,0);
});
