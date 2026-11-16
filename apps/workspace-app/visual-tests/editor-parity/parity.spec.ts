import { expect, test, type Page } from '@playwright/test'

const hosts = ['desktop-editor', 'desktop-pkms-editor', 'web-pkms-editor'] as const

async function clearSavedEditorViews(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
}

for (const host of hosts) {
  test(`${host} matches its editor parity screenshot`, async ({ page }) => {
    await page.goto(`/?host=${host}`)
    await expect(
      page.getByRole('tree', {
        name:
          host === 'web-pkms-editor'
            ? 'Repository files'
            : host === 'desktop-pkms-editor'
              ? 'PKMS Google Drive files'
              : 'Files'
      })
    ).toBeVisible()
    if (host !== 'desktop-editor') await page.locator('[data-editor-tree-row]').first().click()
    await expect(page.locator('[data-editor-tree-row]')).toHaveCount(3)
    await expect(page.getByRole('treeitem', { name: /Readme/ })).toBeVisible()
    if (host !== 'desktop-editor')
      await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
    await expect(page.getByText('Live Drive verification', { exact: true })).toBeVisible()
    await expect(page.getByText('Codex Drive smoke test', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Live Drive verification', { exact: true })).toBeVisible()
    await expect(page.locator('.cm-md-wikilink')).toHaveText('sibling note')
    await expect(page.locator('.cm-md-table-wrap')).toBeVisible()
    await expect(page.locator('.cm-md-math-block .katex')).toBeVisible()
    await expect(page.locator('.cm-md-codeblock-header')).toContainText('typescript')
    await expect(page.locator('.cm-md-mermaid svg')).toBeVisible()
    await expect(
      page.frameLocator('iframe[title="Embedded HTML preview"]').locator('strong')
    ).toHaveText('HTML preview')
    if (host !== 'desktop-editor') {
      await page.locator('.cm-md-wikilink').click()
      await expect(page.getByRole('navigation', { name: 'File location' })).toContainText(
        'Readme.md'
      )
      await expect(page.getByText('Readme preview', { exact: true })).toBeVisible()
      await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
      await expect(page.getByText('Live Drive verification', { exact: true })).toBeVisible()
    }
    await page
      .getByRole('navigation', { name: 'File location' })
      .getByRole('button', { name: 'Codex Drive smoke test.md' })
      .click()
    const breadcrumbMenu = page.getByRole('menu', { name: 'Items in Verification' })
    const readmeMenuItem = breadcrumbMenu.getByRole('menuitem', { name: 'Readme.md' })
    await expect(readmeMenuItem).toBeVisible()
    await expect(breadcrumbMenu.getByRole('menuitem').first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(readmeMenuItem).toBeFocused()
    await page.keyboard.press('Enter')
    if (host === 'desktop-pkms-editor') {
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
      await page.locator('[data-editor-tree-row]').nth(1).click()
    }
    if (host === 'web-pkms-editor') {
      await expect(page.getByRole('navigation', { name: 'File location' })).toContainText(
        'Readme.md'
      )
      await expect(page.getByText('Readme preview', { exact: true })).toBeVisible()
      await expect(page.getByRole('treeitem', { name: 'Readme', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
      )
      await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
      await expect(page.getByText('Live Drive verification', { exact: true })).toBeVisible()
    }
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-editor-tree-row]').first()).toHaveCSS('height', '27px')

    const hoverRow = page.locator('[data-editor-tree-row]').nth(2)
    const bounds = await hoverRow.boundingBox()
    if (!bounds) throw new Error(`Missing folder row for ${host}`)
    await page.mouse.move(bounds.x + 4, bounds.y + bounds.height / 2)
    await expect.poll(() => hoverRow.evaluate((element) => element.matches(':hover'))).toBe(true)
    await expect(hoverRow).toHaveCSS('background-color', 'rgb(37, 39, 43)')
    if (host === 'web-pkms-editor') {
      const syncError = page.getByRole('alert')
      if (await syncError.isVisible())
        await syncError.getByRole('button', { name: 'Dismiss error' }).click()
    }
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`editor-parity-${host}.png`, {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.001
    })
  })
}

test('Web PKMS Explorer shortcut hides and restores the real Files tree', async ({ page }) => {
  await page.goto('/?host=web-pkms-editor')
  const tree = page.getByRole('tree', { name: 'Repository files' })
  await expect(tree).toBeVisible()
  await page.keyboard.press('Control+\\')
  await expect(tree).not.toBeVisible()
  await page.keyboard.press('Control+\\')
  await expect(tree).toBeVisible()
  await expect(page.getByRole('treeitem', { name: 'Verification' })).toBeVisible()
})

for (const host of ['desktop-pkms-editor', 'web-pkms-editor'] as const) {
  test(`${host} uses the shared provider-backed Quick Open dialog`, async ({ page }) => {
    await page.goto(`/?host=${host}`)
    await page.getByRole('treeitem', { name: 'Verification' }).click()
    await expect(page.getByRole('treeitem', { name: /Readme/ })).toBeVisible()

    if (host === 'desktop-pkms-editor') {
      // Desktop's shell owns the shortcut and sends the PKMS host event.
      await page.evaluate(() => window.dispatchEvent(new Event('pkms:quick-open')))
    } else {
      await page.keyboard.press('Control+p')
    }
    const dialog = page.getByRole('dialog', { name: 'Quick open' })
    await expect(dialog).toBeVisible()
    const input = dialog.getByPlaceholder('Search files…')
    await input.fill('Readme')
    const result = dialog.getByRole('button', { name: /Readme\.md/ })
    await expect(result).toBeVisible()
    await result.click()

    await expect(page.getByRole('navigation', { name: 'File location' })).toContainText('Readme.md')
    await expect(page.getByText('Readme preview', { exact: true })).toBeVisible()
  })
}

for (const host of hosts) {
  test(`${host} creates and opens a missing wikilink target`, async ({ page }) => {
    await page.goto(`/?host=${host}&scenario=missing-wikilink`)
    if (host !== 'desktop-editor') {
      await page.getByRole('treeitem', { name: 'Verification' }).click()
      await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
    } else {
      await expect(page.getByRole('treeitem', { name: /Codex Drive smoke test/ })).toBeVisible()
    }
    if (host === 'desktop-editor') {
      await expect
        .poll(() => page.evaluate(() => (window as any).__readLocalPaths))
        .toContain('Verification/Codex Drive smoke test.md')
    }
    const editor = page.locator('.cm-content')
    await expect(editor).toContainText('Live Drive verification')
    const link = page.locator('.cm-md-wikilink').filter({ hasText: 'Fresh Note' })
    await expect(link).toBeVisible()
    await link.click()

    await expect(page.getByRole('navigation', { name: 'File location' })).toContainText(
      'Fresh Note.md'
    )
    if (host === 'desktop-pkms-editor') {
      await expect
        .poll(() => page.evaluate(() => (window as any).__openedDriveMarkdownEntries))
        .toContain('mock-drive-created-1')
    } else if (host === 'web-pkms-editor') {
      await expect
        .poll(() => page.evaluate(() => (window as any).__createdPkmsPaths))
        .toContain('Fresh Note.md')
    } else {
      await expect
        .poll(() => page.evaluate(() => (window as any).__createdLocalPaths))
        .toContain('Fresh Note.md')
    }
  })
}

for (const host of ['desktop-pkms-editor', 'web-pkms-editor'] as const) {
  test(`${host} Quick Open finds a file inside a collapsed nested folder`, async ({ page }) => {
    await page.goto(`/?host=${host}&scenario=quick-open-nested`)
    await page.getByRole('treeitem', { name: 'Verification' }).click()
    await expect(page.getByRole('treeitem', { name: 'Hidden' })).toBeVisible()
    await expect(page.getByRole('treeitem', { name: 'Deep Note', exact: true })).toHaveCount(0)

    if (host === 'desktop-pkms-editor') {
      await page.evaluate(() => window.dispatchEvent(new Event('pkms:quick-open')))
    } else {
      await page.keyboard.press('Control+p')
    }
    const dialog = page.getByRole('dialog', { name: 'Quick open' })
    await expect(dialog).toBeVisible()
    await dialog.getByPlaceholder('Search files…').fill('Deep Note')
    await dialog.getByRole('button', { name: /Deep Note\.md/ }).click()

    await expect(page.getByRole('navigation', { name: 'File location' })).toContainText(
      'Deep Note.md'
    )
    await expect(page.getByRole('treeitem', { name: 'Deep Note', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    if (host === 'desktop-pkms-editor')
      await expect(page.getByText('Deep Note preview', { exact: true })).toBeVisible()
    else await expect(page.getByText('Deep Note preview', { exact: true })).toBeVisible()
  })
}

test('Desktop Drive Markdown saves edits automatically without a Save button', async ({ page }) => {
  await page.goto('/?host=desktop-pkms-editor')
  await page.getByRole('treeitem', { name: 'Verification' }).click()
  await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
  await expect(page.locator('.cm-content')).toContainText('Live Drive verification')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)

  const savedText = '# Saved automatically from the shared editor'
  await page.locator('.cm-content').fill(savedText)
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__savedDriveMarkdown.some((save: { text: string }) =>
          save.text.includes('Saved automatically from the shared editor')
        )
      )
    )
    .toBe(true)

  const flushText = '# Saved before switching documents'
  await page.locator('.cm-content').fill(flushText)
  await page.getByRole('treeitem', { name: 'Readme', exact: true }).click()
  await expect(page.getByText('Readme preview', { exact: true })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__savedDriveMarkdown.some((save: { text: string }) =>
          save.text.includes('Saved before switching documents')
        )
      )
    )
    .toBe(true)
})

test('narrow view keeps the active breadcrumb reachable and its menu on screen', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?host=web-pkms-editor')
  await page.getByRole('treeitem', { name: 'Verification' }).click()
  await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
  await expect(page.getByText('Live Drive verification', { exact: true })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'File location' })
  const current = navigation.getByRole('button', { name: 'Codex Drive smoke test.md' })
  const bounds = await current.boundingBox()
  const viewport = await page.locator('.editor-breadcrumbs-scroll').boundingBox()
  if (!bounds || !viewport) throw new Error('Missing Web PKMS breadcrumb geometry')
  expect(bounds.x).toBeGreaterThanOrEqual(viewport.x - 1)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.x + viewport.width + 1)
  await current.click()
  const menu = page.getByRole('menu', { name: 'Items in Verification' })
  await expect(menu).toBeVisible()
  const menuBounds = await menu.boundingBox()
  if (!menuBounds) throw new Error('Missing Web PKMS breadcrumb menu')
  expect(menuBounds.x).toBeGreaterThanOrEqual(0)
  expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(390)
})

