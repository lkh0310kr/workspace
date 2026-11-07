#include "shim.h"

#include <QtWidgets/QApplication>
#include <QtGui/QMouseEvent>
#include <QtCore/QTimer>
#include <QtGui/QWheelEvent>
#include <QtGui/QKeyEvent>
#include <QtWidgets/QWidget>

namespace {

class EngineWidget : public QWidget {
public:
    InputCallback input_cb = nullptr;
    void *user_data = nullptr;
    bool looking = false;
    QPointF last_pos;

    EngineWidget() {
        setMouseTracking(true);
    }

    void mousePressEvent(QMouseEvent *event) override {
        if (event->button() == Qt::LeftButton) {
            looking = true;
        }
        last_pos = event->position();
        if (input_cb) {
            input_cb(kMouseDown, event->position().x(), event->position().y(), 0.0f, 0.0f, user_data);
        }
    }

    void mouseMoveEvent(QMouseEvent *event) override {
        QPointF pos = event->position();
        if (looking && input_cb) {
            input_cb(kMouseDrag, pos.x(), pos.y(), pos.x() - last_pos.x(), pos.y() - last_pos.y(), user_data);
            last_pos = pos;
        } else if (input_cb) {
            input_cb(kMouseMove, pos.x(), pos.y(), 0.0f, 0.0f, user_data);
        }
    }

    void mouseReleaseEvent(QMouseEvent *event) override {
        if (event->button() == Qt::LeftButton) {
            looking = false;
        }
        if (input_cb) {
            input_cb(kMouseUp, event->position().x(), event->position().y(), 0.0f, 0.0f, user_data);
        }
    }

    void wheelEvent(QWheelEvent *event) override {
        if (input_cb) {
            input_cb(kWheel, 0.0f, 0.0f, 0.0f, static_cast<float>(event->angleDelta().y()), user_data);
        }
    }

    void keyPressEvent(QKeyEvent *event) override {
        if (input_cb && !event->isAutoRepeat()) {
            input_cb(kKeyDown, static_cast<float>(event->key()), 0.0f, 0.0f, 0.0f, user_data);
        }
    }

    void keyReleaseEvent(QKeyEvent *event) override {
        if (input_cb && !event->isAutoRepeat()) {
            input_cb(kKeyUp, static_cast<float>(event->key()), 0.0f, 0.0f, 0.0f, user_data);
        }
    }
};

} // namespace

static EngineWidget *g_engine_widget = nullptr;

void qt_set_window_title(const char *text) {
    if (g_engine_widget) {
        g_engine_widget->setWindowTitle(QString::fromUtf8(text ? text : "World Engine"));
    }
}

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
    g_engine_widget = &window;
    window.resize(width, height);
    window.setWindowTitle("World Engine");
    window.setAttribute(Qt::WA_OpaquePaintEvent);
    window.setAttribute(Qt::WA_NoSystemBackground);
    window.setFocusPolicy(Qt::StrongFocus);
    window.setFocus();
    window.input_cb = input_cb;
    window.user_data = user_data;
    window.show();

    window.winId();
    QApplication::processEvents();

    void *native_handle = reinterpret_cast<void *>(window.winId());
    init_cb(native_handle, user_data);

    QTimer timer;
    QObject::connect(&timer, &QTimer::timeout, [=]() { frame_cb(user_data); });
    timer.start(33);

    app.exec();
}
