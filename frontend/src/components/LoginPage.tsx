import { useState } from "react";
import { Shield, User, Lock, KeyRound, AlertCircle, Loader2 } from "lucide-react";
import type { AuthState } from "../hooks/useAuth";

interface LoginPageProps {
  auth: AuthState;
}

export function LoginPage({ auth }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSetup = !auth.hasUsers;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = isSetup
        ? await auth.register(username, password, setupCode)
        : await auth.login(username, password);

      if (result) {
        setError(result);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f11] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="glass rounded-2xl p-6 border border-white/10">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-violet-500/20 flex items-center justify-center">
              <Shield size={24} className="text-violet-400" />
            </div>
            <h1 className="text-lg font-semibold text-white">AI Monitor</h1>
            <p className="text-sm text-zinc-400 mt-1">
              {isSetup ? "Create your admin account" : "Sign in to continue"}
            </p>
          </div>

          {/* Setup notice */}
          {isSetup && (
            <div className="mb-4 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <p className="text-xs text-violet-300">
                First-time setup. Enter the setup code from the server logs to create your admin
                account. Registration closes after the first account is created.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {isSetup && (
              <div>
                <label
                  htmlFor="setupCode"
                  className="block text-xs font-medium text-zinc-400 mb-1.5"
                >
                  Setup Code
                </label>
                <div className="relative">
                  <KeyRound
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                  />
                  <input
                    id="setupCode"
                    type="text"
                    value={setupCode}
                    onChange={(e) => setSetupCode(e.target.value.toUpperCase())}
                    required
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full pl-9 pr-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25 font-mono tracking-widest"
                    placeholder="Check server logs"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-xs font-medium text-zinc-400 mb-1.5">
                Username
              </label>
              <div className="relative">
                <User
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={isSetup ? 3 : undefined}
                  autoComplete="username"
                  className="w-full pl-9 pr-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25"
                  placeholder="Enter username"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-zinc-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={isSetup ? 8 : undefined}
                  autoComplete={isSetup ? "new-password" : "current-password"}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25"
                  placeholder={isSetup ? "Min 8 characters" : "Enter password"}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !username || !password || (isSetup && !setupCode)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              {isSetup ? "Create Account" : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
