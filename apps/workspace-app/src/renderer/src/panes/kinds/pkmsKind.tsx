import { PkmsPane } from "../pkms/PkmsPane";
import type { PaneKindDefinition } from "../paneKindRegistry";

export const pkmsPaneKind: PaneKindDefinition = {
  kind: "pkms",
  label: "PKMS",
  icon: "book",
  pickerEntries: [{ label: "PKMS", icon: "book" }],
  createItem(id) {
    return { id, kind: "pkms" };
  },
  tabLabel() {
    return "PKMS";
  },
  render() {
    return <PkmsPane />;
  },
};
