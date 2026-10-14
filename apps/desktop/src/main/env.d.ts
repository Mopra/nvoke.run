// VITE_ variables electron-vite bakes into the main process bundle.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SITE_URL?: string;
}

// Vite inlines `?raw` imports as a string (CHANGELOG.md for the What's new card).
declare module '*?raw' {
  const content: string;
  export default content;
}
