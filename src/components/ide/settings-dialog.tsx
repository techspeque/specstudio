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

const STORE_FILE = 'settings.json';

// Common GCP regions for Vertex AI
const GCP_REGIONS = [
  { value: 'us-central1', label: 'US Central (Iowa)' },
  { value: 'us-east1', label: 'US East (South Carolina)' },
  { value: 'us-east4', label: 'US East (Virginia)' },
  { value: 'us-west1', label: 'US West (Oregon)' },
  { value: 'us-west4', label: 'US West (Las Vegas)' },
  { value: 'europe-west1', label: 'Europe West (Belgium)' },
  { value: 'europe-west2', label: 'Europe West (London)' },
  { value: 'europe-west3', label: 'Europe West (Frankfurt)' },
  { value: 'europe-west4', label: 'Europe West (Netherlands)' },
  { value: 'asia-east1', label: 'Asia East (Taiwan)' },
  { value: 'asia-northeast1', label: 'Asia Northeast (Tokyo)' },
  { value: 'asia-northeast3', label: 'Asia Northeast (Seoul)' },
  { value: 'asia-south1', label: 'Asia South (Mumbai)' },
  { value: 'asia-southeast1', label: 'Asia Southeast (Singapore)' },
  { value: 'australia-southeast1', label: 'Australia (Sydney)' },
];

interface SettingsData {
  gcpProjectId: string;
  gcpRegion: string;
}

const DEFAULT_REGION = 'us-central1';

const STORE_OPTIONS = {
  defaults: { gcpProjectId: '', gcpRegion: DEFAULT_REGION } as Record<string, unknown>,
  autoSave: true,
};

async function loadSettingsFromStore(): Promise<SettingsData> {
  try {
    const store = await load(STORE_FILE, STORE_OPTIONS);
    return {
      gcpProjectId: (await store.get<string>('gcpProjectId')) || '',
      gcpRegion: (await store.get<string>('gcpRegion')) || DEFAULT_REGION,
    };
  } catch {
    return { gcpProjectId: '', gcpRegion: DEFAULT_REGION };
  }
}

async function saveSettingsToStore(settings: SettingsData): Promise<void> {
  const store = await load(STORE_FILE, STORE_OPTIONS);
  await store.set('gcpProjectId', settings.gcpProjectId);
  await store.set('gcpRegion', settings.gcpRegion);
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
  const [gcpProjectId, setGcpProjectId] = useState('');
  const [gcpRegion, setGcpRegion] = useState(DEFAULT_REGION);
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
      setGcpProjectId(settings.gcpProjectId);
      setGcpRegion(settings.gcpRegion);
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
      await saveSettingsToStore({
        gcpProjectId: gcpProjectId.trim(),
        gcpRegion,
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
  }, [gcpProjectId, gcpRegion, onOpenChange, onSettingsSaved]);

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

            {/* GCP Region */}
            <div className="space-y-2">
              <label htmlFor="gcpRegion" className="text-sm font-medium text-zinc-300">
                Vertex AI Region
              </label>
              <Select value={gcpRegion} onValueChange={setGcpRegion} disabled={isSaving}>
                <SelectTrigger className="bg-zinc-950 border-zinc-700 text-zinc-200">
                  <SelectValue placeholder="Select a region" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {GCP_REGIONS.map((region) => (
                    <SelectItem
                      key={region.value}
                      value={region.value}
                      className="text-zinc-200 focus:bg-zinc-800"
                    >
                      {region.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">
                Choose a region close to you for lower latency.
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
      const settings = await loadSettingsFromStore();
      setIsConfigured(!!settings.gcpProjectId && settings.gcpProjectId.trim() !== '');
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
