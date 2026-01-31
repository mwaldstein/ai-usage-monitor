import { ChevronDown, ChevronUp, ExternalLink, Sparkles } from "lucide-react";
import type { ProviderInstructions } from "./providerConfigs";

interface InstructionsPanelProps {
  instructions: ProviderInstructions;
  showInstructions: boolean;
  onToggle: () => void;
}

export function InstructionsPanel({
  instructions,
  showInstructions,
  onToggle,
}: InstructionsPanelProps) {
  return (
    <div className="rounded-xl overflow-hidden border border-violet-500/20 bg-violet-500/5">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-violet-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-violet-400" />
          <span className="text-sm font-medium text-violet-300">
            {instructions.instructions.title}
          </span>
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
              <li key={index} className="leading-relaxed">
                {step}
              </li>
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
  );
}
