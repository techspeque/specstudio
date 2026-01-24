// ============================================================================
// SpecStudio Types
// ============================================================================

export type AuthProvider = 'google' | 'anthropic';

export interface AuthStatus {
  google: boolean;
  anthropic: boolean;
}

export interface AuthResponse {
  success: boolean;
  provider: AuthProvider;
  message: string;
}

// RPC Action Types
export type RpcAction =
  | 'chat'
  | 'validate'
  | 'create_code'
  | 'gen_tests'
  | 'run_tests'
  | 'run_app';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RpcRequest {
  action: RpcAction;
  payload: {
    prompt?: string;
    history?: ChatMessage[];
    specContent?: string;
    adrContext?: string;
    workingDirectory?: string;
  };
}

export interface RpcResponse {
  success: boolean;
  action: RpcAction;
  data?: string;
  error?: string;
  stream?: boolean;
}

// ADR Types
export interface ADR {
  id: string;
  title: string;
  status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
  context: string;
  decision: string;
  consequences: string;
  filename: string;
}

// Stream Event Types
export interface StreamEvent {
  type: 'output' | 'error' | 'complete';
  data: string;
  timestamp: number;
}
