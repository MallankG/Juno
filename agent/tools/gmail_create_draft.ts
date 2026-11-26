import { defineTool } from "eve/tools";
import { z } from "zod";

import { googleFetch } from "../lib/google";
import { whoIsCalling } from "../lib/who";

/**
 * Saves a reply as a Gmail draft. It never sends. The user opens Gmail, reviews
 * the draft, and sends it themselves.
 */
export default defineTool({
  description:
    "Save a reply to an email as a Gmail DRAFT for the user to review. This never sends the email. Use the thread id from gmail_search so the draft replies in the same conversation.",
  label: { start: ({ subject }) => `Draft reply: ${subject}` },
  inputSchema: z.object({
    to: z.string().email(),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(8000),
    threadId: z.string().optional(),
  }),
  async execute({ to, subject, body, threadId }, ctx) {
    const subjectLine = /^(re:)/i.test(subject) ? subject : `Re: ${subject}`;
    const mime = [
      `To: ${to}`,
      `Subject: ${subjectLine}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      body,
    ].join("\r\n");
    const raw = Buffer.from(mime, "utf8").toString("base64url");
    const draft = await googleFetch<{ id: string }>(
      whoIsCalling(ctx),
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      { method: "POST", body: JSON.stringify({ message: { raw, threadId } }) },
    );
    return { saved: true, draftId: draft.id, note: "Saved as a draft in Gmail. Nothing was sent." };
  },
});
