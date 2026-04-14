export async function formatJavaScript(code: string): Promise<string> {
  const [prettier, pluginBabel, pluginEstree] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
  ]);
  return prettier.format(code, {
    parser: "babel",
    plugins: [pluginBabel.default, pluginEstree.default],
    semi: true,
    singleQuote: false,
  });
}

export async function formatJson(code: string): Promise<string> {
  try {
    return JSON.stringify(JSON.parse(code), null, 2);
  } catch {
    return code;
  }
}
