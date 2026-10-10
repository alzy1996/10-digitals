/**
 * 3D quality level picker (v0.3 spec 3.2): showcase (soft shadows) vs light (no shadows) per device.
 */
import { describe, it, expect } from 'vitest'
import { pickQuality } from '../src/quality.js'

describe('pickQuality (spec 3.2)', () => {
  it('the URL wins', () => {
    expect(pickQuality({ urlParam: 'light', deviceMemory: 8, cores: 8 })).toBe('light')
    expect(pickQuality({ urlParam: 'showcase', deviceMemory: 2, cores: 2, saveData: true })).toBe('showcase')
  })
  it('ignores an unknown URL value', () => {
    expect(pickQuality({ urlParam: 'ultra', deviceMemory: 8, cores: 8 })).toBe('showcase')
  })
  it('weak or data-saving devices get light', () => {
    expect(pickQuality({ saveData: true, deviceMemory: 8, cores: 8 })).toBe('light')
    expect(pickQuality({ deviceMemory: 3, cores: 8 })).toBe('light')
    expect(pickQuality({ deviceMemory: 8, cores: 4 })).toBe('light')
  })
  it('unknown values (iPhone: no deviceMemory) default to showcase when cores > 4', () => {
    expect(pickQuality({ cores: 6 })).toBe('showcase')
    expect(pickQuality({})).toBe('showcase')
  })
})
