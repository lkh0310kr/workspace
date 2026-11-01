import SwiftUI
import UIKit

/// Displays an image referenced from Markdown: a vault asset (relative path or `![[wiki embed]]`)
/// or a remote URL. Tapping opens a full-screen pinch-zoom viewer.
struct VaultImageView: View {
    let source: String
    let alt: String

    @Environment(VaultStore.self) private var store
    @Environment(\.markdownDocumentPath) private var documentPath
    @State private var image: UIImage?
    @State private var isLoading = true
    @State private var failed = false
    @State private var zoomImage: ZoomImage?

    var body: some View {
        Group {
            if let image {
                Button {
                    zoomImage = ZoomImage(image: image, label: alt.isEmpty ? source : alt)
                } label: {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(image.size.width / max(image.size.height, 1), contentMode: .fit)
                        // Keep small assets at their natural size and align every image to the text edge.
                        .frame(maxWidth: max(image.size.width, 1), alignment: .leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(alt.isEmpty ? source : alt)
                .accessibilityHint("Opens the image viewer. Pinch to zoom.")
            } else if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 120, alignment: .center)
            } else if failed {
                placeholder
            }
        }
        .clipShape(.rect(cornerRadius: 8))
        .task(id: "\(source)|\(documentPath.string)|\(store.revision)") { await loadImage() }
        .fullScreenCover(item: $zoomImage) { item in
            ZoomableImageViewer(image: item.image, accessibilityLabel: item.label)
        }
    }

    private var placeholder: some View {
        Label(alt.isEmpty ? source : alt, systemImage: "photo")
            .font(.callout)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
            .padding(.horizontal, 12)
            .background(Color(.secondarySystemBackground))
            .accessibilityLabel("Image unavailable: \(alt.isEmpty ? source : alt)")
    }

    private var remoteURL: URL? {
        guard let url = URL(string: source), let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else { return nil }
        return url
    }

    @MainActor
    private func loadImage() async {
        image = nil
        failed = false
        isLoading = true
        defer { isLoading = false }

        let data: Data?
        if let remoteURL {
            guard let (payload, response) = try? await URLSession.shared.data(from: remoteURL),
                  (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) == true else {
                failed = true
                return
            }
            data = payload
        } else {
            let wikiTarget = WikiLink.target(in: source)
            guard let path = store.index.resolve(wikiTarget ?? source, from: documentPath, isWikiLink: wikiTarget != nil),
                  let payload = try? await store.repository.readData(at: path) else {
                failed = true
                return
            }
            data = payload
        }

        guard let data else {
            failed = true
            return
        }
        let decoded = await Task.detached(priority: .userInitiated) {
            UIImage(data: data)?.preparingForDisplay()
        }.value
        guard !Task.isCancelled else { return }
        if let decoded { image = decoded } else { failed = true }
    }
}

private struct ZoomImage: Identifiable {
    let id = UUID()
    let image: UIImage
    let label: String
}
