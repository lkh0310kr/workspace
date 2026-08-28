#include "shim.h"

#include <QtWidgets/QApplication>
#include <QtGui/QMouseEvent>
#include <QtCore/QTimer>
#include <QtGui/QWheelEvent>
#include <QtWidgets/QWidget>

namespace {

// Plain QWidget subclass overriding event virtuals — no Q_OBJECT/moc
// needed since we add no new signals/slots/properties, just react to
// ones QWidget already has.
class EngineWidget : public QWidget {
public:
    InputCallback input_cb = nullptr;
    void *user_data = nullptr;
    bool dragging = false;
    QPointF last_pos;

    void mousePressEvent(QMouseEvent *event) override {
        dragging = true;
        last_pos = event->position();
        if (input_cb) {
            input_cb(kMouseDown, event->position().x(), event->position().y(), 0.0f, 0.0f, user_data);
        }
    }

    void mouseMoveEvent(QMouseEvent *event) override {
        if (dragging && input_cb) {
            QPointF pos = event->position();
            input_cb(kMouseDrag, pos.x(), pos.y(), pos.x() - last_pos.x(), pos.y() - last_pos.y(), user_data);
            last_pos = pos;
        }
    }

    void mouseReleaseEvent(QMouseEvent *event) override {
        dragging = false;
        if (input_cb) {
            input_cb(kMouseUp, event->position().x(), event->position().y(), 0.0f, 0.0f, user_data);
        }
    }

    void wheelEvent(QWheelEvent *event) override {
        if (input_cb) {
            input_cb(kWheel, 0.0f, 0.0f, 0.0f, static_cast<float>(event->angleDelta().y()), user_data);
        }
    }
};

} // namespace

void qt_run(
    int width,
    int height,
    InitCallback init_cb,
    FrameCallback frame_cb,
    InputCallback input_cb,
    void *user_data
) {
    int argc = 1;
    char arg0[] = "world-engine-qt-shell";
    char *argv[] = {arg0, nullptr};
    QApplication app(argc, argv);

    EngineWidget window;
    window.resize(width, height);
    window.setWindowTitle("World Engine — native window, wgpu direct render");
    // No Qt-drawn content at all: wgpu renders directly into this
    // widget's native view every frame. Disabling the system background
    // paint avoids Qt fighting wgpu for the same surface between frames.
    window.setAttribute(Qt::WA_OpaquePaintEvent);
    window.setAttribute(Qt::WA_NoSystemBackground);
    window.input_cb = input_cb;
    window.user_data = user_data;
    window.show();

    // WId is Qt's cross-platform native handle typedef — on macOS this
    // is the NSView* backing the widget, valid once the widget has a
    // real native window (guaranteed after show()).
    void *native_handle = reinterpret_cast<void *>(window.winId());
    init_cb(native_handle, user_data);

    QTimer timer;
    QObject::connect(&timer, &QTimer::timeout, [=]() { frame_cb(user_data); });
    timer.start(33); // ~30fps

    app.exec();
}
