/** Native notifications and the dock or taskbar badge when a drop delivers. */
export const NotificationsChannel = {
  notificationsGetSettings: 'notifications:get-settings',
  notificationsSetEnabled: 'notifications:set-enabled',
  /** Renderer to main, fire and forget, payload a search id. */
  notificationsMarkSeen: 'notifications:mark-seen',
  /** Main to renderer push, payload a search id: a notification was clicked. */
  notificationsOpenSearch: 'notifications:open-search',
} as const;

export interface NotificationSettings {
  /** Native notifications and the unseen badge for finished drops. */
  enabled: boolean;
  /** False when the OS cannot show notifications. */
  supported: boolean;
}

export interface NotificationsApi {
  getSettings(): Promise<NotificationSettings>;
  setEnabled(enabled: boolean): Promise<NotificationSettings>;
  /** The search was opened, so its leads no longer count on the badge. */
  markSeen(searchId: string): void;
  /** Subscribes to a click on a drop notification. Returns an unsubscribe function. */
  onOpenSearch(listener: (searchId: string) => void): () => void;
}

export interface NotificationsBridge {
  notifications: NotificationsApi;
}
