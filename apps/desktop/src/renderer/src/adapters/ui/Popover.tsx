import { Popover as SharedPopover } from '@workspace/ui'
import type { PopoverProps } from '@workspace/ui'
import { interactionCoordinator } from '../../interaction/portals/InteractionCoordinator'

export { shouldDismissPopoverPointerDown } from '@workspace/ui'
export type { AnchorRect } from '@workspace/ui'

type DesktopPopoverProps = Omit<PopoverProps, 'registerPortal'>

// Keep this capability stable across renders. Registering or removing a
// portal notifies the coordinator, which rerenders pane visibility consumers.
function registerDesktopPortal(id: string, onDismiss: () => void): () => void {
  return interactionCoordinator.registerPortal(id, onDismiss)
}

export function Popover(props: DesktopPopoverProps) {
  return (
    <SharedPopover
      {...props}
      registerPortal={registerDesktopPortal}
    />
  )
}