test('all host surfaces align common tree rows and readable document columns', async ({ page }) => {
  const measurements: Array<{
    treeWidth: number
    toolbar: Record<string, string>
    folderStyle: Record<string, string>
    fileStyle: Record<string, string>
    createActions: Array<{
      width: number
      height: number
      padding: string
      borderWidth: string
      borderStyle: string
      borderRadius: string
    }>
    headingFoldControl: Record<string, string>
    title: { x: number; width: number }
    body: { x: number; width: number }
    document: { x: number; width: number }
  }> = []
  for (const host of hosts) {
    await page.goto(`/?host=${host}`)
    if (host !== 'desktop-editor') {
      await expect(page.locator('[data-editor-tree-row]').first()).toBeVisible()
      await page.locator('[data-editor-tree-row]').first().click()
    }
    await expect(page.locator('[data-editor-tree-row]')).toHaveCount(3)
    await expect(page.getByRole('treeitem', { name: /Readme/ })).toBeVisible()
    if (host !== 'desktop-editor')
      await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
    await expect(page.getByText('Live Drive verification', { exact: true })).toBeVisible()
    await page.locator('[data-editor-tree-row]').nth(2).hover()
    const rowStyle = async (index: number) =>
      page
        .locator('[data-editor-tree-row]')
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
        ? '[data-drive-editor]'
        : host === 'web-pkms-editor'
          ? '.main-panel'
          : '.visual-document'
    const documentRect = await rect(documentSelector)
    const foldControl = page.locator('.cm-md-fold-control').first()
    await foldControl.hover()
    await expect
      .poll(() =>
        foldControl.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity))
      )
      .toBeGreaterThanOrEqual(0.8)
    measurements.push({
      treeWidth: await page
        .locator('[data-editor-tree-frame]')
        .first()
        .evaluate((element) => Math.round(element.getBoundingClientRect().width)),
      toolbar: await page
        .locator('[data-editor-tree-toolbar]')
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            height: style.height,
            minHeight: style.minHeight,
            padding: style.padding,
            borderBottomWidth: style.borderBottomWidth,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            letterSpacing: style.letterSpacing,
            textTransform: style.textTransform
          }
        }),
      folderStyle: await rowStyle(0),
      fileStyle: await rowStyle(1),
      createActions: await Promise.all(
        ['New Markdown file', 'New folder'].map((label) =>
          page.getByRole('button', { name: label }).evaluate((element) => {
            const style = getComputedStyle(element)
            const { width, height } = element.getBoundingClientRect()
            return {
              width: Math.round(width),
              height: Math.round(height),
              padding: style.padding,
              borderWidth: style.borderWidth,
              borderStyle: style.borderStyle,
              borderRadius: style.borderRadius
            }
          })
        )
      ),
      headingFoldControl: await foldControl.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          width: style.width,
          height: style.height,
          minHeight: style.minHeight,
          marginLeft: style.marginLeft,
          marginRight: style.marginRight,
          padding: style.padding,
          color: style.color,
          borderWidth: style.borderWidth,
          borderStyle: style.borderStyle,
          borderRadius: style.borderRadius
        }
      }),
      title: await rect('[data-editor-markdown-title]'),
      body: await rect('.cm-content'),
      document: documentRect
    })
  }
  const [workspace, desktopDrive, webPkms] = measurements
  for (const measurement of measurements) {
    expect(measurement.folderStyle.height).toBe('27px')
    expect(measurement.fileStyle.height).toBe('27px')
    expect(measurement.createActions).toEqual([
      {
        width: 26,
        height: 26,
        padding: '0px',
        borderWidth: '0px',
        borderStyle: 'none',
        borderRadius: '0px'
      },
      {
        width: 26,
        height: 26,
        padding: '0px',
        borderWidth: '0px',
        borderStyle: 'none',
        borderRadius: '0px'
      }
    ])
    expect(Math.abs(measurement.title.x - measurement.body.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(measurement.title.width - measurement.body.width)).toBeLessThanOrEqual(1)
  }
  expect(desktopDrive.folderStyle).toEqual(workspace.folderStyle)
  expect(desktopDrive.treeWidth).toBe(workspace.treeWidth)
  expect(webPkms.treeWidth).toBe(workspace.treeWidth)
  expect(desktopDrive.toolbar).toEqual(workspace.toolbar)
  expect(webPkms.toolbar).toEqual(workspace.toolbar)
  expect(webPkms.folderStyle).toEqual(workspace.folderStyle)
  expect(desktopDrive.fileStyle).toEqual(workspace.fileStyle)
  expect(webPkms.fileStyle).toEqual(workspace.fileStyle)
  expect(desktopDrive.createActions).toEqual(workspace.createActions)
  expect(webPkms.createActions).toEqual(workspace.createActions)
  expect(desktopDrive.headingFoldControl).toEqual(workspace.headingFoldControl)
  expect(webPkms.headingFoldControl).toEqual(workspace.headingFoldControl)
  expect(desktopDrive.title.width).toBe(workspace.title.width)
  expect(webPkms.title.width).toBe(workspace.title.width)
  for (const measurement of measurements) {
    const titleCenter = measurement.title.x + measurement.title.width / 2
    const paneCenter = measurement.document.x + measurement.document.width / 2
    expect(Math.abs(titleCenter - paneCenter)).toBeLessThanOrEqual(1)
  }
})

