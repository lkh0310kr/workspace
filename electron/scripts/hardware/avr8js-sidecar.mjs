#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  avrInstruction,
  AVRIOPort,
  AVRTimer,
  CPU,
  PinState,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
} from "avr8js";

const CLOCK_HZ = 16_000_000;
const FLASH_WORDS = 0x8000;

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function loadIntelHex(source, target) {
  for (const [lineIndex, line] of source.split(/\r?\n/).entries()) {
    if (!line) continue;
    if (!line.startsWith(":") || line.length < 11) {
      throw new Error(`invalid Intel HEX line ${lineIndex + 1}`);
    }
    const byteCount = Number.parseInt(line.slice(1, 3), 16);
    const address = Number.parseInt(line.slice(3, 7), 16);
    const recordType = Number.parseInt(line.slice(7, 9), 16);
    if (recordType !== 0) continue;
    for (let index = 0; index < byteCount; index += 1) {
      target[address + index] = Number.parseInt(
        line.slice(9 + index * 2, 11 + index * 2),
        16,
      );
    }
  }
}

function levelForPin(port, pin) {
  const state = port.pinState(pin);
  if (state === PinState.High) return "high";
  if (state === PinState.Low) return "low";
  return "high_impedance";
}

const hexPath = argument("--hex");
const durationMs = Number(argument("--duration-ms", "1100"));
const realtime = process.argv.includes("--realtime");
if (!hexPath) {
  throw new Error("usage: avr8js-sidecar.mjs --hex <firmware.hex> [--duration-ms 1100]");
}
if (!Number.isFinite(durationMs) || durationMs < 0) {
  throw new Error("--duration-ms must be zero (continuous) or a positive number");
}

const program = new Uint16Array(FLASH_WORDS);
loadIntelHex(readFileSync(hexPath, "utf8"), new Uint8Array(program.buffer));
const cpu = new CPU(program);
new AVRTimer(cpu, timer0Config);
new AVRTimer(cpu, timer1Config);
new AVRTimer(cpu, timer2Config);
const portB = new AVRIOPort(cpu, portBConfig);
new AVRIOPort(cpu, portCConfig);
new AVRIOPort(cpu, portDConfig);

let lastD13 = null;
portB.addListener(() => {
  const level = levelForPin(portB, 5);
  if (level === lastD13) return;
  lastD13 = level;
  process.stdout.write(
    `${JSON.stringify({
      t_ns: Math.floor((cpu.cycles * 1_000_000_000) / CLOCK_HZ),
      pin: "D13",
      level,
    })}\n`,
  );
});

const targetCycles =
  durationMs === 0 ? Number.POSITIVE_INFINITY : Math.floor((durationMs / 1000) * CLOCK_HZ);

function executeUntil(cycles) {
  while (cpu.cycles < cycles) {
    avrInstruction(cpu);
    cpu.tick();
  }
}

if (!realtime) {
  if (!Number.isFinite(targetCycles)) {
    throw new Error("--duration-ms 0 requires --realtime");
  }
  executeUntil(targetCycles);
} else {
  const startedAt = performance.now();
  const tick = () => {
    const elapsedMs = performance.now() - startedAt;
    const realtimeCycles = Math.floor((elapsedMs / 1000) * CLOCK_HZ);
    executeUntil(Math.min(realtimeCycles, targetCycles));
    if (cpu.cycles < targetCycles) setTimeout(tick, 1);
  };
  tick();
}
