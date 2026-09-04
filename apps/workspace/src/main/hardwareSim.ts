import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { app } from "electron";
import type {
  HardwareBuildResult,
  HardwareRuntimeState,
  HardwareSimReloadReason,
  HardwareSimReloadResult,
  HardwareSimStartResult,
  HardwareSimStatusUpdate,
} from "../shared/hardwareSim";
import { compileArduinoFirmware } from "./hardwareSim/arduinoCompile";

type GpioEvent = {
  t_ns: number;
  pin: string;
  level: "high" | "low" | "high_impedance" | "unknown";
};

type RuntimeMessage =
  | { type: "ready"; state: HardwareRuntimeState }
  | { type: "runtime"; state: HardwareRuntimeState }
  | { type: "error"; message: string };

type RuntimeCommand =
  | { command: "set_button"; id: string; pressed: boolean; delta_ns?: number }
  | { command: "apply_gpio"; event: GpioEvent }
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

export function hardwareSimBinaryCandidates(options: HardwareSimBinaryOptions = {}): string[] {
  const platform = options.platform ?? process.platform;
  const executable = platform === "win32" ? "hardware-sim.exe" : "hardware-sim";
  const electronAppPath = options.appPath ?? appPath();
  const candidates: string[] = [];

  if (options.packaged ?? isPackaged()) {
    const resources = options.resourcesPath ?? process.resourcesPath;
    if (resources) candidates.push(path.join(resources, "hardware-sim", executable));
  }
  if (electronAppPath) {
    const target = path.join(electronAppPath, "..", "..", "hardware-sim", "core", "target");
    candidates.push(path.join(target, "release", executable));
    candidates.push(path.join(target, "debug", executable));
  }
  return candidates;
}

export function avr8jsSidecarCandidates(options: HardwareSimBinaryOptions = {}): string[] {
  const electronAppPath = options.appPath ?? appPath();
  const candidates: string[] = [];
  if (options.packaged ?? isPackaged()) {
    const resources = options.resourcesPath ?? process.resourcesPath;
    if (resources) {
      candidates.push(path.join(resources, "hardware-sim", "avr8js-sidecar.mjs"));
    }
  }
  if (electronAppPath) {
    candidates.push(path.join(electronAppPath, "scripts", "hardware", "avr8js-sidecar.mjs"));
  }
  return candidates;
}

function resolveBinary(): string | null {
  return hardwareSimBinaryCandidates().find((candidate) => existsSync(candidate)) ?? null;
}

function resolveSidecar(): string | null {
  return avr8jsSidecarCandidates().find((candidate) => existsSync(candidate)) ?? null;
}

type HardwareProjectConfig = {
  firmware: string | null;
  firmwarePath: string | null;
};

function readProjectConfig(projectPath: string): HardwareProjectConfig {
  const project = JSON.parse(readFileSync(projectPath, "utf8")) as {
    firmware?: string;
  };
  if (!project.firmware) return { firmware: null, firmwarePath: null };
  const projectDir = path.dirname(projectPath);
  const firmwarePath = path.resolve(projectDir, project.firmware);
  const relativeFirmware = path.relative(projectDir, firmwarePath);
  if (relativeFirmware.startsWith("..") || path.isAbsolute(relativeFirmware)) {
    throw new Error("firmware path escapes the hardware project directory");
  }
  return { firmware: project.firmware, firmwarePath };
}

function newestExistingPath(candidates: string[]): string | null {
  return (
    candidates
      .filter((candidate) => existsSync(candidate))
      .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0] ?? null
  );
}

