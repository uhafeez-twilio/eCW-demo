import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { fetchProfileTraits, getTraitGroupsPrompt, lookupProfileByEmail } from "./memory.js";
import { buildTools } from "./tools.js";
import {
  broadcastForConversation,
  conversations,
  TranscriptEntry,
} from "./transcript-server.js";
import { generateId } from "./utils.js";

function buildSystemPrompt(email?: string, profileContext?: string, traitGroupsPrompt?: string): string {
  return `You are a helpful voice assistant. Keep responses concise and conversational. Never use asterisks, markdown formatting, bullet points, or special characters. Respond in plain natural language only.

CRITICAL RULES FOR MEMORY:
- When the user tells you ANY personal information (name, preferences, favorites, interests, etc.), you MUST IMMEDIATELY call update_profile to save it. Do NOT just say "I'll remember that" without calling the tool.
- If a piece of information matches a defined trait below, use that exact trait group and trait name.
- If NO existing trait matches, create a new one using descriptive camelCase names and appropriate groups (Preferences, Favorites, Personal).
- The "value" you pass to update_profile must be the user's EXACT stated value — never paraphrase it.
- If a piece of information matches a defined trait, save it right away without being asked.
- You can send emails when asked using the send_email tool.
- You can look up the user's profile using get_profile and update their traits using update_profile.${
    email
      ? ` The user's email address is ${email}. When they ask you to send them an email, use this address unless they specify a different one.`
      : ""
  }${profileContext || ""}${traitGroupsPrompt || ""}`;
}

async function getProfileContext(profileId: string | null): Promise<string> {
  if (!profileId) return "";
  const traits = await fetchProfileTraits(profileId);
  if (traits.length === 0) return "";

  let context = "\n\nUser's profile (already retrieved):\n";
  for (const t of traits) {
    context += `- ${t.traitGroup}/${t.name}: ${JSON.stringify(t.value)}\n`;
  }
  context += "\nUse this information to personalize your responses. Address the user by name if you know it.";
  return context;
}

export async function generateAgentResponse(conversationId: string): Promise<string | undefined> {
  const conv = conversations.get(conversationId);
  if (!conv) return undefined;

  const email = conv.userEmail;
  const profileId = email ? await lookupProfileByEmail(email) : null;
  const traitGroupsPrompt = await getTraitGroupsPrompt();
  const profileContext = await getProfileContext(profileId);

  const systemPrompt = buildSystemPrompt(email, profileContext, traitGroupsPrompt);

  const messages = conv.transcript
    .filter((t) => t.role === "user" || t.role === "agent")
    .map((t) => ({
      role: t.role === "user" ? "user" as const : "assistant" as const,
      content: t.text,
    }));

  try {
    const result = await generateText({
      model: openai.chat("gpt-5.4-mini"),
      system: systemPrompt,
      messages,
      tools: buildTools(conversationId, email, profileId),
      stopWhen: stepCountIs(5),
    });

    // Use the same channel as the last user message
    const lastUserEntry = [...conv.transcript].reverse().find((t) => t.role === "user");
    const agentEntry: TranscriptEntry = {
      id: generateId(),
      conversationId,
      role: "agent",
      text: result.text,
      timestamp: new Date().toISOString(),
      channel: lastUserEntry?.channel,
    };

    conv.transcript.push(agentEntry);
    broadcastForConversation({ type: "transcript", entry: agentEntry }, conversationId);

    return result.text;
  } catch (err) {
    console.error(`[agent] ERROR generating response:`, err);
    return undefined;
  }
}
