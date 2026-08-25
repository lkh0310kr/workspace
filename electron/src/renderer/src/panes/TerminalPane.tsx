import { memo } from "react";
import { TerminalSurface } from "./TerminalSurface";

interface Props {
  terminalId: number;
  visible: boolean;
  active: boolean;
  zoom?: number;
}

function TerminalPaneInner({ terminalId, visible, active, zoom = 1 }: Props) {
  return (
    <TerminalSurface terminalId={terminalId} visible={visible} active={active} zoom={zoom} />
  );
}

export const TerminalPane = memo(TerminalPaneInner);
