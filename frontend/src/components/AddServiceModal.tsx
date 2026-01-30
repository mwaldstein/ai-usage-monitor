import { useState, useEffect } from 'react';
import { AIService } from '../types';
import { X, ChevronDown, ChevronUp, ExternalLink, Sparkles } from 'lucide-react';

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (service: Omit<AIService, 'id' | 'createdAt' | 'updatedAt' | 'displayOrder'>) => void;
  editingService?: AIService | null;
  disabled?: boolean;
}

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', color: '#10a37f' },
  { value: 'codex', label: 'OpenAI Codex', color: '#10a37f' },
  { value: 'anthropic', label: 'Anthropic', color: '#d97757' },
  { value: 'google', label: 'Google AI', color: '#4285f4' },
  { value: 'aws', label: 'AWS Bedrock', color: '#ff9900' },
  { value: 'opencode', label: 'opencode zen', color: '#8b5cf6' },
  { value: 'amp', label: 'AMP', color: '#06b6d4' },
  { value: 'zai', label: 'z.ai', color: '#10b981' },
];

interface ProviderInstructions {
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  apiKeyHelp: string;
  bearerTokenLabel?: string;
  bearerTokenPlaceholder?: string;
  bearerTokenHelp?: string;
  baseUrlHelp?: string;
  baseUrlPlaceholder?: string;
  instructions: {
    title: string;
    steps: string[];
    link?: { text: string; url: string };
  };
}

