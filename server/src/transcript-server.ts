import { WebSocket, WebSocketServer } from "ws";

export interface TranscriptEntry {
  id: string;
  conversationId: string;
  role: "user" | "agent" | "tool";
  text: string;
  timestamp: string;
  channel?: "voice" | "chat" | "sms";
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
}

export interface ConversationInfo {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: "active" | "ended";
  transcript: TranscriptEntry[];
  userEmail?: string;
  userPhone?: string;
  conversationsV2Sid?: string;
  customerParticipantId?: string;
  agentParticipantId?: string;
}

export const conversations = new Map<string, ConversationInfo>();

const wsClients = new Set<WebSocket>();
const wsClientEmails = new Map<WebSocket, string>();

// Get the email of any connected client (for voice calls where the frontend didn't initiate the conversation)
export function getConnectedUserEmail(): string | undefined {
  for (const [, email] of wsClientEmails) {
    if (email) return email;
  }
  return undefined;
}

export type ChatMessageHandler = (
  conversationId: string | null,
  text: string,
  userEmail?: string
) => Promise<void>;

export type EndConversationHandler = (
  conversationId: string
) => Promise<void>;

let chatMessageHandler: ChatMessageHandler | null = null;
let endConversationHandler: EndConversationHandler | null = null;

export function setChatMessageHandler(handler: ChatMessageHandler) {
  chatMessageHandler = handler;
}

export function setEndConversationHandler(handler: EndConversationHandler) {
  endConversationHandler = handler;
}

export function broadcast(event: object, targetEmail?: string) {
  const data = JSON.stringify(event);
	
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      if (targetEmail) {
        const clientEmail = wsClientEmails.get(client);
        if (clientEmail === targetEmail) {
          client.send(data);
        }
      } else {
        client.send(data);
      }
    }
  }
}

export function broadcastForConversation(event: object, conversationId: string) {
  const conv = conversations.get(conversationId);
  const email = conv?.userEmail;
  broadcast(event, email);
}

export function setupWebSocket(wss: WebSocketServer) {
  wss.on("connection", (ws) => {
    wsClients.add(ws);

    // Don't send conversations yet — wait for identify message

    ws.on("message", async (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === "identify" && data.userEmail) {
          console.log(`[ws] Client identified as: ${data.userEmail}`);
          wsClientEmails.set(ws, data.userEmail);

          // Send only conversations belonging to this user
          const userConversations = Array.from(conversations.values()).filter(
            (c) => c.userEmail === data.userEmail
          );
          ws.send(
            JSON.stringify({
              type: "init",
              conversations: userConversations,
            })
          );
        } else if (data.type === "start_conversation" && data.conversationId) {
					console.log(data);
          if (!conversations.has(data.conversationId)) {
            const info: ConversationInfo = {
              id: data.conversationId,
              startedAt: new Date().toISOString(),
              status: "active",
              transcript: [],
              userEmail: data.userEmail || undefined,
            };
            conversations.set(data.conversationId, info);
            broadcast({ type: "conversation_started", conversation: info });
          } else if (data.userEmail) {
            const conv = conversations.get(data.conversationId)!;
            conv.userEmail = data.userEmail;
          }
        } else if (data.type === "end_conversation" && data.conversationId) {
          console.log(`[ws] end_conversation received - conversationId: "${data.conversationId}"`);
          if (endConversationHandler) {
            await endConversationHandler(data.conversationId);
          }
        } else if (data.type === "chat_message" && data.text) {
          console.log(`[ws] chat_message received - userEmail: "${data.userEmail}", conversationId: "${data.conversationId}", text: "${data.text}"`);
          if (chatMessageHandler) {
            await chatMessageHandler(
              data.conversationId || null,
              data.text,
              data.userEmail
            );
          }
        }
      } catch (err) {
        console.error("[ws] Failed to process message:", err);
      }
    });

    ws.on("close", () => {
      wsClients.delete(ws);
      wsClientEmails.delete(ws);
    });
  });
}
