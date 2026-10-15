import { tool } from "ai";
import { z } from "zod/v4";
import { sendEmail } from "./email.js";
import {
  fetchObservations,
  fetchProfileTraits,
  fetchSummaries,
  lookupProfileByEmail,
  lookupProfileByPhone,
  patchProfileTraits,
} from "./memory.js";
import { trackToolCallUsed } from "./segment.js";
import {
  broadcast,
  broadcastForConversation,
  conversations,
  TranscriptEntry,
} from "./transcript-server.js";
import { generateId } from "./utils.js";

function broadcastToolCall(
  conversationId: string,
  toolName: string,
  args: Record<string, unknown>,
  result: string
) {
  const conv = conversations.get(conversationId);
  if (!conv) return;

  // Track tool call in Segment
  if (conv.userEmail) {
    trackToolCallUsed(conv.userEmail, toolName, conversationId);
  }

  const toolEntry: TranscriptEntry = {
    id: generateId(),
    conversationId,
    role: "tool",
    text: `Tool: ${toolName}`,
    timestamp: new Date().toISOString(),
    toolName,
    toolArgs: args,
    toolResult: result,
  };
  conv.transcript.push(toolEntry);
  broadcastForConversation({ type: "transcript", entry: toolEntry }, conversationId);
}

export function buildTools(conversationId: string, userEmail?: string, profileId?: string | null) {
  return {
    send_email: tool({
      description:
        "Send an email to the user with any content they request. Use this when the user asks you to email them something, send them information, or write them an email.",
      inputSchema: z.object({
        to: z.string().describe("The recipient email address"),
        subject: z.string().describe("The email subject line"),
        body: z.string().describe("The email body content in plain text"),
      }),
      execute: async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
        const result = await sendEmail({ to, subject, body });
        broadcastToolCall(conversationId, "send_email", { to, subject, body }, result);
        return result;
      },
    }),
    get_profile: tool({
      description:
        "Get the user's memory profile including all their traits and preferences. Use this when the user asks about their profile, what you know about them, or when you need context about them.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!userEmail) {
          const result = "No user email available to look up profile.";
          broadcastToolCall(conversationId, "get_profile", {}, result);
          return result;
        }
        const pid = profileId || (await lookupProfileByEmail(userEmail));
        if (!pid) {
          const result = "No profile found for this user.";
          broadcastToolCall(conversationId, "get_profile", {}, result);
          return result;
        }
        const traits = await fetchProfileTraits(pid);
        if (traits.length === 0) {
          const result = "Profile found but no traits recorded yet.";
          broadcastToolCall(conversationId, "get_profile", {}, result);
          return result;
        }
        let result = `Profile traits for ${userEmail}:\n`;
        for (const t of traits) {
          result += `- ${t.traitGroup}/${t.name}: ${JSON.stringify(t.value)}\n`;
        }
        broadcastToolCall(conversationId, "get_profile", {}, result);
        return result;
      },
    }),
    get_observations_and_summaries: tool({
      description:
        `Retrieve a user's stored memory observations and conversation summaries from past interactions. Use this when:
- The user asks what you remember about them or about past conversations
- You need historical context (past topics, preferences, decisions) to answer well
- The user references "last time", "before", or asks about prior interactions

You can look up by email, phone number, or neither (defaults to the current user). Returns observations (notable facts captured from conversations) and summaries (recap of past conversations).`,
      inputSchema: z.object({
        email: z
          .string()
          .optional()
          .describe("Optional email to look up. Omit to use the current user's email."),
        phone: z
          .string()
          .optional()
          .describe("Optional phone number (e.g. +14155551234). Used if email isn't available."),
      }),
      execute: async ({ email, phone }: { email?: string; phone?: string }) => {
        const args = { email, phone };
        const lookupEmail = email || userEmail;
        let pid: string | null = null;

        if (lookupEmail) {
          pid = profileId || (await lookupProfileByEmail(lookupEmail));
        }
        if (!pid && phone) {
          pid = await lookupProfileByPhone(phone);
        }

        if (!pid) {
          const result = `No profile found for ${lookupEmail || phone || "current user"}.`;
          broadcastToolCall(conversationId, "get_observations_and_summaries", args, result);
          return result;
        }

        const [observations, summaries] = await Promise.all([
          fetchObservations(pid, 20),
          fetchSummaries(pid, 10),
        ]);

        if (observations.length === 0 && summaries.length === 0) {
          const result = "Profile found but no observations or summaries recorded yet.";
          broadcastToolCall(conversationId, "get_observations_and_summaries", args, result);
          return result;
        }

        let result = "";
        if (observations.length > 0) {
          result += `Observations (${observations.length}):\n`;
          for (const o of observations) {
            const text = o.content || o.observation || o.text || JSON.stringify(o);
            const ts = o.createdAt || o.timestamp || "";
            result += `- ${ts ? `[${ts}] ` : ""}${text}\n`;
          }
        }
        if (summaries.length > 0) {
          if (result) result += "\n";
          result += `Conversation Summaries (${summaries.length}):\n`;
          for (const s of summaries) {
            const text = s.summary || s.content || s.text || JSON.stringify(s);
            const ts = s.createdAt || s.timestamp || "";
            result += `- ${ts ? `[${ts}] ` : ""}${text}\n`;
          }
        }
        broadcastToolCall(conversationId, "get_observations_and_summaries", args, result);
        return result;
      },
    }),
    update_profile: tool({
      description:
        `Update a trait on the user's memory profile. Use this when the user tells you ANY personal information, preference, or fact about themselves.

CRITICAL RULES:
1. The "value" MUST be the user's EXACT stated value. If they say "my favorite genre is Rock", the value is "Rock". If they say "my name is Alex", the value is "Alex". NEVER put anything else in value.
2. Use an existing trait group and trait name from the list provided in your system prompt if one matches.
3. If NO existing trait matches, create a descriptive one:
   - trait_group: Use a category like "Preferences", "Favorites", "Personal", or an existing group name
   - trait_name: Use camelCase describing what it is, e.g. "favoriteGenre", "favoriteColor", "hometown", "occupation"

Examples:
- "My favorite genre is Rock" → trait_group: "Preferences", trait_name: "favoriteGenre", value: "Rock"
- "I live in Austin" → trait_group: "Personal", trait_name: "city", value: "Austin"
- "My name is Alex" → trait_group: "Contact", trait_name: "firstName", value: "Alex"
- "I love Thai food" → trait_group: "Favorites", trait_name: "favoriteCuisine", value: "Thai"`,
      inputSchema: z.object({
        trait_group: z.string().describe("The trait group category. Use an existing group from the system prompt if applicable, otherwise use 'Preferences', 'Favorites', or 'Personal'."),
        trait_name: z.string().describe("A camelCase trait name describing the information, e.g. 'favoriteGenre', 'favoriteColor', 'firstName', 'city'"),
        value: z.string().describe("The user's EXACT stated value. If they said 'Rock', this must be 'Rock'. Never paraphrase or change it."),
      }),
      execute: async ({ trait_group, trait_name, value }: { trait_group: string; trait_name: string; value: string }) => {
        const args = { trait_group, trait_name, value };
        if (!userEmail) {
          const result = "No user email available to update profile.";
          broadcastToolCall(conversationId, "update_profile", args, result);
          return result;
        }
        const pid = profileId || (await lookupProfileByEmail(userEmail));
        if (!pid) {
          const result = "No profile found for this user. Cannot update traits.";
          broadcastToolCall(conversationId, "update_profile", args, result);
          return result;
        }
        const result = await patchProfileTraits(pid, trait_group, trait_name, value);
        broadcastToolCall(conversationId, "update_profile", args, result);
        if (result.startsWith("Successfully")) {
          broadcast({ type: "profile_updated", email: userEmail }, userEmail);
        }
        return result;
      },
    }),
  };
}
