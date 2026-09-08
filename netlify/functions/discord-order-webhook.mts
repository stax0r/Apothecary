export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const webhookUrl = Netlify.env.get("DISCORD_WEBHOOK_URL");
  if (!webhookUrl) {
    console.error("DISCORD_WEBHOOK_URL is not configured");
    return new Response("Webhook not configured", { status: 500 });
  }

  let payload: { content?: unknown };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (typeof payload.content !== "string" || !payload.content.trim()) {
    return new Response('Missing "content" field', { status: 400 });
  }

  try {
    const discordResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: payload.content }),
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      console.error("Discord webhook error:", discordResponse.status, errorText);
      return new Response("Failed to deliver order to Discord", { status: 502 });
    }
  } catch (err) {
    console.error("Discord webhook request failed:", err);
    return new Response("Failed to deliver order to Discord", { status: 502 });
  }

  return new Response(null, { status: 204 });
};