test('heading hover arrows share markup and visual baselines across editor hosts', async ({
  page
}) => {
  let reference:
    | {
        markup: string
        viewBox: string | null
        stroke: string
        strokeWidth: string
        width: string
        height: string
      }
    | undefined
  for (const host of hosts) {
    await page.goto(`/?host=${host}`)
    if (host !== 'desktop-editor') {
      await page.locator('[data-editor-tree-row]').first().click()
      await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
    }
    await expect(page.getByText('Live Drive verification', { exact: true })).toBeVisible()
    const foldControl = page.locator('.cm-md-fold-control').first()
    await foldControl.hover()
    await expect(foldControl).toHaveCSS('opacity', '0.8')
    const arrow = await foldControl.locator('svg').evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        markup: element.innerHTML,
        viewBox: element.getAttribute('viewBox'),
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        width: style.width,
        height: style.height
      }
    })
    if (reference) expect(arrow).toEqual(reference)
    else reference = arrow
    await expect(foldControl).toHaveScreenshot(`heading-fold-hover-${host}.png`, {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.001
    })
  }
})

test('all host surfaces share document Find behavior', async ({ page }) => {
  for (const host of hosts) {
    await page.goto(`/?host=${host}`)
    if (host !== 'desktop-editor') {
      await expect(page.locator('[data-editor-tree-row]').first()).toBeVisible()
      await page.locator('[data-editor-tree-row]').first().click()
      await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
    }

    const editor = page.locator('.cm-content').first()
    await expect(editor).toBeVisible()
    await editor.click()
    await editor.press('Control+f')

    const findInput = page.getByPlaceholder('Find')
    await expect(findInput).toBeFocused()
    await findInput.fill('Live Drive verification')
    await expect(page.locator('.cm-vs-count')).toHaveText('1')
    await findInput.press('Escape')
    await expect(page.locator('.cm-vs-search')).toHaveCount(0)

    await editor.focus()
    await editor.press('Control+f')
    await expect(page.locator('.cm-vs-search')).toBeVisible()
    await editor.focus()
    await editor.press('Control+f')
    await expect(page.locator('.cm-vs-search')).toHaveCount(0)
  }
})

