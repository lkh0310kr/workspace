import { EditorNameForm } from "@workspace/editor";

export type PkmsDialogRequest =
  | { kind: "name"; title: string; initialValue: string; resolve: (value: string | null) => void }
  | { kind: "confirm"; message: string; resolve: (value: boolean) => void };

interface Props {
  request: PkmsDialogRequest | null;
  onClose: () => void;
}

export function PkmsDialog({ request, onClose }: Props): React.JSX.Element | null {
  if (!request) return null;

  const cancel = () => {
    if (request.kind === "name") request.resolve(null);
    else request.resolve(false);
    onClose();
  };

  return <div className="modal-backdrop dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) cancel(); }} onKeyDown={(event) => { if (event.key === "Escape") cancel(); }}>
    <section className="pkms-dialog" role="dialog" aria-modal="true" aria-label={request.kind === "name" ? request.title : "Confirm action"}>
      {request.kind === "name" ? <EditorNameForm
        key={`${request.title}:${request.initialValue}`}
        title={request.title}
        initialValue={request.initialValue}
        submitLabel={request.title.toLowerCase().includes("folder") ? "Create" : "Save"}
        titleTag="h2"
        actionsClassName="pkms-dialog-actions"
        cancelButtonClassName="secondary-button"
        submitButtonClassName="primary-button"
        selectInitialValue={Boolean(request.initialValue)}
        onSubmit={(value) => { request.resolve(value); onClose(); }}
        onCancel={cancel}
      /> : <>
        <h2>Confirm</h2>
        <p>{request.message}</p>
        <div className="pkms-dialog-actions"><button className="secondary-button" onClick={cancel}>Cancel</button><button className="primary-button danger-button" onClick={() => { request.resolve(true); onClose(); }}>Delete</button></div>
      </>}
    </section>
  </div>;
}
