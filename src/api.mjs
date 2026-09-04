const TOKEN_KEY = "mosty-portal-session-v1";

export const getToken = () => window.localStorage.getItem(TOKEN_KEY) || "";
export const setToken = (token) => token
  ? window.localStorage.setItem(TOKEN_KEY, token)
  : window.localStorage.removeItem(TOKEN_KEY);

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.details || payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function apiBlob(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.details || payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.blob();
}

export async function openApiFilePreview(path) {
  const previewWindow = window.open("", "_blank");
  if (previewWindow) {
    previewWindow.opener = null;
    previewWindow.document.title = "Načítám náhled…";
    previewWindow.document.body.textContent = "Načítám náhled…";
  }
  try {
    const blob = await apiBlob(path);
    const objectUrl = URL.createObjectURL(blob);
    if (previewWindow) previewWindow.location.replace(objectUrl);
    else {
      const link = document.createElement("a");
      link.href = objectUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
  } catch (error) {
    previewWindow?.close();
    throw error;
  }
}

export const jsonBody = (value) => JSON.stringify(value);