test('all host code fences copy their source', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  for (const host of hosts) {
    await page.goto(`/?host=${host}`)
    if (host !== 'desktop-editor') {
      await page.getByRole('treeitem', { name: 'Verification' }).click()
      await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
    }
    const copyButton = page.getByRole('button', { name: 'Copy typescript code' })
    await expect(copyButton).toBeVisible()
    await copyButton.click()
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe('const sharedEditor = true\n')
  }
})

test('Markdown scroll and caret state restore across reopen in all hosts', async ({ page }) => {
  for (const host of hosts) {
    await clearSavedEditorViews(page)
    await page.goto(`/?host=${host}&scenario=view-state`)
    if (host !== 'desktop-editor') {
      await page.getByRole('treeitem', { name: 'Verification' }).click()
      await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
    }
    const scroll = page.locator('[data-editor-markdown-scroll]')
    const editor = page.locator('.cm-content').first()
    await editor.click()
    await page.keyboard.press('Control+End')
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    const savedScroll = await scroll.evaluate((element) => element.scrollTop)
    await expect(editor).toBeFocused()
    expect(savedScroll).toBeGreaterThan(0)

    if (host === 'desktop-editor') {
      await page.waitForTimeout(800)
      await page.reload()
    } else {
      await page.getByRole('treeitem', { name: 'Readme', exact: true }).click()
      await expect(page.getByText('Readme preview', { exact: true })).toBeVisible()
      await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
    }

    await expect
      .poll(async () =>
        Math.abs((await scroll.evaluate((element) => element.scrollTop)) - savedScroll)
      )
      .toBeLessThanOrEqual(16, `scroll restoration failed for ${host}`)
    await page.locator('.cm-content').first().focus()
    await page.keyboard.type('X')
    await expect(page.locator('.cm-content').first()).toContainText('View state paragraph 90.X')
  }
})

