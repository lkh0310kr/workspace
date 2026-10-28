import { useState } from "react";
import { addTab, type TabInfo } from "../electron";
import { switchToWorkspaceTab } from "../workspaceNavigation";
import { ClockWidget } from "./widgets/ClockWidget";
import { EconomyWidget } from "./widgets/EconomyWidget";
import { NewspaperWidget, type NewspaperHeadline } from "./widgets/NewspaperWidget";
import { NotificationCenterWidget } from "./widgets/NotificationCenterWidget";
import { WeatherWidget } from "./widgets/WeatherWidget";

function greetingForHour(hour: number): string {
  if (hour < 11) return "좋은 아침이에요";
  if (hour < 18) return "오늘도 잘 오셨어요";
  return "수고 많으셨어요";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ko-KR", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function DashboardView({ tabs }: { tabs: TabInfo[] }): React.JSX.Element {
  const [feedHeadlines, setFeedHeadlines] = useState<NewspaperHeadline[]>([]);
  const now = new Date();

  return (
    <div className="dashboard-view scroll-region">
      <div className="dashboard-view-inner">
        <header className="home-masthead">
          <div className="home-brand-lockup">
            <span className="home-brand-glyph" aria-hidden="true">W</span>
            <span>WORKSPACE <i>·</i> HOME</span>
          </div>
          <span className="home-date">{formatDate(now)}</span>
        </header>

        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <span className="home-overline">YOUR DESK IS READY</span>
            <h1 id="home-title">{greetingForHour(now.getHours())}<span>.</span></h1>
            <p>열려 있는 작업으로 돌아가거나, 새로운 흐름을 시작하세요.</p>
          </div>
          <button className="home-create-button" type="button" onClick={() => void addTab().catch(console.error)}>
            <span aria-hidden="true">＋</span> 새 워크스페이스
            <kbd>⌘ N</kbd>
          </button>
          <div className="home-hero-orbit home-hero-orbit--one" aria-hidden="true" />
          <div className="home-hero-orbit home-hero-orbit--two" aria-hidden="true" />
        </section>

        <section className="home-work-section" aria-labelledby="home-work-title">
          <div className="home-section-heading">
            <div>
              <span className="home-overline">PICK UP WHERE YOU LEFT OFF</span>
              <h2 id="home-work-title">내 워크스페이스 <span>{tabs.length}</span></h2>
            </div>
            <span className="home-section-hint">번호 단축키로 바로 이동</span>
          </div>
          {tabs.length ? (
            <div className="home-project-grid">
              {tabs.map((tab, index) => (
                <button
                  type="button"
                  className="home-project-card"
                  key={tab.id}
                  onClick={() => void switchToWorkspaceTab(tab.id)}
                  style={{ "--project-index": index } as React.CSSProperties}
                >
                  <span className="home-project-index">{index < 9 ? `⌘ ${index + 1}` : "OPEN"}</span>
                  <span className={`home-project-mark home-project-mark--${index % 5}`} aria-hidden="true">
                    {(tab.title.trim().charAt(0) || "W").toUpperCase()}
                  </span>
                  <span className="home-project-copy">
                    <strong>{tab.title || "Untitled workspace"}</strong>
                    <small>{tab.root_path || "폴더를 연결해 작업을 시작하세요"}</small>
                  </span>
                  <span className="home-project-open" aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          ) : (
            <button className="home-empty-card" type="button" onClick={() => void addTab().catch(console.error)}>
              <span className="home-empty-icon" aria-hidden="true">＋</span>
              <span><strong>첫 워크스페이스 만들기</strong><small>프로젝트 폴더를 열어 작업 공간을 준비하세요.</small></span>
              <span className="home-project-open" aria-hidden="true">→</span>
            </button>
          )}
        </section>

        <section className="home-pulse-section" aria-label="오늘의 정보">
          <div className="home-pulse-heading">
            <div><span className="home-overline">A LITTLE CONTEXT</span><h2>오늘의 흐름</h2></div>
            <span>필요한 정보만 가볍게</span>
          </div>
          <div className="dashboard-brief-row">
            <ClockWidget />
            <WeatherWidget />
          </div>
          <div className="dashboard-grid">
            <EconomyWidget />
            <NewspaperWidget onHeadlinesChange={setFeedHeadlines} />
            <NotificationCenterWidget feedHeadlines={feedHeadlines} />
          </div>
        </section>
      </div>
    </div>
  );
}
