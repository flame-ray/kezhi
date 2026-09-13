import { describe, it, expect } from 'vitest';
import { createRootBackGate, ROOT_BACK_WINDOW_MS } from './rootBack';
describe('double back at Android root',()=>{
  it('prompts on the first back, including a zero timestamp',()=>{const gate=createRootBackGate();expect(gate.press(0)).toBe('hint');expect(gate.press(150)).toBe('home');});
  it('requires two backs within two seconds',()=>{const gate=createRootBackGate();expect(gate.press(100)).toBe('hint');expect(gate.press(2101)).toBe('hint');expect(gate.press(2200)).toBe('home');});
  it('accepts the exact deadline and clears the consumed pair',()=>{const gate=createRootBackGate();gate.press(10);expect(gate.press(10+ROOT_BACK_WINDOW_MS)).toBe('home');expect(gate.press(2100)).toBe('hint');});
  it('resets after a page, dialog or app visibility change',()=>{const gate=createRootBackGate();gate.press(100);gate.reset();expect(gate.press(200)).toBe('hint');});
  it('never exits on a backward clock jump',()=>{const gate=createRootBackGate();gate.press(200);expect(gate.press(100)).toBe('hint');});
});
