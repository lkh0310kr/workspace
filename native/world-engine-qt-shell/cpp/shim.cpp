#include "shim.h"

#include <QtWidgets/QApplication>
#include <QtCore/QTimer>
#include <QtWidgets/QWidget>

void qt_run(int width, int height, InitCallback init_cb, FrameCallback frame_cb, void *user_data) {
    int argc = 1;
    char arg0[] = "world-engine-qt-shell";
    char *argv[] = {arg0, nullptr};
    QApplication app(argc, argv);

    QWidget window;
    window.resize(width, height);
    window.setWindowTitle("World Engine — Qt shell (Phase 1 spike)");
    // No Qt-drawn content at all: wgpu renders directly into this
    // widget's native view every frame. Disabling the system background
    // paint avoids Qt fighting wgpu for the same surface between frames.
    window.setAttribute(Qt::WA_OpaquePaintEvent);
    window.setAttribute(Qt::WA_NoSystemBackground);
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
