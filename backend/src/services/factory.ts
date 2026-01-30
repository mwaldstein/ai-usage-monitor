import { AIService, AIProvider, ServiceStatus } from '../types';
import { BaseAIService } from './base';
import { OpenAIService, GoogleAIService, AnthropicService, GenericAIService } from './implementations';
import { OpenCodeService } from './opencode';
import { AMPService } from './amp';
import { ZAIService } from './zai';
import { CodexService } from './codex';

export class ServiceFactory {
  static createService(service: AIService): BaseAIService {
    switch (service.provider as AIProvider) {
      case 'openai':
        return new OpenAIService(service);
      case 'codex':
        return new CodexService(service);
      case 'google':
        return new GoogleAIService(service);
      case 'anthropic':
        return new AnthropicService(service);
      case 'opencode':
        return new OpenCodeService(service);
      case 'amp':
        return new AMPService(service);
      case 'zai':
        return new ZAIService(service);
      case 'aws':
        return new GenericAIService(service);
      default:
        return new GenericAIService(service);
    }
  }

  static async getServiceStatus(service: AIService): Promise<ServiceStatus> {
    const serviceInstance = this.createService(service);
    return await serviceInstance.getStatus();
  }
}
