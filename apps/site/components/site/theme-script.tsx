export const THEME_STORAGE_KEY = 'nvoke-theme';

// Runs before first paint so the page never flashes the wrong theme. Uses the
// stored choice if there is one, otherwise the OS preference.
const script = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