const PROVIDER_INSTRUCTIONS: Record<string, ProviderInstructions> = {
  openai: {
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: 'sk-...',
    apiKeyHelp: 'Your OpenAI API key from platform.openai.com',
    instructions: {
      title: 'How to get your OpenAI API Key',
      steps: [
        'Go to https://platform.openai.com/api-keys',
        'Log in to your OpenAI account',
        'Click "Create new secret key"',
        'Copy the key (it starts with "sk-")',
        'Paste it here'
      ],
      link: { text: 'Open OpenAI API Keys', url: 'https://platform.openai.com/api-keys' }
    }
  },
  anthropic: {
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: 'sk-ant-...',
    apiKeyHelp: 'Your Anthropic API key from console.anthropic.com',
    instructions: {
      title: 'How to get your Anthropic API Key',
      steps: [
        'Go to https://console.anthropic.com/settings/keys',
        'Log in to your Anthropic account',
        'Click "Create Key"',
        'Copy the key (it starts with "sk-ant-")',
        'Paste it here'
      ],
      link: { text: 'Open Anthropic Console', url: 'https://console.anthropic.com/settings/keys' }
    }
  },
  google: {
    apiKeyLabel: 'API Key',
    apiKeyPlaceholder: 'AIza...',
    apiKeyHelp: 'Your Google AI API key from Google Cloud Console',
    instructions: {
      title: 'How to get your Google AI API Key',
      steps: [
        'Go to https://makersuite.google.com/app/apikey',
        'Log in to your Google account',
        'Click "Create API Key"',
        'Copy the key (it starts with "AIza")',
        'Paste it here'
      ],
      link: { text: 'Open Google AI Studio', url: 'https://makersuite.google.com/app/apikey' }
    }
  },
  aws: {
    apiKeyLabel: 'AWS Credentials',
    apiKeyPlaceholder: 'Not implemented - requires AWS Signature V4',
    apiKeyHelp: 'AWS access key and secret (not yet supported)',
    instructions: {
      title: 'AWS Bedrock Support',
      steps: [
        'AWS Bedrock requires AWS Signature V4 authentication',
        'This is not yet fully implemented',
        'Please use another provider for now'
      ]
    }
  },
  opencode: {
    apiKeyLabel: 'Auth Cookie',
    apiKeyPlaceholder: 'auth=Fe26.2**...',
    apiKeyHelp: 'Required: Copy full cookie string from browser',
    baseUrlHelp: 'Required: Full workspace billing URL',
    baseUrlPlaceholder: 'https://opencode.ai/workspace/wrk_...',
    instructions: {
      title: 'How to get your OpenCode Auth Cookie',
      steps: [
        'Open https://opencode.ai in your browser',
        'Log in to your account',
        'Navigate to your workspace billing page',
        'Open DevTools (F12) → Application → Cookies',
        'Find the cookie named "auth"',
        'Copy the ENTIRE cookie string (including "auth=")',
        'Paste it in the field above',
        'For Base URL: Copy your workspace billing page URL'
      ],
      link: { text: 'Open OpenCode', url: 'https://opencode.ai' }
    }
  },
  amp: {
    apiKeyLabel: 'Session Cookie',
    apiKeyPlaceholder: 'session=...',
    apiKeyHelp: 'Required: Copy full cookie string from browser',
    baseUrlHelp: 'Optional: defaults to https://ampcode.com',
    baseUrlPlaceholder: 'https://ampcode.com',
    instructions: {
      title: 'How to get your AMP Session Cookie',
      steps: [
        'Open https://ampcode.com in your browser',
        'Log in to your account',
        'Open DevTools (F12) → Application → Cookies',
        'Find the session cookie (or auth cookie)',
        'Copy the ENTIRE cookie string (including the name, e.g., "session=")',
        'Paste it in the field above'
      ],
      link: { text: 'Open AMP', url: 'https://ampcode.com' }
    }
  },
  codex: {
    apiKeyLabel: 'Session Cookie (Optional)',
    apiKeyPlaceholder: 'hs_c=...',
    apiKeyHelp: 'Legacy: Session cookie from chatgpt.com',
    bearerTokenLabel: 'Bearer Token (Recommended)',
    bearerTokenPlaceholder: 'eyJhbGciOiJSUzI1NiIs...',
    bearerTokenHelp: 'JWT token from browser - preferred auth method',
    instructions: {
      title: 'How to get your ChatGPT Bearer Token',
      steps: [
        'Open https://chatgpt.com in your browser',
        'Log in to your account',
        'Open DevTools (F12) → Network tab',
        'Navigate to https://chatgpt.com/codex/settings/usage',
        'Look for the request to /backend-api/wham/usage',
        'Click on it → Headers → Request Headers',
        'Find the "Authorization: Bearer" header',
        'Copy the token (the long string after "Bearer ")',
        'Paste it in the Bearer Token field above'
      ],
      link: { text: 'Open ChatGPT', url: 'https://chatgpt.com' }
    }
  },
  zai: {
    apiKeyLabel: 'Bearer Token',
    apiKeyPlaceholder: 'eyJ...',
    apiKeyHelp: 'Required: Copy from browser localStorage',
    instructions: {
      title: 'How to get your z.ai Bearer Token',
      steps: [
        'Open https://z.ai in your browser',
        'Log in to your account',
        'Open DevTools (F12) → Application → Local Storage',
        'Look for key: z-ai-open-platform-token-production or z-ai-website-token',
        'Copy the token value',
        'Paste it in the field above'
      ],
      link: { text: 'Open z.ai', url: 'https://z.ai' }
    }
  }
};

