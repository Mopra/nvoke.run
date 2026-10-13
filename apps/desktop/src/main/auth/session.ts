import { DesktopTokenResponse, MeResponse } from '@nvoke/shared';
import type { AuthState } from '../../ipc/contract';
import { buildSignInUrl, createPendingAuth, parseCallbackUrl, type PendingAuth } from './flow';

/** Where the device token lives between launches. */
export interface TokenStore {
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface AuthSessionDeps {
  apiUrl: string;
  siteUrl: string;
  deviceName: string;
  tokenStore: TokenStore;
  openExternal(url: string): Promise<void>;
  /** Called on every state change, to push it to the renderer. */
  onChange(state: AuthState): void;
  fetch?: typeof fetch;
}

/**
 * Owns the device token in the main process: starts the browser sign-in,
 * redeems the callback code, attaches the token to API calls and signs out.
 * The renderer only ever sees AuthState.
 */
export class AuthSession {
  private state: AuthState = { status: 'signed-out' };
  private pending: PendingAuth | null = null;
  private token: string | null = null;
  private readonly fetch: typeof fetch;

  constructor(private readonly deps: AuthSessionDeps) {
    this.fetch = deps.fetch ?? globalThis.fetch;
  }

  getState(): AuthState {
    return this.state;
  }

  /** Loads a stored token and fetches the profile behind it. */
  async init(): Promise<void> {
    this.token = await this.deps.tokenStore.load();
    if (this.token) {
      this.setState({ status: 'signed-in', user: null });
      await this.refreshUser();
    }
  }

  async signIn(): Promise<void> {
    this.pending = createPendingAuth();
    this.setState({ status: 'pending' });
    await this.deps.openExternal(buildSignInUrl(this.deps.siteUrl, this.pending));
  }

  cancelSignIn(): void {
    if (this.state.status !== 'pending') return;
    this.pending = null;
    this.setState({ status: 'signed-out' });
  }

  /** Handles nvoke://auth/callback. Returns true when the app is now signed in. */
  async handleCallback(url: string): Promise<boolean> {
    const parsed = parseCallbackUrl(url, this.pending);
    if (!parsed.ok) {
      // A stray or replayed link must not sign out a working session.
      if (this.state.status !== 'signed-in') this.setState({ status: 'signed-out', error: parsed.error });
      return false;
    }
    const pending = this.pending!;
    // One callback per attempt, whatever happens next.
    this.pending = null;

    try {
      const res = await this.fetch(`${this.deps.apiUrl}/v1/desktop/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: parsed.code, code_verifier: pending.codeVerifier, device_name: this.deps.deviceName }),
      });
      if (!res.ok) throw new Error(`The server refused the sign-in (${res.status}).`);
      const { token } = DesktopTokenResponse.parse(await res.json());
      this.token = token;
      await this.deps.tokenStore.save(token);
    } catch (err) {
      this.setState({ status: 'signed-out', error: err instanceof Error ? err.message : String(err) });
      return false;
    }

    this.setState({ status: 'signed-in', user: null });
    await this.refreshUser();
    return true;
  }

  async signOut(): Promise<void> {
    const token = this.token;
    this.token = null;
    this.pending = null;
    await this.deps.tokenStore.clear();
    this.setState({ status: 'signed-out' });
    if (token) {
      // Best effort: the token is already gone locally.
      await this.fetch(`${this.deps.apiUrl}/v1/desktop/sign-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
  }

  /**
   * Calls apps/server with the device token attached. A 401 means the session
   * was revoked, so the app signs out locally.
   */
  async api(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    const res = await this.fetch(`${this.deps.apiUrl}${path}`, { ...init, headers });
    if (res.status === 401 && this.token) {
      this.token = null;
      await this.deps.tokenStore.clear();
      this.setState({ status: 'signed-out', error: 'You were signed out. Sign in again.' });
    }
    return res;
  }

  private async refreshUser(): Promise<void> {
    try {
      const res = await this.api('/v1/me');
      if (!res.ok) return;
      const me = MeResponse.parse(await res.json());
      if (this.token) this.setState({ status: 'signed-in', user: me.user });
    } catch {
      // Offline or server down: stay signed in, the profile shows up later.
    }
  }

  private setState(next: AuthState): void {
    this.state = next;
    this.deps.onChange(next);
  }
}
