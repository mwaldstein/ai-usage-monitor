import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { VERSION } from "../version.ts";

// Service name for OpenTelemetry resource attributes
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "ai-usage-monitor";

// Initialize OpenTelemetry SDK with auto-instrumentation
export function initTracing(): NodeSDK | undefined {
  // Skip if explicitly disabled
  if (process.env.OTEL_DISABLED === "true") {
    return undefined;
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": SERVICE_NAME,
      "service.version": VERSION,
    }),
    instrumentations: [
      // Auto-instrument pino to inject trace context into logs
      new PinoInstrumentation({
        logKeys: {
          traceId: "trace_id",
          spanId: "span_id",
          traceFlags: "trace_flags",
        },
      }),
    ],
  });

  sdk.start();
  return sdk;
}

// Gracefully shutdown tracing (flushes pending data)
export async function shutdownTracing(sdk: NodeSDK | undefined): Promise<void> {
  if (!sdk) return;
  await sdk.shutdown();
}