test('both PKMS host surfaces rename Markdown documents from the shared title', async ({
  page
}) => {
  for (const host of hosts.filter((host) => host !== 'desktop-editor')) {
    await clearSavedEditorViews(page)
    await page.goto(`/?host=${host}&scenario=view-state`)
    if (host !== 'desktop-editor') {
      await expect(page.locator('[data-editor-tree-row]').first()).toBeVisible()
      await page.locator('[data-editor-tree-row]').first().click()
      await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
    }

    await page.locator('[data-editor-markdown-title]').first().click()
    const input = page.getByRole('textbox', { name: 'Markdown document title' })
    await expect(input).toBeFocused()
    await input.fill('Renamed parity note')
    await input.press('Enter')
    await expect(page.locator('[data-editor-markdown-title]:not(input)').first()).toHaveText(
      'Renamed parity note'
    )
    await expect(
      page.getByRole('treeitem', { name: 'Renamed parity note', exact: true })
    ).toBeVisible()

    const scroll = page.locator('[data-editor-markdown-scroll]').first()
    const editor = page.locator('.cm-content').first()
    await editor.click()
    await page.keyboard.press('Control+End')
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    const savedScroll = await scroll.evaluate((element) => element.scrollTop)
    expect(savedScroll).toBeGreaterThan(0)

    await page.getByRole('treeitem', { name: 'Readme', exact: true }).click()
    await expect(page.getByText('Readme preview', { exact: true })).toBeVisible()
    await page.getByRole('treeitem', { name: 'Renamed parity note', exact: true }).click()
    await expect(page.locator('[data-editor-markdown-title]').first()).toHaveText(
      'Renamed parity note'
    )
    await expect
      .poll(async () =>
        Math.abs((await scroll.evaluate((element) => element.scrollTop)) - savedScroll)
      )
      .toBeLessThanOrEqual(24)
    await editor.focus()
    await page.keyboard.type('X')
    await expect(editor).toContainText('View state paragraph 90.X')

    await page.locator('[data-editor-markdown-title]').first().click()
    await input.fill('Readme')
    await input.press('Enter')
    await expect(page.getByRole('alert')).toContainText('already exists')
    await expect(input).toHaveValue('Readme')
    await input.press('Escape')
    await expect(page.locator('[data-editor-markdown-title]:not(input)').first()).toHaveText(
      'Renamed parity note'
    )
  }
})

