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
  | 'gen_spec'
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

// Spec Types
export interface Spec {
  filename: string;
  title: string;
  createdAt: string;
}

// Stream Event Types
export interface StreamEvent {
  type: 'output' | 'error' | 'complete' | 'input' | 'tool_call';
  data: string;
  timestamp: number;
}

// Development Plan Types
export type TicketStatus = 'todo' | 'running' | 'done';

export interface Ticket {
  id: string;
  title: string;
  requirements: string[];
  acceptance_criteria: string[];
  status?: TicketStatus;
}

export interface Phase {
  title: string;
  description: string;
  tickets: Ticket[];
}

export interface DevelopmentPlan {
  title: string;
  overview: string;
  phases: Phase[];
}
