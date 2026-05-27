import { z } from "zod";
import type { EventEnvelope } from "./types.js";

const envelopeSchema = z.object({
  id: z.string().min(1, "Event id is required"),
  type: z.string().min(1, "Event type is required"),
  timestamp: z.string().min(1, "Timestamp is required"),
  payload: z.unknown(),
  metadata: z.record(z.unknown()).optional(),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
});

export function validateEnvelope<T>(envelope: EventEnvelope<T>): EventEnvelope<T> {
  const result = envelopeSchema.safeParse(envelope);
  if (!result.success) {
    throw new TypeError(
      `Invalid EventEnvelope: ${result.error.errors.map((e: { path: (string | number)[]; message: string }) => `${e.path.join(".")}: ${e.message}`).join("; ")}`,
    );
  }
  return envelope;
}
