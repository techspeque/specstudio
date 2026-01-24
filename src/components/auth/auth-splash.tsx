'use client';

// ============================================================================
// Auth Splash Screen
// Blocks IDE until both providers are authenticated
// ============================================================================

import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Cloud, Bot } from 'lucide-react';

export function AuthSplash() {
  const { status, isLoading, login, error } = useAuth();

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800">
            <Bot className="h-8 w-8 text-zinc-300" />
          </div>
          <CardTitle className="text-2xl text-zinc-100">SpecStudio</CardTitle>
          <CardDescription className="text-zinc-400">
            AI-Powered Spec-Driven Development
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-500 text-center mb-6">
            Authenticate with both providers to access the IDE
          </p>

          {/* Google Auth */}
          <AuthProviderCard
            name="Google Cloud"
            description="Gemini via Vertex AI"
            icon={<Cloud className="h-5 w-5" />}
            isAuthenticated={status.google}
            isLoading={isLoading}
            onLogin={() => login('google')}
          />

          {/* Anthropic Auth */}
          <AuthProviderCard
            name="Anthropic"
            description="Claude Code CLI"
            icon={<Bot className="h-5 w-5" />}
            isAuthenticated={status.anthropic}
            isLoading={isLoading}
            onLogin={() => login('anthropic')}
          />

          {error && (
            <div className="mt-4 p-3 rounded-md bg-red-950/50 border border-red-900">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <p className="text-xs text-zinc-600 text-center mt-6">
            Authentication uses local application-default credentials.
            <br />
            No API keys required.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

interface AuthProviderCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  isAuthenticated: boolean;
  isLoading: boolean;
  onLogin: () => void;
}

function AuthProviderCard({
  name,
  description,
  icon,
  isAuthenticated,
  isLoading,
  onLogin,
}: AuthProviderCardProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-700 text-zinc-300">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-200">{name}</p>
          <p className="text-xs text-zinc-500">{description}</p>
        </div>
      </div>
      <div>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        ) : isAuthenticated ? (
          <Badge variant="outline" className="bg-green-950/50 border-green-800 text-green-400">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-600 hover:bg-zinc-700"
            onClick={onLogin}
          >
            <XCircle className="h-3 w-3 mr-1 text-red-400" />
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}
