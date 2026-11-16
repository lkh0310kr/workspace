const IMAGE_TYPES: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp'
}

export function editorAssetContentType(path: string, contentType: string): string {
  if (contentType.startsWith('image/')) return contentType
  const extension = path.split('.').at(-1)?.toLowerCase()
  return IMAGE_TYPES[extension ?? ''] ?? contentType
}
