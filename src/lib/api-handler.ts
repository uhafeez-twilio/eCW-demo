import { type NextRequest } from "next/server";

type Handler = (req: NextRequest, ctx?: any) => Promise<Response>;

const vibesUrl = process.env.VIBES_URL;
const chatId = process.env.VIBES_CHAT_ID;

export const withApiHandler =
  (handler: Handler): Handler =>
  async (req, ctx) => {
    let requestBody: string | undefined;
    try {
      requestBody = await req.clone().text();
    } catch {}

    const response = await handler(req, ctx);

    if (chatId) {
      let responseBody: string | undefined;
      try {
        responseBody = await response.clone().text();
      } catch {}

      fetch(`${vibesUrl}/api/apps/${chatId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "api",
          method: req.method,
          url: req.url,
          status: response.status,
          requestBody,
          responseBody,
        }),
      }).catch(() => {});
    }

    return response;
  };
