'use client';

// ============================================================================
// Setup Wizard
// Simple wizard to configure Gemini API key and check for Claude CLI
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';
import { open } from '@tauri-apps/plugin-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  Loader2,
  Terminal,
  ChevronRight,
  ChevronLeft,
  Key,
  Sparkles
} from 'lucide-react';

interface DependencyStatus {
  name: string;
  installed: boolean;
  version: string | null;
  installUrl: string;
  description: string;
}

interface DependencyCheckResult {
  allInstalled: boolean;
  dependencies: DependencyStatus[];
}

interface SetupWizardProps {
  onComplete: () => void;
}

type SetupStep = 'welcome' | 'api-key' | 'claude-cli' | 'complete';

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [isChecking, setIsChecking] = useState(false);
  const [claudeResult, setClaudeResult] = useState<DependencyCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // API key input
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Check if setup is already complete
  useEffect(() => {
    async function checkExistingSetup() {
      try {
        const store = await Store.load('settings.json');
        const existingKey = await store.get<string>('geminiApiKey');
        const hasApiKey = !!existingKey && existingKey.trim() !== '';

        // Check if Claude CLI is installed
        const depsResult = await invoke<DependencyCheckResult>('check_dependencies');

        if (hasApiKey && depsResult.allInstalled) {
          // Everything is set up, skip wizard
          onComplete();
        } else if (hasApiKey && !depsResult.allInstalled) {
          // API key configured but Claude CLI missing
          setClaudeResult(depsResult);
          setCurrentStep('claude-cli');
        } else if (!hasApiKey && depsResult.allInstalled) {
          // Claude CLI installed but no API key
          setCurrentStep('api-key');
        }
        // Otherwise start from welcome
      } catch {
        // Ignore errors, start from beginning
      }
    }

    checkExistingSetup();
  }, [onComplete]);

  const checkClaudeCLI = useCallback(async () => {
    setIsChecking(true);
    setError(null);

    try {
      const checkResult = await invoke<DependencyCheckResult>('check_dependencies');
      setClaudeResult(checkResult);

      if (checkResult.allInstalled) {
        setCurrentStep('complete');
        setTimeout(() => {
          onComplete();
        }, 2000);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to check dependencies');
    } finally {
      setIsChecking(false);
    }
  }, [onComplete]);

  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      setError('Please enter your API key');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Validate API key first
      const validation = await invoke<{ valid: boolean; error?: string }>('validate_gemini_api_key', {
        apiKey: apiKey.trim(),
      });

      if (!validation.valid) {
        setError(validation.error || 'Invalid API key');
        setIsSaving(false);
        return;
      }

      const store = await Store.load('settings.json');
      await store.set('geminiApiKey', apiKey.trim());
      await store.set('geminiModel', 'gemini-2.5-flash'); // Set default model
      await store.save();

      // Move to Claude CLI check
      setCurrentStep('claude-cli');
      checkClaudeCLI();
    } catch (err) {
      setError((err as Error).message || 'Failed to save API key');
    } finally {
      setIsSaving(false);
    }
  };

  const openUrl = (url: string) => {
    open(url);
  };

  const renderStepIndicator = () => {
    const steps = [
      { key: 'welcome', label: 'Welcome' },
      { key: 'api-key', label: 'API Key' },
      { key: 'claude-cli', label: 'Claude CLI' },
    ];

    const currentIndex = steps.findIndex(s => s.key === currentStep);

    return (
      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((step, index) => (
          <div key={step.key} className="flex items-center">
            <div
              className={`w-2 h-2 rounded-full ${
                index <= currentIndex ? 'bg-blue-500' : 'bg-zinc-700'
              }`}
            />
            {index < steps.length - 1 && (
              <div
                className={`w-8 h-0.5 ${
                  index < currentIndex ? 'bg-blue-500' : 'bg-zinc-700'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-8">
      <div className="max-w-xl w-full">
        {currentStep !== 'welcome' && currentStep !== 'complete' && renderStepIndicator()}

        {/* Welcome Step */}
        {currentStep === 'welcome' && (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600/30 to-purple-600/30 mb-6">
              <Sparkles className="w-10 h-10 text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold text-zinc-100 mb-3">
              Welcome to SpecStudio
            </h1>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              A quick setup to get you started with AI-powered spec-driven development.
            </p>
            <Button
              onClick={() => setCurrentStep('api-key')}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700"
            >
              Get Started
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}

        {/* API Key Step */}
        {currentStep === 'api-key' && (
          <div>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-600/20 mb-4">
                <Key className="w-7 h-7 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-zinc-100 mb-2">
                Get Your Gemini API Key
              </h2>
              <p className="text-zinc-400 text-sm">
                SpecStudio uses Google Gemini for AI chat features.
              </p>
            </div>

            {error && (
              <div className="bg-red-950/50 border border-red-900 rounded-lg p-4 mb-6">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
              <ol className="space-y-4 text-sm mb-6">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-xs font-medium">1</span>
                  <div>
                    <p className="text-zinc-300">Go to Google AI Studio</p>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-blue-400"
                      onClick={() => openUrl('https://aistudio.google.com/apikey')}
                    >
                      aistudio.google.com/apikey
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-xs font-medium">2</span>
                  <p className="text-zinc-300">Sign in with your Google account</p>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-xs font-medium">3</span>
                  <p className="text-zinc-300">Click <strong>Create API Key</strong> and copy it</p>
                </li>
              </ol>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-300">
                  Paste your API Key
                </label>
                <Input
                  type="password"
                  placeholder="AIza..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 font-mono"
                />
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 mb-6">
              <p className="text-zinc-400 text-xs">
                Your API key is stored locally on your device. Google AI Studio offers a free tier with generous limits.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setCurrentStep('welcome')}
                className="border-zinc-700 hover:bg-zinc-800"
                disabled={isSaving}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={saveApiKey}
                disabled={isSaving || !apiKey.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Claude CLI Step */}
        {currentStep === 'claude-cli' && (
          <div>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-600/20 mb-4">
                <Terminal className="w-7 h-7 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-zinc-100 mb-2">
                Claude Code CLI
              </h2>
              <p className="text-zinc-400 text-sm">
                Required for AI code generation features.
              </p>
            </div>

            {error && (
              <div className="bg-red-950/50 border border-red-900 rounded-lg p-4 mb-6">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {isChecking && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <p className="text-zinc-400">Checking for Claude CLI...</p>
              </div>
            )}

            {claudeResult && !isChecking && (
              <>
                {claudeResult.allInstalled ? (
                  <div className="bg-green-950/30 border border-green-900/50 rounded-xl p-6 text-center mb-6">
                    <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-zinc-100 mb-2">
                      Claude CLI Found!
                    </h3>
                    <p className="text-zinc-400 text-sm">
                      {claudeResult.dependencies[0]?.version || 'Installed'}
                    </p>
                  </div>
                ) : (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
                    {claudeResult.dependencies.map((dep) => (
                      <div key={dep.name} className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {dep.installed ? (
                              <CheckCircle2 className="w-5 h-5 text-green-400" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-zinc-100">
                                {dep.name}
                              </span>
                              {dep.installed && dep.version && (
                                <span className="text-xs text-zinc-500 font-mono truncate max-w-[200px]">
                                  {dep.version}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-zinc-400 mb-2">
                              {dep.description}
                            </p>
                            {!dep.installed && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs border-zinc-700 hover:bg-zinc-800"
                                onClick={() => openUrl(dep.installUrl)}
                              >
                                <ExternalLink className="w-3 h-3 mr-1.5" />
                                Installation Guide
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setCurrentStep('api-key')}
                className="border-zinc-700 hover:bg-zinc-800"
                disabled={isChecking}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              {claudeResult?.allInstalled ? (
                <Button
                  onClick={() => {
                    setCurrentStep('complete');
                    setTimeout(onComplete, 2000);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  Continue
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={checkClaudeCLI}
                  disabled={isChecking}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
                  Check Again
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Complete Step */}
        {currentStep === 'complete' && (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-950/30 mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100 mb-3">
              Setup Complete!
            </h2>
            <p className="text-zinc-400 mb-6">
              SpecStudio is ready. Time to start building.
            </p>
            <div className="flex items-center justify-center gap-2 text-blue-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Launching SpecStudio...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
