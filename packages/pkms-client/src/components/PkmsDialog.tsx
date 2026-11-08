import { useEffect, useRef, useState } from "react";

export type PkmsDialogRequest =
  | { kind: "name"; title: string; initialValue: string; resolve: (value: string | null) => void }
  | { kind: "confirm"; message: string; resolve: (value: boolean) => void };

interface Props {
  request: PkmsDialogRequest | null;
  onClose: () => void;
}

export function PkmsDialog({ request, onClose }: Props): React.JSX.Element | null {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (request?.kind !== "name") return;
    setValue(request.initialValue);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [request]);

  if (!request) return null;

  const cancel = () => {
    if (request.kind === "name") request.resolve(null);
    else request.resolve(false);
    onClose();
  };

  return <div className="modal-backdrop dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) cancel(); }} onKeyDown={(event) => { if (event.key === "Escape") cancel(); }}>
    <section className="pkms-dialog" role="dialog" aria-modal="true" aria-label={request.kind === "name" ? request.title : "Confirm action"}>
      {request.kind === "name" ? <form onSubmit={(event) => { event.preventDefault(); request.resolve(value.trim()); onClose(); }}>
        <h2>{request.title}</h2>
        <input ref={inputRef} autoFocus value={value} onChange={(event) => setValue(event.target.value)} aria-label={request.title} />
        <div className="pkms-dialog-actions"><button type="button" className="secondary-button" onClick={cancel}>Cancel</button><button type="submit" className="primary-button" disabled={!value.trim()}>{request.title.toLowerCase().includes("folder") ? "Create" : "Save"}</button></div>
      </form> : <>
        <h2>Confirm</h2>
        <p>{request.message}</p>
        <div className="pkms-dialog-actions"><button className="secondary-button" onClick={cancel}>Cancel</button><button className="primary-button danger-button" onClick={() => { request.resolve(true); onClose(); }}>Delete</button></div>
      </>}
    </section>
  </div>;
}
