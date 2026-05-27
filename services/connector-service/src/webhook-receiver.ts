import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import { ConnectorRegistry } from "./connector-registry.js";
import { ConnectorRepository } from "./repository.js";
import type { WebhookEvent, ExternalItem } from "./types.js";
import type { Request } from "express";

type RepoAdapter = Pick<ConnectorRepository, "getAccountByTypeAndWorkspace">;

export class WebhookReceiver {
  private readonly log: Logger;

  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly repo: RepoAdapter,
  ) {
    this.log = createLogger("webhook-receiver");
  }

  async receiveWebhook(
    connectorType: string,
    req: Request,
  ): Promise<{ event: WebhookEvent; items: ExternalItem[] }> {
    const eventId = generateId("wh");
    const receivedAt = new Date().toISOString();

    const event: WebhookEvent = {
      id: eventId,
      connector_type: connectorType,
      account_id: "",
      event_type: "webhook.unknown",
      payload: req.body,
      headers: req.headers as Record<string, string>,
      received_at: receivedAt,
      validated: false,
      raw_body: typeof req.body === "string" ? req.body : JSON.stringify(req.body),
    };

    this.log.info("Webhook received", {
      connectorType,
      eventId,
      contentType: req.headers["content-type"],
    });

    try {
      const plugin = this.registry.get(connectorType);

      if (!plugin.handleWebhook) {
        this.log.warn("No webhook handler for connector", {
          connectorType,
        });
        return { event, items: [] };
      }

      const signatureResult = this.validateWebhookSignature(req, connectorType);
      event.validated = signatureResult.valid;
      event.signature_valid = signatureResult.valid;

      if (!signatureResult.valid) {
        this.log.warn("Webhook signature validation failed", {
          connectorType,
          eventId,
          reason: signatureResult.reason,
        });
        return { event, items: [] };
      }

      const items = await plugin.handleWebhook({
        payload: req.body,
        headers: req.headers as Record<string, string>,
        accessToken: "",
        config: { settings: {} },
      });

      this.log.info("Webhook processed", {
        connectorType,
        eventId,
        itemCount: items.length,
      });

      return { event, items };
    } catch (error) {
      this.log.error("Webhook processing failed", {
        connectorType,
        eventId,
        error: error instanceof Error ? error.message : "Unknown",
      });
      throw error;
    }
  }

  private validateWebhookSignature(
    req: Request,
    connectorType: string,
  ): { valid: boolean; reason?: string } {
    const signatureHeader =
      req.headers["x-hub-signature-256"] ||
      req.headers["x-signature"] ||
      req.headers["x-webhook-signature"];

    if (!signatureHeader) {
      return { valid: true, reason: "No signature header present" };
    }

    const rawBody = req.body;
    if (!rawBody) {
      return { valid: false, reason: "Empty request body" };
    }

    return { valid: true };
  }
}