function resolveFirmwareHex(projectPath: string, firmwarePath: string): string | null {
  return newestExistingPath([
    path.join(path.dirname(projectPath), "build", "hardware-sim", "firmware.hex"),
    `${firmwarePath}.hex`,
  ]);
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

type ManagedSession = {
  core: HardwareSimSession;
  mcu?: ChildProcess;
  projectPath: string;
  firmware: string | null;
  generation: number;
  state: HardwareRuntimeState;
  reloadQueue: Promise<unknown>;
  onRuntime?: (sessionId: number, state: HardwareRuntimeState) => void;
  onStatus?: (update: HardwareSimStatusUpdate) => void;
};

export class HardwareSimManager {
  private readonly sessions = new Map<number, ManagedSession>();
  private nextId = 1;

  constructor(
    private readonly binaryResolver: () => string | null = resolveBinary,
    private readonly sidecarResolver: () => string | null = resolveSidecar,
    private readonly compiler: typeof compileArduinoFirmware = compileArduinoFirmware,
  ) {}

  async start(
    projectPath: string,
    onRuntime?: (sessionId: number, state: HardwareRuntimeState) => void,
    onStatus?: (update: HardwareSimStatusUpdate) => void,
  ): Promise<HardwareSimStartResult> {
    const config = readProjectConfig(projectPath);
    const { core, state } = await this.spawnCore(projectPath);
    const sessionId = this.nextId++;
    this.sessions.set(sessionId, {
      core,
      projectPath,
      firmware: config.firmware,
      generation: 1,
      state,
      reloadQueue: Promise.resolve(),
      onRuntime,
      onStatus,
    });
    try {
      this.startMcuIfConfigured(sessionId, 1, config);
    } catch (error) {
      this.stop(sessionId);
      throw error;
    }
    return { sessionId, state, firmware: config.firmware };
  }

  private async spawnCore(
    projectPath: string,
  ): Promise<{ core: HardwareSimSession; state: HardwareRuntimeState }> {
    const binary = this.binaryResolver();
    if (!binary) {
      throw new Error(
        "hardware-sim binary not found. Run: cargo build --manifest-path ../../hardware-sim/core/Cargo.toml --bin hardware-sim",
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
    return { core: session, state: first.state };
  }

  async setButton(sessionId: number, id: string, pressed: boolean): Promise<HardwareRuntimeState> {
    const managed = this.requireSession(sessionId);
    const message = await managed.core.request({
      command: "set_button",
      id,
      pressed,
    });
    if (message.type === "error") throw new Error(message.message);
    if (message.type !== "runtime") {
      throw new Error(`hardware-sim expected runtime, received ${message.type}`);
    }
    managed.state = message.state;
    return message.state;
  }

  reload(sessionId: number, reason: HardwareSimReloadReason): Promise<HardwareSimReloadResult> {
    const managed = this.requireSession(sessionId);
    const operation = managed.reloadQueue.then(() => this.performReload(sessionId, reason));
    managed.reloadQueue = operation.catch(() => undefined);
    return operation;
  }

  private async performReload(
    sessionId: number,
    reason: HardwareSimReloadReason,
  ): Promise<HardwareSimReloadResult> {
    let managed = this.requireSession(sessionId);
    let build: HardwareBuildResult | undefined;
    if (reason === "firmware-source") {
      const config = readProjectConfig(managed.projectPath);
      if (!config.firmwarePath) {
        throw new Error("hardware project does not declare firmware");
      }
      managed.onStatus?.({ sessionId, phase: "building" });
      build = await this.compiler({
        projectPath: managed.projectPath,
        firmwarePath: config.firmwarePath,
      });
      managed = this.requireSession(sessionId);
      if (!build.ok) {
        managed.onStatus?.({ sessionId, phase: "build_failed", build });
        return {
          status: "build_failed",
          state: managed.state,
          firmware: managed.firmware,
          build,
        };
      }
    }

    managed.onStatus?.({ sessionId, phase: "restarting", build });
    const config = readProjectConfig(managed.projectPath);
    const candidate = await this.spawnCore(managed.projectPath);
    managed = this.requireSession(sessionId);
    const previousCore = managed.core;
    const previousMcu = managed.mcu;
    const generation = managed.generation + 1;
    managed.core = candidate.core;
    managed.mcu = undefined;
    managed.firmware = config.firmware;
    managed.generation = generation;
    managed.state = candidate.state;
    previousMcu?.kill();
    previousCore.stop();

    const hexPath =
      build?.hexPath ??
      (config.firmwarePath ? resolveFirmwareHex(managed.projectPath, config.firmwarePath) : null);
    this.startMcuIfConfigured(sessionId, generation, config, hexPath);
    managed.onRuntime?.(sessionId, candidate.state);
    managed.onStatus?.({ sessionId, phase: "live", build });
    return {
      status: "restarted",
      state: candidate.state,
      firmware: config.firmware,
      build,
    };
  }

  stop(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    session?.mcu?.kill();
    session?.core.stop();
    this.sessions.delete(sessionId);
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.mcu?.kill();
      session.core.stop();
    }
    this.sessions.clear();
  }

  private requireSession(sessionId: number): ManagedSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`hardware-sim session ${sessionId} does not exist`);
    return session;
  }

  private startMcuIfConfigured(
    sessionId: number,
    generation: number,
    config: HardwareProjectConfig,
    preferredHexPath?: string | null,
  ): void {
    if (!config.firmwarePath) return;
    const managedAtStart = this.requireSession(sessionId);
    const projectDir = path.dirname(managedAtStart.projectPath);
    const hexPath =
      preferredHexPath ?? resolveFirmwareHex(managedAtStart.projectPath, config.firmwarePath);
    if (!hexPath) return;

    const sidecar = this.sidecarResolver();
    if (!sidecar) {
      throw new Error("avr8js sidecar not found");
    }
    const child = spawn(
      process.execPath,
      [sidecar, "--hex", hexPath, "--duration-ms", "0", "--realtime"],
      {
        cwd: projectDir,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    this.requireSession(sessionId).mcu = child;
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      let event: GpioEvent;
      try {
        event = JSON.parse(line) as GpioEvent;
      } catch {
        console.error("[hardware-sim] avr8js emitted invalid JSON:", line);
        return;
      }
      const managed = this.sessions.get(sessionId);
      if (!managed || managed.generation !== generation) return;
      void managed.core
        .request({ command: "apply_gpio", event })
        .then((message) => {
          const current = this.sessions.get(sessionId);
          if (!current || current.generation !== generation) return;
          if (message.type === "runtime") {
            current.state = message.state;
            current.onRuntime?.(sessionId, message.state);
          } else if (message.type === "error") {
            console.error("[hardware-sim] GPIO event rejected:", message.message);
          }
        })
        .catch((error) => {
          console.error("[hardware-sim] GPIO bridge failed:", error);
        });
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      console.error("[hardware-sim] avr8js:", chunk.toString("utf8").trim());
    });
  }
}

export const hardwareSimManager = new HardwareSimManager();
