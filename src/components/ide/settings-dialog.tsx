'use client';

// ============================================================================
// Settings Dialog
// Configure IDE settings like GCP Project ID
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
import { Settings, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

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
  const [gcpProjectId, setGcpProjectId] = useState('');
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
      if (window.electron?.settings) {
        const value = await window.electron.settings.get('gcpProjectId');
        setGcpProjectId(value ?? '');
      }
    } catch (err) {
      setError('Failed to load settings');
      console.error('Failed to load settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    if (!window.electron?.settings) {
      setError('Settings not available in web mode');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const result = await window.electron.settings.set('gcpProjectId', gcpProjectId.trim());
      if (result.success) {
        setSaveSuccess(true);
        onSettingsSaved?.();
        // Auto-close after successful save
        setTimeout(() => {
          onOpenChange(false);
          setSaveSuccess(false);
        }, 1000);
      } else {
        setError(result.error ?? 'Failed to save settings');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }, [gcpProjectId, onOpenChange, onSettingsSaved]);

  const isElectronEnv = typeof window !== 'undefined' && window.electron?.platform?.isElectron === true;

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

        {!isElectronEnv ? (
          <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-950/50 border border-yellow-900">
            <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-sm text-yellow-400">
              Settings persistence is only available in the desktop app.
              Use environment variables in web mode.
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* GCP Project ID */}
            <div className="space-y-2">
              <label htmlFor="gcpProjectId" className="text-sm font-medium text-zinc-300">
                Google Cloud Project ID
              </label>
              <Input
                id="gcpProjectId"
                type="text"
                placeholder="my-gcp-project-id"
                value={gcpProjectId}
                onChange={(e) => setGcpProjectId(e.target.value)}
                className="bg-zinc-950 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 font-mono"
                disabled={isSaving}
              />
              <p className="text-xs text-zinc-500">
                Required for Gemini chat. Find your project ID in the Google Cloud Console.
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
                disabled={isSaving || !gcpProjectId.trim()}
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

// Hook to check if GCP Project ID is configured
export function useSettingsCheck() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const checkSettings = useCallback(async () => {
    setIsChecking(true);
    try {
      if (window.electron?.settings) {
        const gcpProjectId = await window.electron.settings.get('gcpProjectId');
        setIsConfigured(!!gcpProjectId && gcpProjectId.trim() !== '');
      } else {
        // In web mode, assume configured (uses env vars)
        setIsConfigured(true);
      }
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
