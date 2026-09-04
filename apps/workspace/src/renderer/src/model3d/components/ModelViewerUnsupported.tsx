interface Props {
  variant?: "unsupported" | "error";
  message: string;
}

export function ModelViewerUnsupported({ variant = "unsupported", message }: Props) {
  const title =
    variant === "error" ? "모델을 불러오지 못했습니다" : "미리보기 변환 준비 중";
  return (
    <div className="model-viewer-unsupported" role="alert">
      <p className="model-viewer-unsupported-title">{title}</p>
      <p className="model-viewer-unsupported-body">{message}</p>
    </div>
  );
}
