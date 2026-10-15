import { Analytics } from "@segment/analytics-node";
import { broadcast } from "./transcript-server.js";

const SEGMENT_WRITE_KEY = process.env.SEGMENT_WRITE_KEY || "";

let analytics: Analytics | null = null;

function getAnalytics(): Analytics | null {
  if (!SEGMENT_WRITE_KEY) {
    console.warn("[segment] No SEGMENT_WRITE_KEY set — tracking disabled");
    return null;
  }
  if (!analytics) {
    analytics = new Analytics({ writeKey: SEGMENT_WRITE_KEY });
  }
  return analytics;
}

function broadcastSegmentEvent(email: string, event: string, properties: Record<string, unknown>) {
  broadcast({
    type: "segment_event",
    event,
    properties,
    timestamp: new Date().toISOString(),
  }, email);
}

export function identifyUser(email: string, traits?: Record<string, unknown>) {
  const client = getAnalytics();
  if (!client) return;
  client.identify({
    userId: email,
    traits: { email, ...traits },
  });
}

export function trackConversationStarted(
  email: string | undefined,
  channel: "voice" | "chat" | "sms",
  conversationId: string
) {
  const client = getAnalytics();
  if (!client || !email) return;
  const properties = {
    channel,
    conversationId,
    startedAt: new Date().toISOString(),
  };
  client.track({
    userId: email,
    event: "Conversation Started",
    properties,
  });
  broadcastSegmentEvent(email, "Conversation Started", properties);
}

export function trackMessageSent(
  email: string | undefined,
  channel: "voice" | "chat" | "sms",
  conversationId: string,
  role: "user" | "agent" | "assistant"
) {
  const client = getAnalytics();
  if (!client || !email) return;
  const properties = {
    channel,
    conversationId,
    role,
    sentAt: new Date().toISOString(),
  };
  client.track({
    userId: email,
    event: "Message Sent",
    properties,
  });
  broadcastSegmentEvent(email, "Message Sent", properties);
}

export function trackToolCallUsed(
  email: string,
  toolName: string,
  conversationId: string
) {
  const client = getAnalytics();
  if (!client) return;
  const properties = {
    toolName,
    conversationId,
    usedAt: new Date().toISOString(),
  };
  client.track({
    userId: email,
    event: "Tool Call Used",
    properties,
  });
  broadcastSegmentEvent(email, "Tool Call Used", properties);
}

export function trackConversationEnded(
  email: string | undefined,
  channel: "voice" | "chat" | "sms",
  conversationId: string,
  durationSeconds: number,
  toolCallsUsed: string[]
) {
  const client = getAnalytics();
  if (!client || !email) return;
  const properties = {
    channel,
    conversationId,
    durationSeconds,
    toolCallsUsed,
    toolCallCount: toolCallsUsed.length,
    endedAt: new Date().toISOString(),
  };
  client.track({
    userId: email,
    event: "Conversation Ended",
    properties,
  });
  broadcastSegmentEvent(email, "Conversation Ended", properties);
}

export async function flushSegment() {
  if (analytics) {
    await analytics.flush();
  }
}
