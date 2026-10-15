import Fastify, { FastifyServerOptions } from "fastify";
import type { IncomingMessage } from "http";
import {
  SMSChannel,
  TAC,
  TACConfig,
  TACServer,
  VoiceChannel,
} from "twilio-agent-connect";
import { WebSocketServer } from "ws";
import { generateAgentResponse } from "./agent.js";
import {
  addCommunication,
  createChatConversation,
  ensureChatParticipants,
  findActiveConversationForUser,
} from "./conversations-v2.js";
import { getProfileEmail, lookupProfileByPhone } from "./memory.js";
import {
  trackConversationEnded,
  trackConversationStarted,
  trackMessageSent,
} from "./segment.js";
import {
  broadcastForConversation,
  ConversationInfo,
  conversations,
  getConnectedUserEmail,
  setChatMessageHandler,
  setEndConversationHandler,
  setupWebSocket,
  TranscriptEntry,
} from "./transcript-server.js";
import { generateId } from "./utils.js";

// Inside the MicroVM preview, Twilio can only reach this server through the
// unauthenticated `/public/twilio/server-app/*` proxy path — but the proxy
// strips that prefix before the request reaches us, so by the time Fastify
// sees it, the URL is back to the plain `/twiml`, `/ws`, etc. That breaks
// Twilio's request signature validation (it's computed against the exact
// URL Twilio called, prefix and all) and would send ConversationRelay's
// WebSocket to an unprefixed, unauthenticated-looking path.
//
// Fix: register TAC's webhook routes AT the prefixed paths, and use
// Fastify's `rewriteUrl` hook to add the prefix back onto the small,
// known set of TAC webhook requests before routing — restoring exactly
// the URL Twilio actually called, for both routing and signature checks.
// This only applies inside the MicroVM preview; once deployed to Railway,
// Twilio calls the real (unprefixed) URL directly, so no rewriting happens.
const IS_MICROVM_PREVIEW =
  process.env.NEXT_PUBLIC_IS_MICROVM_PREVIEW === "true";
const PUBLIC_PREFIX = "/public/twilio/server-app";
const TAC_WEBHOOK_PATHS = [
  "/twiml",
  "/ws",
  "/conversation-relay-callback",
  "/webhook",
];

async function endConversation(conversationId: string) {
  const conv = conversations.get(conversationId);
  if (!conv || conv.status === "ended") return;

  conv.status = "ended";
  conv.endedAt = new Date().toISOString();
  broadcastForConversation(
    {
      type: "conversation_ended",
      conversationId,
      endedAt: conv.endedAt,
    },
    conversationId,
  );

  // Calculate duration and tool calls for analytics
  const durationMs =
    new Date(conv.endedAt).getTime() - new Date(conv.startedAt).getTime();
  const durationSeconds = Math.round(durationMs / 1000);
  const toolEntries = conv.transcript.filter((t) => t.role === "tool");
  const toolCallsUsed = toolEntries.map((t) => t.toolName || "unknown");
  const channel = conv.transcript.find((t) => t.channel)?.channel || "chat";
  trackConversationEnded(
    conv.userEmail,
    channel,
    conversationId,
    durationSeconds,
    toolCallsUsed,
  );
}