test('all host tree toolbars create folders and Markdown notes', async ({ page }) => {
  for (const host of hosts) {
    await page.goto(`/?host=${host}`)
    if (host !== 'desktop-editor') {
      await expect(page.locator('[data-editor-tree-row]').first()).toBeVisible()
      await page.locator('[data-editor-tree-row]').first().click()
      await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
    }

    await page.getByRole('button', { name: 'New folder' }).click()
    const folderInput = page.getByRole('textbox', { name: 'New folder name' })
    await folderInput.fill('')
    await folderInput.pressSequentially('Parity Folder')
    await expect(folderInput).toBeFocused()
    await folderInput.press('Enter')

    const createdPathsKey =
      host === 'desktop-editor'
        ? '__createdLocalPaths'
        : host === 'desktop-pkms-editor'
          ? '__createdDrivePaths'
          : '__createdPkmsPaths'
    await expect
      .poll(() => page.evaluate((key) => (window as any)[key], createdPathsKey))
      .toContain(host === 'web-pkms-editor' ? 'Verification/Parity Folder' : 'Parity Folder')
    await expect(page.getByRole('treeitem', { name: 'Parity Folder', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'New Markdown file' }).click()
    const fileInput = page.getByRole('textbox', { name: 'New file name' })
    await expect(fileInput).toHaveValue('Untitled.md')
    await fileInput.fill('')
    await fileInput.pressSequentially('Typed note.md')
    await expect(fileInput).toBeFocused()
    await fileInput.press('Enter')
    await expect
      .poll(() => page.evaluate((key) => (window as any)[key], createdPathsKey))
      .toContain(
        host === 'desktop-editor'
          ? 'Typed note.md'
          : host === 'desktop-pkms-editor'
            ? 'Typed note.md'
            : 'Verification/Typed note.md'
      )
    await expect(page.getByRole('treeitem', { name: /typed note/i })).toBeVisible()
  }
})

test('Desktop Drive folders open immediately while their create operation is uploading', async ({
  page
}) => {
  await page.goto('/?host=desktop-pkms-editor')
  await page.getByRole('button', { name: 'New folder' }).click()
  const name = page.getByRole('textbox', { name: 'New folder name' })
  await name.fill('Instant folder')
  await name.press('Enter')
  const folder = page.getByRole('treeitem', { name: 'Instant folder', exact: true })
  await expect(folder).toBeVisible()
  const itemId = await folder.getAttribute('data-editor-item-id')
  await folder.click()
  await expect(folder).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => (window as any).__driveDirectoryReads))
    .toContain(itemId)
})

