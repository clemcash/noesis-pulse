export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Erreur inconnue";
}

/** Ne rejette jamais : transforme une promesse en Result (une tuile KO ne casse pas la page). */
export async function settle<T>(p: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await p };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
