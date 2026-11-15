import { expect, test } from '@playwright/test'

const hosts = ['desktop-editor', 'desktop-pkms-editor', 'web-pkms-editor'] as const

for (const host of hosts) {
  test(`${host} matches its editor parity screenshot`, async ({ page }) => {
    await page.goto(`/?host=${host}`)
    await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible()
    if (host === 'desktop-pkms-editor') await page.locator('.editor-tree-item').first().click()
    await expect(page.locator('.editor-tree-item')).toHaveCount(3)
    await expect(page.getByRole('treeitem', { name: /Readme/ })).toBeVisible()
    if (host === 'desktop-pkms-editor') await page.locator('.editor-tree-item').nth(1).click()
    await expect(page.getByText('Codex Drive smoke test', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Live Drive verification', { exact: true })).toBeVisible()
    await page
      .getByRole('navigation', { name: 'File location' })
      .getByRole('button', { name: 'Codex Drive smoke test.md' })
      .click()
    await expect(page.getByRole('menuitem', { name: 'Readme.md' })).toBeVisible()
    if (host === 'desktop-pkms-editor') {
      await page.getByRole('menuitem', { name: 'Readme.md' }).click()
      await expect
        .poll(() => page.evaluate(() => (window as any).__openedDriveMarkdownEntries))
        .toContain('mock-readme-file')
      await expect(page.getByRole('navigation', { name: 'File location' })).toContainText(
        'Readme.md'
      )
      await expect(page.getByText('Readme preview', { exact: true })).toBeVisible()
      await expect(page.getByRole('treeitem', { name: 'Readme', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
      )
      await page.locator('.editor-tree-item').nth(1).click()
    }
    await page.keyboard.press('Escape')
    await expect(page.locator('.editor-tree-item').first()).toHaveCSS('height', '27px')

    const hoverRow = page.locator('.editor-tree-item').nth(2)
    const bounds = await hoverRow.boundingBox()
    if (!bounds) throw new Error(`Missing folder row for ${host}`)
    await page.mouse.move(bounds.x + 4, bounds.y + bounds.height / 2)
    await expect.poll(() => hoverRow.evaluate((element) => element.matches(':hover'))).toBe(true)
    await expect(hoverRow).toHaveCSS('background-color', 'rgb(37, 39, 43)')
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`editor-parity-${host}.png`, {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.001
    })
  })
}

test('all host surfaces align common tree rows and readable document columns', async ({ page }) => {
  const measurements: Array<{
    folderStyle: Record<string, string>
    fileStyle: Record<string, string>
    title: { x: number; width: number }
    body: { x: number; width: number }
    document: { x: number; width: number }
  }> = []
  for (const host of hosts) {
    await page.goto(`/?host=${host}`)
    if (host === 'desktop-pkms-editor') await page.locator('.editor-tree-item').first().click()
    await expect(page.locator('.editor-tree-item')).toHaveCount(3)
    await expect(page.getByRole('treeitem', { name: /Readme/ })).toBeVisible()
    if (host === 'desktop-pkms-editor') await page.locator('.editor-tree-item').nth(1).click()
    await expect(page.getByText('Live Drive verification', { exact: true })).toBeVisible()
    await page.locator('.editor-tree-item').nth(2).hover()
    const rowStyle = async (index: number) =>
      page
        .locator('.editor-tree-item')
        .nth(index)
        .evaluate((element) => {
          const value = getComputedStyle(element)
          return {
            height: value.height,
            minHeight: value.minHeight,
            paddingBlock: `${value.paddingTop} ${value.paddingBottom}`,
            border: value.border,
            borderRadius: value.borderRadius,
            gap: value.gap,
            fontSize: value.fontSize,
            lineHeight: value.lineHeight,
            alignItems: value.alignItems
          }
        })
    const rect = async (selector: string) =>
      page.locator(selector).evaluate((element) => {
        const { x, width } = element.getBoundingClientRect()
        return { x: Math.round(x), width: Math.round(width) }
      })
    const documentSelector =
      host === 'desktop-pkms-editor'
        ? '.pkms-google-drive-editor'
        : host === 'web-pkms-editor'
          ? '.main-panel'
          : '.visual-document'
    const documentRect = await rect(documentSelector)
    measurements.push({
      folderStyle: await rowStyle(0),
      fileStyle: await rowStyle(1),
      title: await rect('.editor-markdown-title'),
      body: await rect('.cm-content'),
      document: documentRect
    })
  }
  const [workspace, desktopDrive, webPkms] = measurements
  for (const measurement of measurements) {
    expect(measurement.folderStyle.height).toBe('27px')
    expect(measurement.fileStyle.height).toBe('27px')
    expect(Math.abs(measurement.title.x - measurement.body.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(measurement.title.width - measurement.body.width)).toBeLessThanOrEqual(1)
  }
  expect(desktopDrive.folderStyle).toEqual(workspace.folderStyle)
  expect(webPkms.folderStyle).toEqual(workspace.folderStyle)
  expect(desktopDrive.fileStyle).toEqual(workspace.fileStyle)
  expect(webPkms.fileStyle).toEqual(workspace.fileStyle)
  expect(desktopDrive.title.width).toBe(workspace.title.width)
  expect(webPkms.title.width).toBe(workspace.title.width)
  for (const measurement of measurements) {
    const titleCenter = measurement.title.x + measurement.title.width / 2
    const paneCenter = measurement.document.x + measurement.document.width / 2
    expect(Math.abs(titleCenter - paneCenter)).toBeLessThanOrEqual(1)
  }
})
