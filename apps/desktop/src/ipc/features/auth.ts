import type { User } from '@nvoke/shared';

export const AuthChannel = {
  authGetState: 'auth:get-state',
  authSignIn: 'auth:sign-in',
  authCancel: 'auth:cancel',
  authSignOut: 'auth:sign-out',
  /** Main to renderer push, payload AuthState. */
  authChanged: 'auth:changed',
} as const;

/**
 * Sign-in state as the renderer sees it. The device token stays in the main
 * process and never crosses the bridge.
 */
export type AuthState =
  | { status: 'signed-out'; error?: string }
  /** The browser is open on the sign-in page and the app waits for nvoke://auth/callback. */
  | { status: 'pending' }
  /** `user` is null while the profile loads or when the server is unreachable. */
  | { status: 'signed-in'; user: User | null };

export interface AuthApi {
  getState(): Promise<AuthState>;
  /** Opens the sign-in page in the system browser. */
  signIn(): Promise<void>;
  /** Abandons a pending browser sign-in. */
  cancelSignIn(): Promise<void>;
  /** Revokes the device session on the server and forgets the token. */
  signOut(): Promise<void>;
  /** Subscribes to state changes. Returns an unsubscribe function. */
  onChange(listener: (state: AuthState) => void): () => void;
}

export interface AuthBridge {
  auth: AuthApi;
}
