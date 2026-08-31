import { useRef } from 'react'
import { Layout, type Model } from 'flexlayout-react'
import type { TabInfo } from '../electron'
import { workspaceTabHostStyle } from '../interaction/embedPolicy'
import type { useLayoutHostCallbacks } from '../hooks/useLayoutHostCallbacks'

type LayoutCallbacks = ReturnType<typeof useLayoutHostCallbacks>

type Props = {
  tabs: TabInfo[]
  visibleWorkspaceTabId: number
  getModel: (tabId: number) => Model | undefined
} & Pick<
  LayoutCallbacks,
  | 'makeFactory'
  | 'makeOnAction'
  | 'makeOnModelChange'
  | 'makeOnRenderTabSet'
  | 'getLayoutRefCallback'
>

export function WorkspaceLayoutHost({
  tabs,
  visibleWorkspaceTabId,
  getModel,
  makeFactory,
  makeOnAction,
  makeOnModelChange,
  makeOnRenderTabSet,
  getLayoutRefCallback
}: Props) {
  return (
    <div className="layout-host">
      {tabs.map((tab) => {
        const model = getModel(tab.id)
        if (!model) return null
        const active = tab.id === visibleWorkspaceTabId
        return (
          <WorkspaceTabLayoutItem
            key={tab.id}
            tab={tab}
            model={model}
            active={active}
            makeFactory={makeFactory}
            makeOnAction={makeOnAction}
            makeOnModelChange={makeOnModelChange}
            makeOnRenderTabSet={makeOnRenderTabSet}
            getLayoutRefCallback={getLayoutRefCallback}
          />
        )
      })}
    </div>
  )
}

function WorkspaceTabLayoutItem({
  tab,
  model,
  active,
  makeFactory,
  makeOnAction,
  makeOnModelChange,
  makeOnRenderTabSet,
  getLayoutRefCallback
}: {
  tab: TabInfo
  model: Model
  active: boolean
} & Pick<
  Props,
  | 'makeFactory'
  | 'makeOnAction'
  | 'makeOnModelChange'
  | 'makeOnRenderTabSet'
  | 'getLayoutRefCallback'
>) {
  const shellRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className={`layout-host-item${active ? ' layout-host-item--active' : ''}`}
      data-workspace-tab-id={tab.id}
      style={workspaceTabHostStyle(active)}
    >
      <div ref={shellRef} className="workspace-tab-shell">
        <div className="workspace-tab-layout">
          <Layout
            ref={getLayoutRefCallback(tab.id)}
            model={model}
            factory={makeFactory(tab.id)}
            onRenderTabSet={makeOnRenderTabSet(tab.id)}
            onAction={makeOnAction(tab.id)}
            onModelChange={makeOnModelChange(tab.id)}
            realtimeResize
            tabDragSpeed={0}
          />
        </div>
      </div>
    </div>
  )
}
