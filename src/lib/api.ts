const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "") ?? "";

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${configuredApiUrl}${normalizedPath}`;
}

export function backendAssetUrl(path: string | null) {
  if (!path || !configuredApiUrl || !path.startsWith("/media/")) return path;
  return `${configuredApiUrl}${path}`;
}