test('all host tree context menus rename in place and Escape cancels', async ({ page }) => {
  for (const host of hosts) {
    await page.goto(`/?host=${host}`)
    const folder = page.getByRole('treeitem', { name: 'Verification' })
    await folder.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    const input = page.getByRole('textbox', { name: 'Rename Verification' })
    await expect(input).toHaveValue('Verification')
    await expect(input).toBeFocused()
    await input.press('Escape')
    await expect(input).toHaveCount(0)
    await expect(page.getByRole('treeitem', { name: 'Verification' })).toBeVisible()
  }
})

test('Desktop Drive tree keyboard navigation and overflow survive hide and reopen', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 600 })
  await page.goto('/?host=desktop-pkms-editor&scenario=tree-overflow')
  const tree = page.getByRole('tree', { name: 'PKMS Google Drive files' })
  const viewport = page.locator('[data-editor-tree-frame] > [data-editor-tree-content]').last()
  const header = page.locator('[data-editor-tree-toolbar]')
  const footer = page.locator('[data-editor-tree-frame] > [data-editor-tree-footer]')
  await expect(footer).toHaveCount(0)
  const folder = page.getByRole('treeitem', { name: 'Verification' })
  await folder.click()
  await expect(page.getByRole('treeitem', { name: 'Row 000', exact: true })).toBeVisible()

  await folder.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('treeitem', { name: 'Row 000', exact: true })).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('treeitem', { name: 'Row 000', exact: true })).toBeVisible()

  const firstRow = page.getByRole('treeitem', { name: 'Row 000', exact: true })
  await firstRow.focus()
  for (let index = 1; index <= 30; index += 1) {
    await page.keyboard.press('ArrowDown')
    await expect(
      page.getByRole('treeitem', { name: `Row ${String(index).padStart(3, '0')}`, exact: true })
    ).toBeFocused()
  }
  const scrollTop = await viewport.evaluate((element) => element.scrollTop)
  expect(scrollTop).toBeGreaterThan(0)
  const headerTop = await header.evaluate((element) => element.getBoundingClientRect().top)

  await page.keyboard.press('Control+\\')
  await expect(tree).not.toBeVisible()
  await page.waitForTimeout(200)
  await page.keyboard.press('Control+\\')
  await expect(tree).toBeVisible()
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(scrollTop)
  await expect(page.getByRole('treeitem', { name: 'Row 030', exact: true })).toBeVisible()
  expect(await header.evaluate((element) => element.getBoundingClientRect().top)).toBe(headerTop)
})

