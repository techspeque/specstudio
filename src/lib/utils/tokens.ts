// ============================================================================
// Token Estimation Utilities
// Provides approximate token counts and context limit tracking for Gemini models
// ============================================================================

/**
 * Estimate token count from text
 * Uses the ~4 characters per token heuristic common for LLMs
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Format token count for display
 * Converts large numbers to K/M notation
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

/**
 * Context limits for Gemini models (in tokens)
 * See: https://ai.google.dev/gemini-api/docs/models
 */
export const MODEL_LIMITS: Record<string, number> = {
  'gemini-3-flash-preview': 1000000,
  'gemini-3-pro-preview': 1000000,
  'gemini-2.5-flash': 1000000,
  'gemini-2.5-flash-lite': 1000000,
  'gemini-2.5-pro': 2000000,
  'gemini-2.0-flash': 1000000,
};

/**
 * Get the context limit for a model
 * Returns 1M as default if model not found
 */
export function getModelLimit(model: string): number {
  return MODEL_LIMITS[model] || 1000000;
}

/**
 * Calculate context usage as a percentage
 */
export function getContextUsagePercent(tokens: number, model: string): number {
  const limit = getModelLimit(model);
  return Math.min(100, (tokens / limit) * 100);
}

/**
 * Get color class based on usage percentage
 * - Green (default): < 50%
 * - Yellow: 50-80%
 * - Red: > 80%
 */
export function getUsageColorClass(percent: number): string {
  if (percent >= 80) return 'text-red-400 border-red-800 bg-red-950/50';
  if (percent >= 50) return 'text-yellow-400 border-yellow-800 bg-yellow-950/50';
  return 'text-zinc-400 border-zinc-700 bg-zinc-800/50';
}

/**
 * Check if context is approaching limit (>80%)
 */
export function isApproachingLimit(tokens: number, model: string): boolean {
  return getContextUsagePercent(tokens, model) >= 80;
}
