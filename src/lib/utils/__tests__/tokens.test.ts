import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  formatTokenCount,
  getModelLimit,
  getContextUsagePercent,
  getUsageColorClass,
  isApproachingLimit,
  MODEL_LIMITS,
} from '../tokens'

describe('Token Utilities', () => {
  describe('estimateTokens', () => {
    it('should estimate tokens from text using ~4 chars per token', () => {
      expect(estimateTokens('')).toBe(0)
      expect(estimateTokens('test')).toBe(1) // 4 chars = 1 token
      expect(estimateTokens('hello world')).toBe(3) // 11 chars = 2.75 → 3 tokens
      expect(estimateTokens('a'.repeat(100))).toBe(25) // 100 chars = 25 tokens
    })

    it('should round up fractional tokens', () => {
      expect(estimateTokens('abc')).toBe(1) // 3/4 = 0.75 → 1
      expect(estimateTokens('abcde')).toBe(2) // 5/4 = 1.25 → 2
    })
  })

  describe('formatTokenCount', () => {
    it('should format small token counts as is', () => {
      expect(formatTokenCount(0)).toBe('0')
      expect(formatTokenCount(500)).toBe('500')
      expect(formatTokenCount(999)).toBe('999')
    })

    it('should format thousands with K notation', () => {
      expect(formatTokenCount(1000)).toBe('1.0K')
      expect(formatTokenCount(1500)).toBe('1.5K')
      expect(formatTokenCount(50000)).toBe('50.0K')
      expect(formatTokenCount(999999)).toBe('1000.0K')
    })

    it('should format millions with M notation', () => {
      expect(formatTokenCount(1000000)).toBe('1.0M')
      expect(formatTokenCount(1500000)).toBe('1.5M')
      expect(formatTokenCount(2000000)).toBe('2.0M')
    })
  })

  describe('getModelLimit', () => {
    it('should return correct limits for known models', () => {
      expect(getModelLimit('gemini-2.5-pro')).toBe(2000000)
      expect(getModelLimit('gemini-2.5-flash')).toBe(1000000)
      expect(getModelLimit('gemini-2.0-flash')).toBe(1000000)
    })

    it('should return 1M default for unknown models', () => {
      expect(getModelLimit('unknown-model')).toBe(1000000)
      expect(getModelLimit('')).toBe(1000000)
    })

    it('should have correct model limits defined', () => {
      expect(MODEL_LIMITS['gemini-2.5-pro']).toBe(2000000)
      expect(MODEL_LIMITS['gemini-2.5-flash']).toBe(1000000)
    })
  })

  describe('getContextUsagePercent', () => {
    it('should calculate usage percentage correctly', () => {
      expect(getContextUsagePercent(0, 'gemini-2.5-flash')).toBe(0)
      expect(getContextUsagePercent(500000, 'gemini-2.5-flash')).toBe(50)
      expect(getContextUsagePercent(1000000, 'gemini-2.5-flash')).toBe(100)
    })

    it('should cap at 100% even if tokens exceed limit', () => {
      expect(getContextUsagePercent(2000000, 'gemini-2.5-flash')).toBe(100)
    })

    it('should work with different model limits', () => {
      expect(getContextUsagePercent(1000000, 'gemini-2.5-pro')).toBe(50)
      expect(getContextUsagePercent(2000000, 'gemini-2.5-pro')).toBe(100)
    })
  })

  describe('getUsageColorClass', () => {
    it('should return green/default for low usage (<50%)', () => {
      const greenClass = 'text-zinc-400 border-zinc-700 bg-zinc-800/50'
      expect(getUsageColorClass(0)).toBe(greenClass)
      expect(getUsageColorClass(25)).toBe(greenClass)
      expect(getUsageColorClass(49.9)).toBe(greenClass)
    })

    it('should return yellow for medium usage (50-80%)', () => {
      const yellowClass = 'text-yellow-400 border-yellow-800 bg-yellow-950/50'
      expect(getUsageColorClass(50)).toBe(yellowClass)
      expect(getUsageColorClass(65)).toBe(yellowClass)
      expect(getUsageColorClass(79.9)).toBe(yellowClass)
    })

    it('should return red for high usage (>=80%)', () => {
      const redClass = 'text-red-400 border-red-800 bg-red-950/50'
      expect(getUsageColorClass(80)).toBe(redClass)
      expect(getUsageColorClass(90)).toBe(redClass)
      expect(getUsageColorClass(100)).toBe(redClass)
    })
  })

  describe('isApproachingLimit', () => {
    it('should return false for usage below 80%', () => {
      expect(isApproachingLimit(0, 'gemini-2.5-flash')).toBe(false)
      expect(isApproachingLimit(500000, 'gemini-2.5-flash')).toBe(false) // 50%
      expect(isApproachingLimit(799999, 'gemini-2.5-flash')).toBe(false) // 79.9%
    })

    it('should return true for usage at or above 80%', () => {
      expect(isApproachingLimit(800000, 'gemini-2.5-flash')).toBe(true) // 80%
      expect(isApproachingLimit(900000, 'gemini-2.5-flash')).toBe(true) // 90%
      expect(isApproachingLimit(1000000, 'gemini-2.5-flash')).toBe(true) // 100%
    })

    it('should work with different model limits', () => {
      expect(isApproachingLimit(1600000, 'gemini-2.5-pro')).toBe(true) // 80% of 2M
      expect(isApproachingLimit(1000000, 'gemini-2.5-pro')).toBe(false) // 50% of 2M
    })
  })
})
