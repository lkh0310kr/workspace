import SwiftUI
import UIKit

/// Full-screen image viewer with native pinch, pan, and double-tap zoom gestures.
struct ZoomableImageViewer: View {
    let image: UIImage
    let accessibilityLabel: String

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        GeometryReader { geometry in
            ZoomableImageScrollView(image: image, accessibilityLabel: accessibilityLabel)
                .frame(width: geometry.size.width, height: geometry.size.height)
                .background(Color.black)
                .overlay(alignment: .topTrailing) {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 42, height: 42)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .accessibilityLabel("Close image")
                    .padding(.top, geometry.safeAreaInsets.top + 8)
                    .padding(.trailing, 16)
                }
                .ignoresSafeArea()
        }
        .background(Color.black.ignoresSafeArea())
        .statusBarHidden()
        .preferredColorScheme(.dark)
    }
}

private struct ZoomableImageScrollView: UIViewRepresentable {
    let image: UIImage
    let accessibilityLabel: String

    func makeUIView(context: Context) -> ZoomScrollView {
        ZoomScrollView(image: image, accessibilityLabel: accessibilityLabel)
    }

    func updateUIView(_ scrollView: ZoomScrollView, context: Context) {
        scrollView.setImage(image, accessibilityLabel: accessibilityLabel)
    }
}

private final class ZoomScrollView: UIScrollView, UIScrollViewDelegate {
    private let imageView = UIImageView()
    private var displayedImage: UIImage
    private var lastBoundsSize = CGSize.zero

    init(image: UIImage, accessibilityLabel: String) {
        displayedImage = image
        super.init(frame: .zero)

        backgroundColor = .black
        delegate = self
        minimumZoomScale = 1
        maximumZoomScale = 6
        bouncesZoom = true
        showsHorizontalScrollIndicator = false
        showsVerticalScrollIndicator = false
        contentInsetAdjustmentBehavior = .never
        imageView.image = image
        imageView.contentMode = .scaleToFill
        imageView.isAccessibilityElement = true
        imageView.accessibilityLabel = accessibilityLabel
        addSubview(imageView)

        let doubleTap = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
        doubleTap.numberOfTapsRequired = 2
        addGestureRecognizer(doubleTap)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.size != lastBoundsSize, bounds.width > 0, bounds.height > 0 else { return }
        lastBoundsSize = bounds.size
        fitImage()
    }

    func setImage(_ image: UIImage, accessibilityLabel: String) {
        guard displayedImage !== image else {
            imageView.accessibilityLabel = accessibilityLabel
            return
        }
        displayedImage = image
        imageView.image = image
        imageView.accessibilityLabel = accessibilityLabel
        lastBoundsSize = .zero
        setNeedsLayout()
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        centerImageWhenSmallerThanViewport()
    }

    @objc private func handleDoubleTap(_ gesture: UITapGestureRecognizer) {
        if zoomScale > minimumZoomScale + 0.05 {
            setZoomScale(minimumZoomScale, animated: true)
            return
        }
        let point = gesture.location(in: imageView)
        let targetScale: CGFloat = 2.5
        let size = CGSize(width: bounds.width / targetScale, height: bounds.height / targetScale)
        let rect = CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2,
                          width: size.width, height: size.height)
        zoom(to: rect, animated: true)
    }

    private func fitImage() {
        let imageSize = displayedImage.size
        guard imageSize.width > 0, imageSize.height > 0 else { return }
        let scale = min(bounds.width / imageSize.width, bounds.height / imageSize.height)
        let fittedSize = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
        imageView.frame = CGRect(origin: .zero, size: fittedSize)
        contentSize = fittedSize
        minimumZoomScale = 1
        maximumZoomScale = 6
        zoomScale = 1
        centerImageWhenSmallerThanViewport()
    }

    private func centerImageWhenSmallerThanViewport() {
        let horizontal = max((bounds.width - contentSize.width) / 2, 0)
        let vertical = max((bounds.height - contentSize.height) / 2, 0)
        contentInset = UIEdgeInsets(top: vertical, left: horizontal, bottom: vertical, right: horizontal)
    }
}
