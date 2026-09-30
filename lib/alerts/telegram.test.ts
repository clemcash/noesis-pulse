import { describe, expect, it, vi } from "vitest";
import { sendTelegram } from "./telegram";

describe("sendTelegram", () => {
  it("poste sur sendMessage", async () => {
    const f = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    await sendTelegram("coucou", { fetchImpl: f as unknown as typeof fetch, token: "T0K", chatId: "42" });
    const [url, init] = f.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/botT0K/sendMessage");
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: "42", text: "coucou", disable_web_page_preview: true });
  });
  it("erreur sans divulguer le jeton", async () => {
    const f = vi.fn(async () => new Response('{"ok":false,"description":"chat not found"}', { status: 400 }));
    const p = sendTelegram("x", { fetchImpl: f as unknown as typeof fetch, token: "SECRET", chatId: "1" });
    await expect(p).rejects.toThrow("Telegram 400 : chat not found");
  });
});
