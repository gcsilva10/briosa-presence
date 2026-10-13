export function apiUrl(path: string) {
  // Archive is generated into public/data during the build.
  return path;
}
export function backendAssetUrl(path: string | null) { return path; }
export async function archiveFetch(path: string, options?: RequestInit) {
  return fetch(path, options);
}
