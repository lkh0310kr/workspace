use std::{cell::RefCell, fmt::format, path::PathBuf, print, println, rc::Rc};

use slint::{ModelRc, VecModel};

slint::include_modules!();

type WorkspaceId = i32;

struct Workspace {
    id: WorkspaceId,
    root_path: PathBuf,
    tabs: Vec<Tab>,
    active_tab_id: TabId,
}

impl Workspace {
    fn new() -> Self {
        Self {
            id: 0,
            root_path: PathBuf::from("."),
            tabs: Vec::new(),
            active_tab_id: 0,
        }
    }

    fn add_tab(&mut self) {
        let id = self.tabs.len() as TabId;
        self.tabs.push(Tab {
            id: id,
            title: format!("Tab {}", id + 1),
            layout: Layout::Pane(Pane {
                id,
                content: Content::Terminal(Terminal {}),
            }),
        });

        println!("{}", id);

        self.active_tab_id = id;
    }

    fn select_tab(&mut self, tab_id: TabId) {
        self.active_tab_id = tab_id;
    }

    fn close_tab(self) {}

    // getters
    fn tab_titles(&self) -> ModelRc<slint::SharedString> {
        let model = VecModel::from(
            self.tabs
                .iter()
                .map(|tab| tab.title.clone().into())
                .collect::<Vec<slint::SharedString>>(),
        );

        ModelRc::new(model)
    }
}

type TabId = i32;

struct Tab {
    id: i32,
    title: String,
    layout: Layout,
}

type PaneId = i32;

enum Layout {
    Pane(Pane),
    Split(Split),
}

struct Pane {
    id: PaneId,
    content: Content,
}

struct Split {
    direction: Direction,
    children: Vec<SplitChild>,
}

struct SplitChild {
    layout: Layout,
    ratio: f32,
}

enum Direction {
    Horizontal,
    Vertical,
}

enum Content {
    Browser(Browser),
    CodeEditor(CodeEditor),
    MarkdownEditor(MarkdownEditor),
    Terminal(Terminal),
}

struct Browser {}

struct CodeEditor {}

struct MarkdownEditor {}

struct Terminal {}

fn main() -> Result<(), slint::PlatformError> {
    let ui = AppWindow::new()?;

    let workspace = Rc::new(RefCell::new(Workspace::new()));

    // initialize
    {
        let mut workspace = workspace.borrow_mut();
        workspace.add_tab();

        ui.set_tabs(workspace.tab_titles());
        ui.set_active_tab(workspace.active_tab_id);
    }

    // on_add_tab
    {
        let workspace = Rc::clone(&workspace);
        let ui_weak = ui.as_weak();

        ui.on_add_tab(move || {
            let ui = ui_weak.unwrap();
            let mut workspace = workspace.borrow_mut();

            workspace.add_tab();

            ui.set_tabs(workspace.tab_titles());
            ui.set_active_tab(workspace.active_tab_id);
        });
    }

    {
        ui.on_select_tab(|index| {
            println!("select tab: {index}");
        });
    }

    ui.on_close_tab(|index| {
        println!("close tab: {index}");
    });

    ui.run()
}
