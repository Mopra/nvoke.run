// VITE_ variables electron-vite bakes into the main process bundle.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SITE_URL?: string;
}
