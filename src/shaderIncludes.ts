export const SPLAT_DEFINES_INCLUDE = "#include <splatDefines>";

export function injectSplatDefines(
  shader: string,
  splatDefines: string,
): string {
  return shader.includes(SPLAT_DEFINES_INCLUDE)
    ? shader.split(SPLAT_DEFINES_INCLUDE).join(splatDefines)
    : shader;
}
