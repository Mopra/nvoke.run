export const env = {
  /** VITE_MOCK=1 runs the renderer on fake data, without the main process bridge. */
  mock: import.meta.env['VITE_MOCK'] === '1',
};
