export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/console/api${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-QuickBox-Request": "1",
      ...options?.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 && url !== "/auth/login")
      window.dispatchEvent(new Event("quickbox:expired"));
    throw new Error(body.error ?? "请求失败，请重试。");
  }
  return body as T;
}
