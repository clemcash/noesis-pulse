import { env } from "@/lib/env";

export async function sendTelegram(
  text: string,
  opts: { fetchImpl?: typeof fetch; token?: string; chatId?: string } = {},
): Promise<void> {
  const f = opts.fetchImpl ?? fetch;
  const token = opts.token ?? env.telegramToken;
  const chatId = opts.chatId ?? env.telegramChatId;
  const res = await f(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    let desc = "";
    try {
      desc = ((await res.json()) as { description?: string }).description ?? "";
    } catch {
      /* corps non JSON */
    }
    throw new Error(`Telegram ${res.status}${desc ? ` : ${desc}` : ""}`);
  }
}