test('Desktop Drive folder context menu exposes and opens shared file actions', async ({
  page
}) => {
  await page.goto('/?host=desktop-pkms-editor')
  const folder = page.getByRole('treeitem', { name: 'Verification' })
  await folder.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Verification actions' })
  await expect(menu).toBeVisible()
  for (const label of [
    'Open folder',
    'New File',
    'New Folder',
    'Rename',
    'Move to trash',
    'Sync now'
  ])
    await expect(menu.getByRole('menuitem', { name: label })).toBeVisible()

  await expect(menu.getByRole('menuitem', { name: 'Open folder' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'New File' })).toBeFocused()
  await page.keyboard.press('Enter')
  const input = page.getByRole('textbox', { name: 'New file name' })
  await expect(input).toHaveValue('Untitled.md')
  await input.press('Escape')
  await expect(input).toHaveCount(0)

  await page.getByRole('treeitem', { name: 'Verification' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const renameInput = page.getByRole('textbox', { name: 'Rename Verification' })
  await expect(renameInput).toHaveValue('Verification')
  await renameInput.fill('Renamed Verification')
  await renameInput.press('Enter')
  await expect(
    page.getByRole('treeitem', { name: 'Renamed Verification', exact: true })
  ).toBeVisible()
})

test('PKMS context menus and editor chrome use the shared unboxed controls', async ({ page }) => {
  const menuChrome: string[][] = []
  for (const host of ['desktop-editor', 'desktop-pkms-editor', 'web-pkms-editor']) {
    await page.goto(`/?host=${host}`)
    await page.getByRole('treeitem', { name: 'Verification' }).click({ button: 'right' })
    const menu = page.locator('.context-menu, .tree-context-menu').first()
    await expect(menu).toBeVisible()
    menuChrome.push(
      await menu.evaluate((element) => {
        const item = element.querySelector('.context-menu-item, button') as HTMLElement
        const panelStyle = getComputedStyle(element)
        const itemStyle = getComputedStyle(item)
        return [
          panelStyle.borderWidth,
          panelStyle.borderRadius,
          panelStyle.padding,
          itemStyle.borderWidth,
          itemStyle.borderRadius,
          itemStyle.padding
        ]
      })
    )
    await page.keyboard.press('Escape')
  }
  expect(menuChrome[1]).toEqual(menuChrome[0])

  await page.goto('/?host=desktop-pkms-editor')
  await expect(page.locator('[data-drive-sync-state]')).toBeVisible()
  await page.getByRole('treeitem', { name: 'Verification' }).click()
  await page.getByRole('treeitem', { name: /Codex Drive smoke test/ }).click()
  await expect(page.locator('[data-editor-markdown-document]')).toBeVisible()
  await expect(page.locator('[data-editor-action-button]')).toBeVisible()
  const controlStyles = await Promise.all(
    ['[data-drive-sync-state]', '[data-editor-action-button]'].map((selector) =>
      page.locator(selector).evaluate((element) => {
        const style = getComputedStyle(element)
        return [style.padding, style.borderWidth, style.borderRadius]
      })
    )
  )
  expect(controlStyles).toEqual([
    ['0px', '0px', '0px'],
    ['0px', '0px', '0px']
  ])
})

test('Desktop Drive tree moves a file to the workspace root through its empty area', async ({
  page
}) => {
  await page.goto('/?host=desktop-pkms-editor')
  await page.getByRole('treeitem', { name: 'Verification' }).click()
  const file = page.getByRole('treeitem', { name: 'Readme', exact: true })
  const tree = page.getByRole('tree', { name: 'PKMS Google Drive files' })
  const box = await tree.boundingBox()
  if (!box) throw new Error('Drive tree has no visible drop area')
  await file.dragTo(tree, {
    targetPosition: { x: Math.max(20, box.width - 24), y: Math.max(24, box.height - 8) }
  })
  await expect(tree.getByRole('treeitem', { name: 'Readme', exact: true })).toHaveAttribute(
    'aria-level',
    '1'
  )
})
