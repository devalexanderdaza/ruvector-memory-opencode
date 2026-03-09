import type { LoggerLike } from "./types.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

class StructuredLogger implements LoggerLike {
  private minLevel: LogLevel = "info";

  public configure(level: LogLevel): void {
    this.minLevel = level;
  }

  public debug(event: string, metadata?: Record<string, unknown>): void {
    this.log("debug", event, metadata);
  }

  public info(event: string, metadata?: Record<string, unknown>): void {
    this.log("info", event, metadata);
  }

  public warn(event: string, metadata?: Record<string, unknown>): void {
    this.log("warn", event, metadata);
  }

  public error(event: string, metadata?: Record<string, unknown>): void {
    this.log("error", event, metadata);
  }

  private log(level: LogLevel, event: string, metadata?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const payload = {
      ts: new Date().toISOString(),
      level,
      event,
      ...(metadata ? { metadata } : {}),
    };

    // Console output is centralized here to avoid ad-hoc logging in code paths.
    console[level](JSON.stringify(payload));
  }
}

export const logger = new StructuredLogger();
