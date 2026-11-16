import { Popover as SharedPopover } from '@workspace/ui'
import type { PopoverProps } from '@workspace/ui'
import { interactionCoordinator } from '../interaction/InteractionCoordinator'

export { shouldDismissPopoverPointerDown } from '@workspace/ui'
export type { AnchorRect } from '@workspace/ui'

type DesktopPopoverProps = Omit<PopoverProps, 'registerPortal'>

export function Popover(props: DesktopPopoverProps) {
  return (
    <SharedPopover
      {...props}
      registerPortal={(id, onDismiss) => interactionCoordinator.registerPortal(id, onDismiss)}
    />
  )
}