export async function startTACServer(port: number) {
  const tac = await TAC.create({ config: TACConfig.fromEnv() });
  const voiceChannel = new VoiceChannel(tac);
  tac.registerChannel(voiceChannel);

  const smsChannel = tac.isOrchestratorEnabled() ? new SMSChannel(tac) : null;
  if (smsChannel) {
    tac.registerChannel(smsChannel);
    console.log("[tac] SMS channel registered");
  } else {
    console.warn(
      "[tac] SMS channel NOT registered — TWILIO_CONVERSATION_CONFIGURATION_ID is not set, so the Conversation Orchestrator is disabled. SMS requires the orchestrator.",
    );
  }

  tac.onConversationEnded(async ({ session }: any) => {
    await endConversation(session.conversationId);
  });

  tac.onMessageReady(async ({ conversationId, session, message, author }) => {
    console.log(`[onMessageReady] session: ${JSON.stringify(session)}`);
    console.log(`[onMessageReady] author: ${author}`);

    const sessionChannel: "voice" | "sms" | "chat" =
      session?.channel === "sms"
        ? "sms"
        : session?.channel === "chat"
          ? "chat"
          : "voice";

    // Browser/WebRTC calls come in with a Twilio Client address like
    // "client:jane@example.com" as the author address — since the Device's
    // identity is registered as the caller's entered email (see
    // /api/token), that identity literally IS the email. Treat it as the
    // caller's email instead of mistakenly storing "client:..." as a phone
    // number, which is what broke memory/conversation lookups for browser calls.
    const rawAuthorAddress: string | undefined = session?.authorInfo?.address;
    const CLIENT_ADDRESS_PREFIX = "client:";
    const browserClientEmail = rawAuthorAddress?.startsWith(
      CLIENT_ADDRESS_PREFIX,
    )
      ? rawAuthorAddress.slice(CLIENT_ADDRESS_PREFIX.length)
      : undefined;

    let callerEmail: string | undefined =
      browserClientEmail || getConnectedUserEmail();
    const callerPhone: string | undefined = browserClientEmail
      ? undefined
      : rawAuthorAddress;

    // For SMS, look up the user's email by phone so the conversation routes
    // to the right logged-in client (and so we have an email for memory + summary)
    if (sessionChannel === "sms" && callerPhone) {
      const profileId = await lookupProfileByPhone(callerPhone);
      if (profileId) {
        const lookedUpEmail = await getProfileEmail(profileId);
        if (lookedUpEmail) {
          console.log(
            `[onMessageReady] SMS — resolved phone ${callerPhone} to email ${lookedUpEmail}`,
          );
          callerEmail = lookedUpEmail;
        }
      }
    }

    console.log(
      `[onMessageReady] channel: ${sessionChannel}, callerEmail: ${callerEmail}, callerPhone: ${callerPhone}`,
    );

    if (!conversations.has(conversationId)) {
      console.log(
        `[onMessageReady] New ${sessionChannel} conversation ${conversationId}, callerEmail: ${callerEmail}, callerPhone: ${callerPhone}`,
      );
      const info: ConversationInfo = {
        id: conversationId,
        startedAt: new Date().toISOString(),
        status: "active",
        transcript: [],
        userEmail: callerEmail,
        userPhone: callerPhone,
      };
      conversations.set(conversationId, info);
      broadcastForConversation(
        { type: "conversation_started", conversation: info },
        conversationId,
      );
      trackConversationStarted(callerEmail, sessionChannel, conversationId);
    } else {
      const conv = conversations.get(conversationId)!;
      let updated = false;
      if (!conv.userEmail && callerEmail) {
        conv.userEmail = callerEmail;
        updated = true;
      }
      if (!conv.userPhone && callerPhone) {
        conv.userPhone = callerPhone;
        updated = true;
      }
      if (updated) {
        broadcastForConversation(
          { type: "conversation_started", conversation: conv },
          conversationId,
        );
      }
    }

    const userEntry: TranscriptEntry = {
      id: generateId(),
      conversationId,
      role: "user",
      text: message,
      timestamp: new Date().toISOString(),
      channel: sessionChannel,
    };

    const conv = conversations.get(conversationId)!;
    conv.transcript.push(userEntry);
    broadcastForConversation(
      { type: "transcript", entry: userEntry },
      conversationId,
    );
    trackMessageSent(conv.userEmail, sessionChannel, conversationId, "user");

    console.log({ userEmail: conv.userEmail });

    return await generateAgentResponse(conversationId);
  });

  const fastifyOptions: FastifyServerOptions = {
    trustProxy: true,
    logger: { level: process.env.TWILIO_LOG_LEVEL || "info" },
  };

  if (IS_MICROVM_PREVIEW) {
    fastifyOptions.rewriteUrl = (req: IncomingMessage) => {
      const url = req.url || "/";
      const pathOnly = url.split("?")[0];
      if (TAC_WEBHOOK_PATHS.includes(pathOnly)) {
        return `${PUBLIC_PREFIX}${url}`;
      }
      return url;
    };
  }

  const fastify = Fastify(fastifyOptions);

  const server = new TACServer(tac, {
    port,
    fastifyInstance: fastify,
    voiceChannel,
    messagingChannels: smsChannel ? [smsChannel] : [],
    ...(IS_MICROVM_PREVIEW
      ? {
          webhookPaths: {
            messaging: `${PUBLIC_PREFIX}/webhook`,
            twiml: `${PUBLIC_PREFIX}/twiml`,
            ws: `${PUBLIC_PREFIX}/ws`,
            conversationRelayCallback: `${PUBLIC_PREFIX}/conversation-relay-callback`,
          },
        }
      : {}),
  });

  // Handle ending chat conversations
  setEndConversationHandler(async (conversationId: string) => {
    await endConversation(conversationId);
  });

  // Handle text chat messages from the frontend
  setChatMessageHandler(
    async (conversationId: string | null, text: string, userEmail?: string) => {
      let convId = conversationId;

      // If no conversation or conversation ended, create a new one
      if (
        !convId ||
        !conversations.has(convId) ||
        conversations.get(convId)?.status === "ended"
      ) {
        convId = generateId();
        const info: ConversationInfo = {
          id: convId,
          startedAt: new Date().toISOString(),
          status: "active",
          transcript: [],
          userEmail,
        };
        conversations.set(convId, info);
        broadcastForConversation(
          { type: "conversation_started", conversation: info },
          convId,
        );
        trackConversationStarted(userEmail, "chat", convId);

        // Create a Conversations V2 conversation for memory tracking
        if (userEmail) {
          const v2Result = await createChatConversation(
            userEmail,
            `Chat - ${convId}`,
          );
          if (v2Result) {
            info.conversationsV2Sid = v2Result.conversationSid;
            info.customerParticipantId = v2Result.customerParticipantId;
            info.agentParticipantId = v2Result.agentParticipantId;
            console.log(
              `[chat] Linked V2 conversation ${v2Result.conversationSid} to ${convId} (customer: ${v2Result.customerParticipantId}, agent: ${v2Result.agentParticipantId})`,
            );
          }
        }
      }

      const conv = conversations.get(convId)!;
      if (userEmail) conv.userEmail = userEmail;

      // Add user message
      const userEntry: TranscriptEntry = {
        id: generateId(),
        conversationId: convId,
        role: "user",
        text,
        timestamp: new Date().toISOString(),
        channel: "chat",
      };
      conv.transcript.push(userEntry);
      broadcastForConversation(
        { type: "transcript", entry: userEntry },
        convId,
      );
      trackMessageSent(conv.userEmail, "chat", convId, "user");

      // If no V2 conversation linked yet, try to find the one TAC created (e.g. for voice calls)
      if (!conv.conversationsV2Sid && userEmail) {
        console.log(`🔍 [voice→chat] No V2 conversation linked for ${convId}`);
        console.log(
          `🔍 [voice→chat] Looking up active V2 conversation for user: ${userEmail}`,
        );
        const existing = await findActiveConversationForUser(
          userEmail,
          conv.userPhone,
        );
        if (existing) {
          conv.conversationsV2Sid = existing.conversationSid;
          console.log(
            `✅ [voice→chat] Found & linked V2 conversation: ${existing.conversationSid}`,
          );

          // Add CHAT channel participants so we can post messages with email/assistant addresses
          const chatParts = await ensureChatParticipants(
            existing.conversationSid,
            userEmail,
          );
          conv.customerParticipantId = chatParts.chatCustomerParticipantId;
          conv.agentParticipantId = chatParts.chatAgentParticipantId;
          console.log(
            `✅ [voice→chat] CHAT customer participant: ${conv.customerParticipantId}`,
          );
          console.log(
            `✅ [voice→chat] CHAT agent participant: ${conv.agentParticipantId}`,
          );
        } else {
          console.log(
            `⚠️ [voice→chat] No active V2 conversation found for ${userEmail} — message won't be persisted to V2`,
          );
        }
      }

      // Send user message to Conversations V2
      if (conv.conversationsV2Sid && userEmail) {
        await addCommunication(
          conv.conversationsV2Sid,
          userEmail,
          "assistant",
          text,
          conv.customerParticipantId,
          conv.agentParticipantId,
        );
      }

      const agentResponse = await generateAgentResponse(convId);
      if (agentResponse) {
        trackMessageSent(conv.userEmail, "chat", convId, "assistant");
      }

      // Send agent response to Conversations V2
      if (agentResponse && conv.conversationsV2Sid && userEmail) {
        await addCommunication(
          conv.conversationsV2Sid,
          "assistant",
          userEmail,
          agentResponse,
          conv.agentParticipantId,
          conv.customerParticipantId,
        );
      }
    },
  );

  server.fastify.get("/health", async () => ({ status: "ok", mode: "full" }));
  server.fastify.get("/conversations", async () =>
    Array.from(conversations.values()),
  );

  const wss = new WebSocketServer({ noServer: true });
  setupWebSocket(wss);

  await server.start();

  // Route upgrade requests: /ws/transcripts goes to our WSS, everything else to TAC
  const rawServer = server.fastify.server;
  const existingUpgradeListeners = rawServer.listeners("upgrade").slice();
  rawServer.removeAllListeners("upgrade");

  rawServer.on("upgrade", (request, socket, head) => {
    if (request.url?.startsWith("/ws/transcripts")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      for (const listener of existingUpgradeListeners) {
        (listener as (...args: unknown[]) => void).call(
          rawServer,
          request,
          socket,
          head,
        );
      }
    }
  });
}
