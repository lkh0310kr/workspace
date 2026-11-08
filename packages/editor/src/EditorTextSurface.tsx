import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { Annotation, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { createEditorView, replaceEditorDocument } from "./codeMirror";

export const externalEditorChange = Annotation.define<boolean>();

export interface EditorTextSurfaceProps {
  /** Omit value for hosts that load documents through an EditorDocumentSession. */
  value?: string;
  initialValue?: string;
  extensions: readonly Extension[];
  onChange?: (value: string, view: EditorView) => void;
  onViewReady?: (view: EditorView | null) => void;
  className?: string;
  ariaLabel?: string;
  spellcheck?: boolean;
  autocapitalize?: string;
}

/** Shared CodeMirror owner for both products; hosts contribute feature extensions. */
export function EditorTextSurface({
  value,
  initialValue,
  extensions,
  onChange,
  onViewReady,
  className,
  ariaLabel,
  spellcheck,
  autocapitalize,
}: EditorTextSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onViewReadyRef = useRef(onViewReady);
  onChangeRef.current = onChange;
  onViewReadyRef.current = onViewReady;

  useEffect(() => {
    if (!hostRef.current) return;
    const attributes: Record<string, string> = {};
    if (ariaLabel) attributes["aria-label"] = ariaLabel;
    if (spellcheck !== undefined) attributes.spellcheck = String(spellcheck);
    if (autocapitalize) attributes.autocapitalize = autocapitalize;
    const hostExtensions: Extension[] = [...extensions];
    if (Object.keys(attributes).length) hostExtensions.push(EditorView.contentAttributes.of(attributes));
    hostExtensions.push(
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || update.transactions.some((transaction) => transaction.annotation(externalEditorChange))) return;
        onChangeRef.current?.(update.state.doc.toString(), update.view);
      }),
    );
    const view = createEditorView({
      parent: hostRef.current,
      doc: initialValue ?? value ?? "",
      extensions: [
        history(),
        ...hostExtensions,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
      ],
    });
    viewRef.current = view;
    onViewReadyRef.current?.(view);
    return () => {
      onViewReadyRef.current?.(null);
      viewRef.current = null;
      view.destroy();
    };
    // Editor extensions define the lifetime of this view; change the host key when their mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === undefined || view.state.doc.toString() === value) return;
    replaceEditorDocument(view, value, externalEditorChange);
  }, [value]);

  return <div ref={hostRef} className={className} />;
}