export function AddServiceModal({ isOpen, onClose, onSubmit, editingService, disabled }: AddServiceModalProps) {
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showInstructions, setShowInstructions] = useState(true);

  const isEditing = !!editingService;

  useEffect(() => {
    if (editingService) {
      setName(editingService.name);
      setProvider(editingService.provider);
      setApiKey(editingService.apiKey || '');
      setBearerToken(editingService.bearerToken || '');
      setBaseUrl(editingService.baseUrl || '');
    } else {
      setName('');
      setProvider('openai');
      setApiKey('');
      setBearerToken('');
      setBaseUrl('');
    }
    setShowInstructions(true);
  }, [editingService, isOpen]);

  if (!isOpen) return null;

  const instructions = PROVIDER_INSTRUCTIONS[provider];
  const selectedProvider = PROVIDERS.find(p => p.value === provider);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      provider,
      apiKey: apiKey || undefined,
      bearerToken: bearerToken || undefined,
      baseUrl: baseUrl || undefined,
      enabled: true
    });
    onClose();
  };

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    setApiKey('');
    setBearerToken('');
    setBaseUrl('');
    setShowInstructions(true);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-strong rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: selectedProvider?.color || '#71717a' }}
            />
            <h2 className="text-lg font-semibold text-white">
              {isEditing ? 'Edit Service' : 'Add AI Service'}
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Service Name */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              Service Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-800/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 text-sm text-white placeholder-zinc-600 transition-all"
              placeholder="e.g., Production OpenAI"
              required
            />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              Provider
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => !isEditing && handleProviderChange(p.value)}
                  disabled={isEditing}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                    provider === p.value
                      ? 'bg-zinc-700 text-white border border-white/20'
                      : 'bg-zinc-800/50 text-zinc-400 border border-white/5 hover:border-white/10 hover:text-zinc-300'
                  } ${isEditing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="truncate">{p.label}</span>
                  </div>
                </button>
              ))}
            </div>
            {isEditing && (
              <p className="text-[10px] text-zinc-500 mt-1.5">Provider cannot be changed when editing</p>
            )}
          </div>

          {/* Instructions Panel */}
          <div className="rounded-xl overflow-hidden border border-violet-500/20 bg-violet-500/5">
            <button
              type="button"
              onClick={() => setShowInstructions(!showInstructions)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-violet-500/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-violet-400" />
                <span className="text-sm font-medium text-violet-300">{instructions.instructions.title}</span>
              </div>
              {showInstructions ? (
                <ChevronUp size={16} className="text-violet-400" />
              ) : (
                <ChevronDown size={16} className="text-violet-400" />
              )}
            </button>
            
            {showInstructions && (
              <div className="px-4 py-3 border-t border-violet-500/20">
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-zinc-300">
                  {instructions.instructions.steps.map((step, index) => (
                    <li key={index} className="leading-relaxed">{step}</li>
                  ))}
                </ol>
                {instructions.instructions.link && (
                  <a
                    href={instructions.instructions.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    {instructions.instructions.link.text}
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
              {instructions.apiKeyLabel}
            </label>
            <p className="text-[10px] text-zinc-500 mb-1.5">{instructions.apiKeyHelp}</p>
            <textarea
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-800/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 text-xs font-mono text-white placeholder-zinc-600 transition-all resize-none"
              placeholder={instructions.apiKeyPlaceholder}
              rows={3}
            />
          </div>

          {/* Bearer Token */}
          {instructions.bearerTokenLabel && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
                {instructions.bearerTokenLabel}
              </label>
              <p className="text-[10px] text-zinc-500 mb-1.5">{instructions.bearerTokenHelp}</p>
              <textarea
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-800/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 text-xs font-mono text-white placeholder-zinc-600 transition-all resize-none"
                placeholder={instructions.bearerTokenPlaceholder}
                rows={3}
              />
            </div>
          )}

          {/* Base URL */}
          {provider !== 'codex' && provider !== 'zai' && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">
                Base URL
              </label>
              {instructions.baseUrlHelp && (
                <p className="text-[10px] text-zinc-500 mb-1.5">{instructions.baseUrlHelp}</p>
              )}
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-800/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 text-xs font-mono text-white placeholder-zinc-600 transition-all"
                placeholder={instructions.baseUrlPlaceholder || "https://api.example.com/v1"}
              />
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-white/10 bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-white/10 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:border-white/20 hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={disabled}
            className={`flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-violet-600/20 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {disabled ? 'Offline' : (isEditing ? 'Save Changes' : 'Add Service')}
          </button>
        </div>
      </div>
    </div>
  );
}
