'use client'

import { useEffect } from 'react'

/**
 * Global Context Menu Handler
 *
 * Disables the default browser right-click context menu across the entire application
 * while establishing a pattern for custom context menus in specific zones.
 *
 * Future Extension Pattern:
 * - Add `data-custom-context-menu="menu-id"` to elements that need custom menus
 * - The hook will check for this attribute and allow custom handling
 * - For now, all context menus are blocked by default
 *
 * @example
 * // In a component that needs a custom menu (future):
 * <div data-custom-context-menu="file-explorer">
 *   Right-click here for custom menu
 * </div>
 */
export function useGlobalContextMenu() {
	useEffect(() => {
		const handleContextMenu = (event: MouseEvent) => {
			// TODO: Future extensibility - check for custom context menu zones
			//
			// Example future logic:
			// const target = event.target as HTMLElement
			// const customMenuElement = target.closest('[data-custom-context-menu]')
			//
			// if (customMenuElement) {
			//   const menuId = customMenuElement.getAttribute('data-custom-context-menu')
			//   // Handle custom menu logic here based on menuId
			//   // For now, we would still prevent default and trigger custom menu
			//   event.preventDefault()
			//   return
			// }

			// Default behavior: block all context menus
			event.preventDefault()
		}

		// Attach listener to window for global coverage
		window.addEventListener('contextmenu', handleContextMenu, { capture: true })

		// Cleanup on unmount
		return () => {
			window.removeEventListener('contextmenu', handleContextMenu, { capture: true })
		}
	}, [])
}
