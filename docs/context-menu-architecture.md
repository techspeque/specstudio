# Global Context Menu Architecture

## Overview

SpecStudio implements a global context menu handler to provide a native application experience by disabling the default browser right-click menu. The architecture is designed to be extensible, allowing custom context menus in specific zones in the future.

## Architecture

### Core Components

1. **Hook: `useGlobalContextMenu`** (`src/hooks/use-global-context-menu.ts`)
   - Attaches a global event listener to the `window` object
   - Uses capture phase for early interception
   - Properly cleans up on unmount

2. **Provider: `ContextMenuProvider`** (`src/components/providers/context-menu-provider.tsx`)
   - Client-side wrapper component
   - Applies the hook at the application root
   - Transparent pass-through for children

3. **Integration: `RootLayout`** (`src/app/layout.tsx`)
   - Provider wraps all application content
   - Ensures global coverage from app initialization

### Event Flow

```
User Right-Click
     ↓
Window contextmenu Event (Capture Phase)
     ↓
useGlobalContextMenu Handler
     ↓
Check for data-custom-context-menu attribute (future)
     ↓
preventDefault() - Block default menu
```

## Current Behavior

**Default**: All right-click context menus are blocked application-wide.

This provides a native desktop application feel, especially important in the Tauri environment.

## Future Extensibility

### Adding Custom Context Menus

The architecture is designed to support custom context menus in specific zones:

#### Step 1: Mark the Element

Add the `data-custom-context-menu` attribute to any element that should have a custom menu:

```tsx
<div data-custom-context-menu="file-explorer">
  {/* Your content */}
</div>
```

#### Step 2: Update the Hook Logic

Uncomment and implement the custom menu logic in `use-global-context-menu.ts`:

```typescript
const handleContextMenu = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  const customMenuElement = target.closest('[data-custom-context-menu]')

  if (customMenuElement) {
    const menuId = customMenuElement.getAttribute('data-custom-context-menu')
    event.preventDefault()

    // Dispatch custom event or call handler based on menuId
    switch (menuId) {
      case 'file-explorer':
        // Show file explorer context menu
        break
      case 'editor':
        // Show editor context menu
        break
      // ... more menu types
    }
    return
  }

  // Default: block all other context menus
  event.preventDefault()
}
```

#### Step 3: Create Menu Components

Create custom menu components that listen for your custom events or use a state management solution to show/hide menus based on the menuId.

### Example Custom Menu Zones

Potential areas for custom context menus:

- **File Explorer**: Right-click files/folders
  - `data-custom-context-menu="file-explorer"`
- **Code Editor**: Right-click in editor area
  - `data-custom-context-menu="editor"`
- **Spec Sidebar**: Right-click specs
  - `data-custom-context-menu="spec-list"`
- **Plan Viewer**: Right-click tickets
  - `data-custom-context-menu="ticket"`

## Implementation Details

### Event Listener Options

```typescript
window.addEventListener('contextmenu', handleContextMenu, { capture: true })
```

- **`capture: true`**: Intercepts events in the capture phase (before they reach target elements)
- Ensures we can prevent default behavior before any child handlers run

### Cleanup

The hook properly removes the event listener on unmount:

```typescript
return () => {
  window.removeEventListener('contextmenu', handleContextMenu, { capture: true })
}
```

This prevents memory leaks and ensures the listener is removed when the component unmounts.

### Browser & Tauri Compatibility

- **Browser**: Disables the standard browser context menu
- **Tauri**: Works seamlessly in the Tauri desktop window
- **Cross-platform**: No platform-specific code required

## Benefits

1. **Native Feel**: Application behaves like a native desktop app
2. **Consistency**: Uniform behavior across all components
3. **Extensibility**: Easy to add custom menus without refactoring
4. **Performance**: Lightweight, no external dependencies
5. **Clean Architecture**: Separation of concerns with hook + provider pattern

## Testing

### Manual Testing

1. **Verify Blocking**:
   - Right-click anywhere in the application
   - Default browser menu should NOT appear

2. **Verify in Tauri**:
   - Run `npm run tauri dev`
   - Right-click should not show browser menu

3. **Future: Verify Custom Menus**:
   - Right-click on elements with `data-custom-context-menu`
   - Custom menu should appear (once implemented)

### Code Quality

- ✅ TypeScript strict mode compatible
- ✅ No external dependencies
- ✅ Proper cleanup (no memory leaks)
- ✅ SSR-compatible (uses client-side provider)
- ✅ Build passes with no warnings

## Migration Guide

### If You Need Default Context Menu Somewhere

If a specific component needs the default browser context menu (e.g., for debugging), you can:

1. **Option A**: Use a different event phase
   ```tsx
   <div onContextMenu={(e) => e.stopPropagation()}>
     {/* This won't work with capture:true, need different approach */}
   </div>
   ```

2. **Option B**: Modify the hook to check for an "allow" attribute
   ```tsx
   <div data-allow-context-menu="true">
     {/* Default menu would appear here */}
   </div>
   ```

## Future Enhancements

Potential improvements:

- [ ] Custom context menu component library
- [ ] Menu positioning logic
- [ ] Keyboard shortcuts integration
- [ ] Menu items based on selection/context
- [ ] Nested menu support
- [ ] Menu animations and transitions
