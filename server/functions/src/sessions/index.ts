import { callable, noopCallable, requireAuth } from "../helpers/callable";
import { publicAppUrl, sendMail } from "../helpers/mailer";

// Mails recipients a link to a captured browser session. The actual rrweb dump
// stays in Firebase Storage; this just delivers the URL.
export const sendRecordingAsEmail = callable<
  { sessionRecordingData: { id: string; publicURL?: string }; recipientEmails: string[] },
  { success: boolean }
>(async (req) => {
  requireAuth(req);
  const recipients = (req.data?.recipientEmails ?? []).filter((e) => typeof e === "string" && e.includes("@"));
  if (recipients.length === 0) return { success: true };

  const recordingId = req.data?.sessionRecordingData?.id;
  if (!recordingId) return { success: false };

  const url = req.data.sessionRecordingData.publicURL || `${publicAppUrl()}/sessions/saved/${recordingId}`;
  const subject = "A session recording has been shared with you";
  const text = `A debug session recording has been shared with you on Requestly.\n\nOpen it here: ${url}`;
  const html = `<p>A debug session recording has been shared with you on Requestly.</p><p><a href="${url}">Open the session</a></p>`;

  await sendMail({ to: recipients, subject, text, html });
  return { success: true };
});

// Sales-side Apollo notification — no-op in self-host.
export const addToApolloSequence = noopCallable("sessionRecording-addToApolloSequence");
