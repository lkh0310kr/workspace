import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { historyField } from "@codemirror/commands";
import { Annotation, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { createEditorView, replaceEditorDocument } from "./codeMirror";
import { readEditorViewState, writeEditorViewState } from "./viewStateCache";

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
  /** Stable provider item identity, used to retain cursor, selection, scroll, and undo history. */
  documentKey?: string;
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
  documentKey,
}: EditorTextSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const documentKeyRef = useRef(documentKey);
  const viewExtensionsRef = useRef<Extension[]>([]);
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
    const cached = documentKey ? readEditorViewState(documentKey) : undefined;
    let restoredState: EditorState | undefined;
    if (cached) {
      try {
        restoredState = EditorState.fromJSON(cached.serialized, { extensions: [
          history(), ...hostExtensions, keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), EditorView.lineWrapping,
        ] }, { history: historyField });
      } catch {
        restoredState = undefined;
      }
    }
    const viewExtensions = [
      history(),
      ...hostExtensions,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.lineWrapping,
    ];
    viewExtensionsRef.current = viewExtensions;
    const view = createEditorView({
      parent: hostRef.current,
      doc: initialValue ?? value ?? "",
      state: restoredState,
      extensions: viewExtensions,
    });
    viewRef.current = view;
    if (cached) {
      requestAnimationFrame(() => {
        if (viewRef.current === view) {
          view.scrollDOM.scrollTop = cached.scrollTop;
          view.scrollDOM.scrollLeft = cached.scrollLeft;
        }
      });
    }
    onViewReadyRef.current?.(view);
    return () => {
      if (documentKeyRef.current) writeEditorViewState(documentKeyRef.current, view.state, view.scrollDOM.scrollTop, view.scrollDOM.scrollLeft);
      onViewReadyRef.current?.(null);
      viewRef.current = null;
      view.destroy();
    };
    // Editor extensions define the lifetime of this view; change the host key when their mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const previousKey = documentKeyRef.current;
    if (previousKey === documentKey) return;
    const view = viewRef.current;
    if (!view) {
      documentKeyRef.current = documentKey;
      return;
    }
    if (previousKey) writeEditorViewState(previousKey, view.state, view.scrollDOM.scrollTop, view.scrollDOM.scrollLeft);
    documentKeyRef.current = documentKey;

    const cached = documentKey ? readEditorViewState(documentKey) : undefined;
    let nextState: EditorState | undefined;
    if (cached) {
      try {
        nextState = EditorState.fromJSON(cached.serialized, { extensions: viewExtensionsRef.current }, { history: historyField });
      } catch {
        nextState = undefined;
      }
    }
    view.setState(nextState ?? EditorState.create({ doc: "", extensions: viewExtensionsRef.current }));
    view.scrollDOM.scrollTop = cached?.scrollTop ?? 0;
    view.scrollDOM.scrollLeft = cached?.scrollLeft ?? 0;
  }, [documentKey]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === undefined || view.state.doc.toString() === value) return;
    replaceEditorDocument(view, value, externalEditorChange);
  }, [value]);

  return <div ref={hostRef} className={className} />;
}
