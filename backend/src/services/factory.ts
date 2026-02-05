import type { AIService, ServiceStatus } from "../types/index.ts";
import { BaseAIService } from "./base.ts";
import { OpenAIService, AnthropicService } from "./implementations.ts";
import { OpenCodeService } from "./opencode/index.ts";
import { AMPService } from "./amp.ts";
import { ZAIService } from "./zai.ts";
import { CodexService } from "./codex.ts";

export class ServiceFactory {
  static createService(service: AIService): BaseAIService {
    switch (service.provider) {
      case "openai":
        return new OpenAIService(service);
      case "codex":
        return new CodexService(service);
      case "anthropic":
        return new AnthropicService(service);
      case "opencode":
        return new OpenCodeService(service);
      case "amp":
        return new AMPService(service);
      case "zai":
        return new ZAIService(service);
      default: {
        const _exhaustive: never = service.provider;
        throw new Error(`Unknown provider: ${_exhaustive}`);
      }
    }
  }

  static async getServiceStatus(service: AIService): Promise<ServiceStatus> {
    const serviceInstance = this.createService(service);
    return await serviceInstance.getStatus();
  }
}
