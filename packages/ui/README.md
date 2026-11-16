# @workspace/ui

renderer 공통 UI primitive 패키지다. `context-menu/`, `menu-list/`, `popover/`가 각각 UI와 전용 스타일을 소유하고, feature 간 공유 설정 패널 스타일은 `@workspace/ui/settings.css`로 제공한다. component는 portal 등록·아이콘 렌더링 같은 host capability를 props로 받으며 Desktop 상태, feature package, IPC에 의존하지 않는다. 상세한 제품 기능 동작은 각 기능 package의 문서가 소유한다. 기존 package subpath는 호환을 위해 유지한다.
