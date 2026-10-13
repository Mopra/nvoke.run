/** Follows the OS light or dark preference by toggling the `dark` class. */
export function followSystemTheme(): void {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = (): void => {
    document.documentElement.classList.toggle('dark', query.matches);
  };
  apply();
  query.addEventListener('change', apply);
}
