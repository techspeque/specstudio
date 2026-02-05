'use client'

import { useGlobalContextMenu } from '@/hooks/use-global-context-menu'

/**
 * Context Menu Provider
 *
 * Client-side wrapper component that applies the global context menu handler.
 * This component should be placed at the root level of the application to ensure
 * the context menu behavior is active across all pages and components.
 *
 * The hook it uses disables the default browser context menu while establishing
 * a pattern for custom context menus in specific zones.
 */
export function ContextMenuProvider({ children }: { children: React.ReactNode }) {
	useGlobalContextMenu()

	return <>{children}</>
}
