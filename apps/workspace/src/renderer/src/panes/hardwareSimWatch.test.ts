import { describe, expect, it } from 'vitest'
import { classifyHardwareSimChange } from './hardwareSimWatch'

const project = 'projects/blink/hardware-sim.json'
const firmware = 'firmware/blink/blink.ino'

describe('classifyHardwareSimChange', () => {
  it('reloads a changed hardware project', () => {
    expect(classifyHardwareSimChange(project, firmware, [project])).toBe('project')
  })

  it('compiles only the connected firmware source', () => {
    expect(
      classifyHardwareSimChange(project, firmware, ['projects/blink/firmware/blink/blink.ino'])
    ).toBe('firmware-source')
    expect(
      classifyHardwareSimChange(project, firmware, ['projects/blink/firmware/other/other.ino'])
    ).toBeNull()
  })

  it('restarts for a precompiled adjacent hex', () => {
    expect(
      classifyHardwareSimChange(project, firmware, [
        'projects\\blink\\firmware\\blink\\blink.ino.hex'
      ])
    ).toBe('firmware-hex')
  })

  it('normalizes dot segments and treats blank churn as a full reload', () => {
    expect(
      classifyHardwareSimChange(
        './projects/blink/hardware-sim.json',
        './firmware/blink/../blink/blink.ino',
        ['projects/blink/firmware/blink/blink.ino']
      )
    ).toBe('firmware-source')
    expect(classifyHardwareSimChange(project, firmware, [])).toBe('project')
    expect(classifyHardwareSimChange(project, firmware, [''])).toBe('project')
  })

  it('ignores unrelated paths and absent firmware', () => {
    expect(classifyHardwareSimChange(project, firmware, ['README.md'])).toBeNull()
    expect(
      classifyHardwareSimChange(project, null, ['projects/blink/firmware/blink/blink.ino'])
    ).toBeNull()
  })
})
