import test from 'node:test';
import assert from 'node:assert/strict';
import {fitGraphicText} from '../lib/social-layout.mjs';
test('Maximum-length unbroken promotional text fits each bounded canvas section',()=>{for(const [length,height,maxFont]of [[120,300,58],[160,155,34],[260,215,28]]){const measure=(text,font)=>text.length*font;const fit=fitGraphicText('W'.repeat(length),{width:940,height,maxFont,measure});assert.equal(fit.lines.join('').length,length);assert.ok(fit.lines.every(line=>measure(line,fit.font)<=940));assert.ok(fit.lines.length*fit.lineHeight<=height);}});
