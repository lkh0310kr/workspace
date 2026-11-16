import { ContextMenu as SharedContextMenu } from '@workspace/ui/ContextMenu'
import type { ContextMenuHost, ContextMenuProps } from '@workspace/ui/ContextMenu'
import { interactionCoordinator } from '../../interaction/portals/InteractionCoordinator'
import { isWorkbenchIconName, WorkbenchIcon } from './WorkbenchIcon'

const desktopContextMenuHost: ContextMenuHost = {
  registerPortal: (id, onDismiss) => interactionCoordinator.registerPortal(id, onDismiss),
  renderIcon: (icon) => (isWorkbenchIconName(icon) ? <WorkbenchIcon name={icon} /> : icon)
}

export type { ContextMenuItem } from '@workspace/ui/ContextMenu'

export function ContextMenu(props: Omit<ContextMenuProps, 'host'>) {
  return <SharedContextMenu {...props} host={desktopContextMenuHost} />
}
