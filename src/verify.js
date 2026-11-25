export async function verifyCaption(text) {
  const res = await fetch("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  const { human } = await res.json();
  if (typeof human !== "number") throw new Error("unexpected response");
  return human;
}

export const verdictLabel = (v) => (v.pending ? "…" : v.error ? "Not verified" : `Human ${Math.round(v.human * 100)}%`);
