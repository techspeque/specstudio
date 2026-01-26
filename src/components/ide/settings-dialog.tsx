'use client';

// ============================================================================
// Settings Dialog
// Configure IDE settings like GCP Project ID and Region
// Uses tauri-plugin-store for persistent storage
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { load } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';

const STORE_FILE = 'settings.json';

// Available Gemini models from Google AI Studio
// See: https://ai.google.dev/gemini-api/docs/models
const GEMINI_MODELS = [
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview - Most capable)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recommended)' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Cost-efficient)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Advanced reasoning)' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
];

interface SettingsData {
  geminiApiKey: string;
  geminiModel: string;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';

const STORE_OPTIONS = {
  defaults: { geminiApiKey: '', geminiModel: DEFAULT_MODEL } as Record<string, unknown>,
  autoSave: true,
};

async function loadSettingsFromStore(): Promise<SettingsData> {
  try {
    const store = await load(STORE_FILE, STORE_OPTIONS);
    return {
      geminiApiKey: (await store.get<string>('geminiApiKey')) || '',
      geminiModel: (await store.get<string>('geminiModel')) || DEFAULT_MODEL,
    };
  } catch {
    return { geminiApiKey: '', geminiModel: DEFAULT_MODEL };
  }
}

async function saveSettingsToStore(settings: SettingsData): Promise<void> {
  const store = await load(STORE_FILE, STORE_OPTIONS);
  await store.set('geminiApiKey', settings.geminiApiKey);
  await store.set('geminiModel', settings.geminiModel);
  await store.save();
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved?: () => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  onSettingsSaved,
}: SettingsDialogProps) {
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState(DEFAULT_MODEL);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load current settings when dialog opens
  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const settings = await loadSettingsFromStore();
      setGeminiApiKey(settings.geminiApiKey);
      setGeminiModel(settings.geminiModel);
    } catch (err) {
      setError('Failed to load settings');
      console.error('Failed to load settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      // Validate API key first
      const validation = await invoke<{ valid: boolean; error?: string }>('validate_gemini_api_key', {
        apiKey: geminiApiKey.trim(),
      });

      if (!validation.valid) {
        setError(validation.error || 'Invalid API key');
        setIsSaving(false);
        return;
      }

      await saveSettingsToStore({
        geminiApiKey: geminiApiKey.trim(),
        geminiModel,
      });
      setSaveSuccess(true);
      onSettingsSaved?.();
      // Auto-close after successful save
      setTimeout(() => {
        onOpenChange(false);
        setSaveSuccess(false);
      }, 1000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }, [geminiApiKey, geminiModel, onOpenChange, onSettingsSaved]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-100 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Configure your SpecStudio environment.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Gemini API Key */}
            <div className="space-y-2">
              <label htmlFor="geminiApiKey" className="text-sm font-medium text-zinc-300">
                Gemini API Key
              </label>
              <Input
                id="geminiApiKey"
                type="password"
                placeholder="AIza..."
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                className="bg-zinc-950 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 font-mono"
                disabled={isSaving}
              />
              <p className="text-xs text-zinc-500">
                Get a free API key from{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  Google AI Studio
                </a>
                . No billing required.
              </p>
            </div>

            {/* Gemini Model */}
            <div className="space-y-2">
              <label htmlFor="geminiModel" className="text-sm font-medium text-zinc-300">
                Gemini Model
              </label>
              <Select value={geminiModel} onValueChange={setGeminiModel} disabled={isSaving}>
                <SelectTrigger className="bg-zinc-950 border-zinc-700 text-zinc-200">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {GEMINI_MODELS.map((model) => (
                    <SelectItem
                      key={model.value}
                      value={model.value}
                      className="text-zinc-200 focus:bg-zinc-800"
                    >
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">
                Choose the AI model for chat. Flash models are faster, Pro is more capable.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-red-950/50 border border-red-900">
                <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Success Message */}
            {saveSuccess && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-green-950/50 border border-green-900">
                <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                <p className="text-sm text-green-400">Settings saved successfully!</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-zinc-700"
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-700"
                disabled={isSaving || !geminiApiKey.trim()}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Settings'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Hook to check if Gemini API key is configured
export function useSettingsCheck() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const checkSettings = useCallback(async () => {
    setIsChecking(true);
    try {
      const settings = await loadSettingsFromStore();
      setIsConfigured(!!settings.geminiApiKey && settings.geminiApiKey.trim() !== '');
    } catch {
      setIsConfigured(false);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkSettings();
  }, [checkSettings]);

  return { isConfigured, isChecking, recheckSettings: checkSettings };
}

// Export for use in other components
export { loadSettingsFromStore };
export type { SettingsData };
