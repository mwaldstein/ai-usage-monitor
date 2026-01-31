import pino from "pino";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// Create pino logger instance with pretty printing in dev, JSON in prod
export const logger = pino({
  level: LOG_LEVEL,
  ...(process.env.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    },
  }),
  // Base fields for all logs
  base: {
    service: "ai-usage-monitor",
  },
});

// Log at startup
logger.info({ level: LOG_LEVEL }, "Logger initialized");
