export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Could not reach your workspace. Please try again.");
  }
  if (!response.ok)
    throw new Error(
      (result as { error?: string }).error ||
        "Could not save. Please try again.",
    );
  return result as T;
}
