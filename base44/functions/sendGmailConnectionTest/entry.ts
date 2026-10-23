import { createClientFromRequest } from "npm:@base44/sdk";

const RECIPIENT = "lvcostitan@gmail.com";
const SUBJECT = "LVCOS-GMAIL-CONNECTION-TEST";

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json(
        { success: false, stage: "request", error: "Method not allowed" },
        { status: 405 },
      );
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json(
        { success: false, stage: "authorization", error: "Unauthorized" },
        { status: 401 },
      );
    }

    if (user.role !== "admin") {
      return Response.json(
        {
          success: false,
          stage: "authorization",
          error: "Only an administrator can run the Gmail connection test",
        },
        { status: 403 },
      );
    }

    let accessToken: string;
    try {
      const connection =
        await base44.asServiceRole.connectors.getConnection("gmail");
      accessToken = connection.accessToken;
    } catch (error) {
      return Response.json(
        {
          success: false,
          stage: "connector",
          error: error instanceof Error ? error.message : String(error),
        },
        { status: 503 },
      );
    }

    const now = new Date();
    const messageId = `<${crypto.randomUUID()}@lvcos.local>`;
    const body = [
      "This is a controlled Gmail connection test from LVC OS.",
      "",
      "No ServiceTitan or Zapier workflow was triggered.",
      `Sent at: ${now.toISOString()}`,
      `Requested by: ${user.email || user.id || "authenticated administrator"}`,
    ].join("\r\n");

    const rawMessage = [
      `To: ${RECIPIENT}`,
      `From: ${RECIPIENT}`,
      `Subject: ${SUBJECT}`,
      `Date: ${now.toUTCString()}`,
      `Message-ID: ${messageId}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
    ].join("\r\n");

    const gmailResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encodeBase64Url(rawMessage) }),
      },
    );

    const responseText = await gmailResponse.text();
    let gmailData: Record<string, unknown> = {};
    try {
      gmailData = responseText ? JSON.parse(responseText) : {};
    } catch {
      gmailData = { raw_response: responseText };
    }

    if (!gmailResponse.ok) {
      return Response.json(
        {
          success: false,
          stage: "gmail_send",
          error:
            (gmailData as { error?: { message?: string } }).error?.message ||
            `Gmail returned HTTP ${gmailResponse.status}`,
          gmail_status: gmailResponse.status,
        },
        { status: 502 },
      );
    }

    return Response.json({
      success: true,
      stage: "accepted",
      recipient: RECIPIENT,
      subject: SUBJECT,
      gmail_message_id: gmailData.id || null,
      gmail_thread_id: gmailData.threadId || null,
      accepted_at: now.toISOString(),
    });
  } catch (error) {
    console.error("Gmail connection test failed", error);
    return Response.json(
      {
        success: false,
        stage: "unexpected",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
});
