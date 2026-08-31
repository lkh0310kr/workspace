interface Props {
  label: string;
}

export function ModelViewerLoading({ label }: Props) {
  return (
    <div className="model-viewer-loading" role="status">
      <div className="model-viewer-spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
