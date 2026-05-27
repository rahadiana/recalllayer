import { createLogger, type Logger } from "@memory-platform/observability";
import type { ConnectorPlugin } from "./types.js";

export class ConnectorRegistry {
  private readonly plugins = new Map<string, ConnectorPlugin>();
  private readonly log: Logger;

  constructor() {
    this.log = createLogger("connector-registry");
  }

  register(plugin: ConnectorPlugin): void {
    if (this.plugins.has(plugin.type)) {
      this.log.warn("Plugin already registered, overwriting", {
        connectorType: plugin.type,
      });
    }

    this.plugins.set(plugin.type, plugin);
    this.log.info("Connector plugin registered", {
      type: plugin.type,
      name: plugin.displayName,
    });
  }

  unregister(type: string): boolean {
    const removed = this.plugins.delete(type);
    if (removed) {
      this.log.info("Connector plugin unregistered", { type });
    }
    return removed;
  }

  get(type: string): ConnectorPlugin {
    const plugin = this.plugins.get(type);
    if (!plugin) {
      throw new Error(`No connector plugin registered for type: ${type}`);
    }
    return plugin;
  }

  has(type: string): boolean {
    return this.plugins.has(type);
  }

  list(): Array<{ type: string; displayName: string }> {
    return Array.from(this.plugins.values()).map((p) => ({
      type: p.type,
      displayName: p.displayName,
    }));
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.plugins.keys());
  }
}
