import type { TuiAgent } from '../tui-agent'
import grokUrl from './icons/grok.png?url'
import mimoCodeUrl from './icons/mimo-code.png?url'
import anteUrl from './icons/ante.png?url'
import traeUrl from './icons/trae.png?url'
import primeAgentUrl from './icons/prime-agent.png?url'
import geminiUrl from './icons/gemini.png?url'
import antigravityUrl from './icons/antigravity.png?url'
import gooseUrl from './icons/goose.png?url'
import ampUrl from './icons/amp.png?url'
import kiroUrl from './icons/kiro.png?url'
import crushUrl from './icons/crush.png?url'
import augUrl from './icons/aug.png?url'
import autohandUrl from './icons/autohand.png?url'
import clineUrl from './icons/cline.png?url'
import codebuffUrl from './icons/codebuff.png?url'
import commandCodeUrl from './icons/command-code.png?url'
import continueUrl from './icons/continue.png?url'
import cursorUrl from './icons/cursor.png?url'
import kimiUrl from './icons/kimi.png?url'
import mistralVibeUrl from './icons/mistral-vibe.png?url'
import qwenCodeUrl from './icons/qwen-code.png?url'
import rovoUrl from './icons/rovo.png?url'
import hermesUrl from './icons/hermes.png?url'
import devinUrl from './icons/devin.png?url'
import openclawUrl from './icons/openclaw.png?url'
import openclaudeUrl from './icons/openclaude.png?url'
import opencodeUrl from './icons/opencode.png?url'
import copilotUrl from './icons/copilot.png?url'
import droidUrl from './icons/droid.png?url'

// Ported from ref-proj/orca agent-favicon-assets.ts — bundle favicons at build time.
export const AGENT_FAVICON_ASSETS: Partial<Record<TuiAgent, string>> = {
  grok: grokUrl,
  'mimo-code': mimoCodeUrl,
  ante: anteUrl,
  trae: traeUrl,
  'prime-agent': primeAgentUrl,
  gemini: geminiUrl,
  antigravity: antigravityUrl,
  goose: gooseUrl,
  amp: ampUrl,
  kiro: kiroUrl,
  crush: crushUrl,
  aug: augUrl,
  autohand: autohandUrl,
  cline: clineUrl,
  codebuff: codebuffUrl,
  'command-code': commandCodeUrl,
  continue: continueUrl,
  cursor: cursorUrl,
  kimi: kimiUrl,
  'mistral-vibe': mistralVibeUrl,
  'qwen-code': qwenCodeUrl,
  rovo: rovoUrl,
  hermes: hermesUrl,
  devin: devinUrl,
  openclaw: openclawUrl,
  openclaude: openclaudeUrl,
  opencode: opencodeUrl,
  copilot: copilotUrl,
  droid: droidUrl
}
