import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { app } from "electron";
import type {
  HardwareRuntimeState,
  HardwareSimStartResult,
} from "../shared/hardwareSim";

type RuntimeMessage =
  | { type: "ready"; state: HardwareRuntimeState }
  | { type: "runtime"; state: HardwareRuntimeState }
  | { type: "error"; message: string };

type RuntimeCommand =
  | { command: "set_button"; id: string; pressed: boolean; delta_ns?: number }
  | { command: "get_runtime" }
  | { command: "quit" };

export interface HardwareSimBinaryOptions {
  appPath?: string;
  platform?: NodeJS.Platform;
  packaged?: boolean;
  resourcesPath?: string;
}

function appPath(): string {
  try {
    return app.getAppPath();
  } catch {
    return "";
  }
}

function isPackaged(): boolean {
  try {
    return app.isPackaged;
  } catch {
    return false;
  }
}

export function hardwareSimBinaryCandidates(
  options: HardwareSimBinaryOptions = {},
): string[] {
  const platform = options.platform ?? process.platform;
  const executable = platform === "win32" ? "hardware-sim.exe" : "hardware-sim";
  const electronAppPath = options.appPath ?? appPath();
  const candidates: string[] = [];

  if (options.packaged ?? isPackaged()) {
    const resources = options.resourcesPath ?? process.resourcesPath;
    if (resources) candidates.push(path.join(resources, "hardware-sim", executable));
  }
  if (electronAppPath) {
    const target = path.join(
      electronAppPath,
      "..",
      "native",
      "hardware-sim-core",
      "target",
    );
    candidates.push(path.join(target, "release", executable));
    candidates.push(path.join(target, "debug", executable));
  }
  return candidates;
}

function resolveBinary(): string | null {
  return hardwareSimBinaryCandidates().find((candidate) => existsSync(candidate)) ?? null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

class HardwareSimSession {
  private readonly lines: ReadlineInterface;
  private readonly messages: RuntimeMessage[] = [];
  private readonly waiters: Array<{
    resolve: (message: RuntimeMessage) => void;
    reject: (error: Error) => void;
  }> = [];
  private queue: Promise<unknown> = Promise.resolve();
  private stderr = "";
  private closed = false;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    this.lines = createInterface({ input: child.stdout });
    this.lines.on("line", (line) => {
      let message: RuntimeMessage;
      try {
        message = JSON.parse(line) as RuntimeMessage;
      } catch {
        this.fail(new Error(`hardware-sim emitted invalid JSON: ${line}`));
        return;
      }
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(message);
      else this.messages.push(message);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString("utf8")).slice(-8_192);
    });
    child.once("error", (error) => this.fail(error));
    child.once("exit", (code, signal) => {
      this.fail(
        new Error(
          `hardware-sim exited (${signal ?? code ?? "unknown"})${
            this.stderr ? `: ${this.stderr.trim()}` : ""
          }`,
        ),
      );
    });
  }

  nextMessage(): Promise<RuntimeMessage> {
    const buffered = this.messages.shift();
    if (buffered) return Promise.resolve(buffered);
    if (this.closed) return Promise.reject(new Error("hardware-sim session is closed"));
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  request(command: RuntimeCommand): Promise<RuntimeMessage> {
    const operation = this.queue.then(async () => {
      if (this.closed) throw new Error("hardware-sim session is closed");
      this.child.stdin.write(`${JSON.stringify(command)}\n`);
      return this.nextMessage();
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  stop(): void {
    if (this.closed) return;
    this.child.stdin.end(`${JSON.stringify({ command: "quit" })}\n`);
    this.closed = true;
    this.lines.close();
    const error = new Error("hardware-sim session stopped");
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.lines.close();
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }
}

export class HardwareSimManager {
  private readonly sessions = new Map<number, HardwareSimSession>();
  private nextId = 1;

  constructor(private readonly binaryResolver: () => string | null = resolveBinary) {}

  async start(projectPath: string): Promise<HardwareSimStartResult> {
    const binary = this.binaryResolver();
    if (!binary) {
      throw new Error(
        "hardware-sim binary not found. Run: cargo build --manifest-path ../native/hardware-sim-core/Cargo.toml --bin hardware-sim",
      );
    }
    const child = spawn(binary, [projectPath], {
      cwd: path.dirname(projectPath),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const session = new HardwareSimSession(child);
    let first: RuntimeMessage;
    try {
      first = await withTimeout(
        session.nextMessage(),
        5_000,
        "hardware-sim did not become ready within 5 seconds",
      );
    } catch (error) {
      session.stop();
      throw error;
    }
    if (first.type === "error") {
      session.stop();
      throw new Error(first.message);
    }
    if (first.type !== "ready") {
      session.stop();
      throw new Error(`hardware-sim expected ready, received ${first.type}`);
    }
    const sessionId = this.nextId++;
    this.sessions.set(sessionId, session);
    return { sessionId, state: first.state };
  }

  async setButton(
    sessionId: number,
    id: string,
    pressed: boolean,
  ): Promise<HardwareRuntimeState> {
    const session = this.requireSession(sessionId);
    const message = await session.request({
      command: "set_button",
      id,
      pressed,
    });
    if (message.type === "error") throw new Error(message.message);
    if (message.type !== "runtime") {
      throw new Error(`hardware-sim expected runtime, received ${message.type}`);
    }
    return message.state;
  }

  stop(sessionId: number): void {
    this.sessions.get(sessionId)?.stop();
    this.sessions.delete(sessionId);
  }

  dispose(): void {
    for (const session of this.sessions.values()) session.stop();
    this.sessions.clear();
  }

  private requireSession(sessionId: number): HardwareSimSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`hardware-sim session ${sessionId} does not exist`);
    return session;
  }
}

export const hardwareSimManager = new HardwareSimManager();
