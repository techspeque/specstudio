// ============================================================================
// Electron Preload Script
// Exposes safe IPC methods to the renderer process via contextBridge
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

// ============================================================================
// Context Bridge API
// ============================================================================

contextBridge.exposeInMainWorld('electron', {
  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------
  auth: {
    /**
     * Check authentication status for Google Cloud and Anthropic
     * @returns {Promise<{google: boolean, anthropic: boolean}>}
     */
    check: () => ipcRenderer.invoke('auth:check'),

    /**
     * Trigger login for a provider
     * @param {string} provider - 'google' or 'anthropic'
     * @returns {Promise<{success: boolean, provider: string, message: string}>}
     */
    login: (provider) => ipcRenderer.invoke('auth:login', provider),
  },

  // -------------------------------------------------------------------------
  // Workspace Management
  // -------------------------------------------------------------------------
  workspace: {
    /**
     * Validate a workspace path (creates if doesn't exist)
     * @param {string} path - Absolute path to workspace
     * @returns {Promise<{valid: boolean, path?: string, error?: string, created?: boolean}>}
     */
    validate: (path) => ipcRenderer.invoke('workspace:validate', path),

    /**
     * Read workspace data (spec.md and ADRs)
     * @param {string} workingDirectory - Workspace path
     * @returns {Promise<{specContent: string, adrs: Array, workingDirectory: string}>}
     */
    read: (workingDirectory) => ipcRenderer.invoke('workspace:read', workingDirectory),

    /**
     * Save spec content to workspace
     * @param {{specContent: string, workingDirectory: string}} data
     * @returns {Promise<{success: boolean}>}
     */
    save: (data) => ipcRenderer.invoke('workspace:save', data),

    /**
     * Open native OS folder picker dialog
     * @returns {Promise<{canceled: boolean, path?: string}>}
     */
    browse: () => ipcRenderer.invoke('workspace:browse'),
  },

  // -------------------------------------------------------------------------
  // RPC (Remote Procedure Call) for LLM and Shell actions
  // -------------------------------------------------------------------------
  rpc: {
    /**
     * Execute a non-streaming RPC action
     * @param {string} action - 'chat' or 'validate'
     * @param {object} payload
     * @returns {Promise<{success: boolean, action: string, data?: string, error?: string}>}
     */
    execute: (action, payload) => ipcRenderer.invoke('rpc:execute', { action, payload }),

    /**
     * Start a streaming RPC action
     * @param {string} action - 'create_code', 'gen_tests', 'run_tests', 'run_app'
     * @param {object} payload
     * @returns {Promise<{started: boolean}>}
     */
    stream: (action, payload) => ipcRenderer.invoke('rpc:stream', { action, payload }),

    /**
     * Cancel active streaming processes
     * @returns {Promise<{success: boolean}>}
     */
    cancel: () => ipcRenderer.invoke('rpc:cancel'),

    /**
     * Subscribe to streaming data events
     * @param {function} callback - Called with {type, data, timestamp}
     * @returns {function} Unsubscribe function
     */
    onStreamData: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('rpc:stream:data', handler);
      return () => ipcRenderer.removeListener('rpc:stream:data', handler);
    },
  },

  // -------------------------------------------------------------------------
  // Settings (Persistent Storage)
  // -------------------------------------------------------------------------
  settings: {
    /**
     * Get a setting by key
     * @param {string} key - Setting key (e.g., 'gcpProjectId')
     * @returns {Promise<any>}
     */
    get: (key) => ipcRenderer.invoke('settings:get', key),

    /**
     * Set a setting value
     * @param {string} key - Setting key
     * @param {any} value - Setting value
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),

    /**
     * Get all settings
     * @returns {Promise<object>}
     */
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },

  // -------------------------------------------------------------------------
  // Platform Info
  // -------------------------------------------------------------------------
  platform: {
    /**
     * Get the current platform
     * @returns {string} 'darwin', 'linux', or 'win32'
     */
    get: () => process.platform,

    /**
     * Check if running in Electron
     * @returns {boolean}
     */
    isElectron: true,
  },
});

// ============================================================================
// Type Definitions (for documentation)
// ============================================================================

/**
 * @typedef {Object} AuthStatus
 * @property {boolean} google
 * @property {boolean} anthropic
 */

/**
 * @typedef {Object} AuthResponse
 * @property {boolean} success
 * @property {string} provider
 * @property {string} message
 */

/**
 * @typedef {Object} WorkspaceValidation
 * @property {boolean} valid
 * @property {string} [path]
 * @property {string} [error]
 * @property {boolean} [created]
 */

/**
 * @typedef {Object} WorkspaceData
 * @property {string} specContent
 * @property {Array} adrs
 * @property {string} workingDirectory
 */

/**
 * @typedef {Object} StreamEvent
 * @property {string} type - 'output', 'error', or 'complete'
 * @property {string} data
 * @property {number} timestamp
 */
