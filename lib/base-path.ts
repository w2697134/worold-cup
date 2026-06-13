export const APP_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function appPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${APP_BASE_PATH}${normalized}`;
}
