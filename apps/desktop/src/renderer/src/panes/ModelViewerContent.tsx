import type { DetectedModelFormat, SceneManifest } from '../../../shared/model3d/types'
import type { ReactNode } from 'react'
import { ModelViewerCanvas } from '../model3d/components/ModelViewerCanvas'
import { ModelViewerLoading } from '../model3d/components/ModelViewerLoading'
import { ModelViewerUnsupported } from '../model3d/components/ModelViewerUnsupported'
import { useModelPreview } from '../model3d/import/useModelPreview'

interface Props {
  tabId: number
  filePath: string | null
  paneActive: boolean
}

function viewerFormat(manifest: SceneManifest | null): DetectedModelFormat {
  if (manifest?.status === 'ready') {
    return manifest.renderFormat ?? manifest.source.format
  }
  return 'glb'
}

export function ModelViewerContent({ tabId, filePath, paneActive }: Props) {
  const preview = useModelPreview(tabId, filePath)

  let body: ReactNode
  if (preview.phase === 'opening') {
    body = <ModelViewerLoading label="Opening model…" />
  } else if (preview.phase === 'loading') {
    body = <ModelViewerLoading label="Loading model…" />
  } else if (preview.phase === 'unsupported') {
    body = (
      <ModelViewerUnsupported
        variant="unsupported"
        message={preview.error ?? '이 포맷은 아직 지원되지 않습니다.'}
      />
    )
  } else if (preview.phase === 'error') {
    body = (
      <ModelViewerUnsupported
        variant="error"
        message={preview.error ?? '모델을 불러오지 못했습니다.'}
      />
    )
  } else if (preview.phase === 'ready' && (preview.modelData || preview.modelUrl)) {
    body = (
      <ModelViewerCanvas
        key={preview.revision}
        modelData={preview.modelData ?? undefined}
        modelUrl={preview.modelUrl ?? undefined}
        format={viewerFormat(preview.manifest)}
        active={paneActive}
        live
        refreshing={preview.refreshing}
        refreshError={preview.error}
      />
    )
  } else {
    body = <ModelViewerLoading label="Preparing viewer…" />
  }

  return (
    <div className="model-viewer file-viewer">
      <div className="model-viewer-body">{body}</div>
    </div>
  )
}
