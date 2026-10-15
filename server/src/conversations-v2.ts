import { getMemoryAuthHeader, lookupProfileByEmail } from "./memory.js";

const CONVERSATIONS_V2_BASE = "https://conversations.twilio.com/v2";

interface ConversationV2Result {
  conversationSid: string;
  customerParticipantId?: string;
  agentParticipantId?: string;
}

/**
 * Attempt to create a conversation. If a 409 conflict occurs (address already in use),
 * close the existing conversation and retry once.
 */
async function attemptCreateConversation(
  body: Record<string, unknown>,
  retried = false
): Promise<ConversationV2Result | null> {
  console.log(
    `[conversations-v2] 📝 ${
      retried
        ? "Retrying conversation creation after closing conflict..."
        : "Creating new conversation..."
    }`
  );
  console.log("[conversations-v2] Payload:", JSON.stringify(body, null, 2));
  const res = await fetch(`${CONVERSATIONS_V2_BASE}/Conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getMemoryAuthHeader(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();

    // Handle 409 conflict — close existing conversation and retry
    if (res.status === 409 && !retried) {
      console.warn(
        "[conversations-v2] ⚠️ 409 conflict — address already in use on an existing conversation"
      );
      const existingSid = extractConversationSidFromError(errText);
      if (existingSid) {
        console.log(
          `[conversations-v2] 🔄 Closing conflicting conversation: ${existingSid}`
        );
        await closeConversation(existingSid);
        console.log(
          `[conversations-v2] ♻️ Recreating conversation after closing ${existingSid}...`
        );
        // Retry once
        return attemptCreateConversation(body, true);
      } else {
        console.error(
          "[conversations-v2] Could not extract conversation SID from 409 error"
        );
        return null;
      }
    }

    console.error(
      "[conversations-v2] Failed to create conversation:",
      res.status,
      errText
    );
    return null;
  }

  const data: any = await res.json();
  console.log(
    `[conversations-v2] ✅ Conversation created successfully: ${data.id}`
  );

  // Fetch participant IDs from the Participants endpoint
  const { customerParticipantId, agentParticipantId } =
    await fetchParticipantIds(data.id);

  return {
    conversationSid: data.id,
    customerParticipantId,
    agentParticipantId,
  };
}

/**
 * Extract the conversation SID from a 409 error message.
 * Example: "Address mapping already exists on conversation conv_conversation_01kt24nw4bfm4r6kqdf1dsr5j0."
 */
function extractConversationSidFromError(errText: string): string | null {
  try {
    const parsed = JSON.parse(errText);
    const message: string = parsed.message || "";
    const match = message.match(/conv_conversation_[a-z0-9]+/);
    return match ? match[0] : null;
  } catch {
    // Try direct regex on raw text
    const match = errText.match(/conv_conversation_[a-z0-9]+/);
    return match ? match[0] : null;
  }
}

/**
 * Create a Conversations V2 conversation for a chat session.
 * Links to the user's Memory profile so communications feed into Recall.
 */
export async function createChatConversation(
  userEmail: string,
  conversationName?: string
): Promise<ConversationV2Result | null> {
  const configId = process.env.TWILIO_CONVERSATION_CONFIGURATION_ID;
  if (!configId) {
    console.error(
      "[conversations-v2] TWILIO_CONVERSATIONS_V2_CONFIG_ID not set"
    );
    return null;
  }

  const profileId = await lookupProfileByEmail(userEmail);

  const body: Record<string, unknown> = {
    configurationId: configId,
    name:
      conversationName || `Chat - ${userEmail} - ${new Date().toISOString()}`,
    participants: [
      {
        type: "CUSTOMER",
        name: userEmail,
        ...(profileId ? { profileId } : {}),
        addresses: [
          {
            address: userEmail,
            channel: "CHAT",
            channelId: "chat",
          },
        ],
      },
      {
        type: "AI_AGENT",
        name: "Assistant",
        addresses: [
          {
            address: "assistant",
            channel: "CHAT",
            channelId: "chat",
          },
        ],
      },
    ],
  };

  try {
    const result = await attemptCreateConversation(body);
    return result;
  } catch (err) {
    console.error("[conversations-v2] Error creating conversation:", err);
    return null;
  }
}

/**
 * Fetch participant IDs from a conversation.
 * Returns { customerParticipantId, agentParticipantId }
 */
export async function fetchParticipantIds(
  conversationSid: string
): Promise<{ customerParticipantId?: string; agentParticipantId?: string }> {
  try {
    console.log(
      `[conversations-v2] 🔍 Fetching participants for conversation ${conversationSid}...`
    );
    const res = await fetch(
      `${CONVERSATIONS_V2_BASE}/Conversations/${conversationSid}/Participants?PageSize=20`,
      {
        method: "GET",
        headers: {
          Authorization: getMemoryAuthHeader(),
        },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        "[conversations-v2] ❌ Failed to fetch participants:",
        res.status,
        errText
      );
      return {};
    }

    const data: any = await res.json();
    console.log(
      "[conversations-v2] Participants response:",
      JSON.stringify(data, null, 2)
    );

    let customerParticipantId: string | undefined;
    let agentParticipantId: string | undefined;

    const participants = data.participants || data || [];
    for (const p of participants) {
      if (p.type === "CUSTOMER") customerParticipantId = p.id;
      if (p.type === "AI_AGENT") agentParticipantId = p.id;
    }

    console.log(
      `[conversations-v2] 📋 Customer participant: ${customerParticipantId}, Agent participant: ${agentParticipantId}`
    );
    return { customerParticipantId, agentParticipantId };
  } catch (err) {
    console.error("[conversations-v2] Error fetching participants:", err);
    return {};
  }
}

/**
 * Add a communication (message) to a Conversations V2 conversation.
 */
export async function addCommunication(
  conversationSid: string,
  authorAddress: string,
  recipientAddress: string,
  text: string,
  authorParticipantId?: string,
  recipientParticipantId?: string
): Promise<boolean> {
  const authorObj: Record<string, string> = {
    address: authorAddress,
    channel: "CHAT",
  };
  if (authorParticipantId) authorObj.participantId = authorParticipantId;

  const recipientObj: Record<string, string> = {
    address: recipientAddress,
    channel: "CHAT",
  };
  if (recipientParticipantId)
    recipientObj.participantId = recipientParticipantId;

  const commBody: Record<string, unknown> = {
    author: authorObj,
    channelId: "chat",
    content: {
      type: "TEXT",
      text,
    },
    recipients: [recipientObj],
  };

  try {
    const authorLabel =
      authorAddress === "assistant" ? "🤖 Assistant" : `👤 ${authorAddress}`;
    console.log(
      `[conversations-v2] 💬 Adding message to conversation ${conversationSid} | From: ${authorLabel} | Text: "${text.substring(
        0,
        80
      )}${text.length > 80 ? "..." : ""}"`
    );
    console.log(
      "[conversations-v2] Communication payload:",
      JSON.stringify(commBody, null, 2)
    );
    const res = await fetch(
      `${CONVERSATIONS_V2_BASE}/Conversations/${conversationSid}/Communications`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getMemoryAuthHeader(),
        },
        body: JSON.stringify(commBody),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        "[conversations-v2] ❌ Failed to add message:",
        res.status,
        errText
      );
      return false;
    }

    console.log(
      `[conversations-v2] ✅ Message added successfully to ${conversationSid}`
    );
    return true;
  } catch (err) {
    console.error("[conversations-v2] Error adding communication:", err);
    return false;
  }
}

/**
 * Normalize a phone number to just digits for comparison.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Find an active V2 conversation for a given user email.
 * Searches through active conversations to find one with a CUSTOMER participant
 * whose address matches the user's email or phone number.
 */
export async function findActiveConversationForUser(
  userEmail: string,
  userPhone?: string
): Promise<ConversationV2Result | null> {
  const normalizedUserPhone = userPhone ? normalizePhone(userPhone) : undefined;
  try {
    console.log(
      `[conversations-v2] 🔍 Looking up active V2 conversation for ${userEmail} (phone: ${
        userPhone || "unknown"
      }, normalized: ${normalizedUserPhone || "none"})...`
    );
    const res = await fetch(
      `${CONVERSATIONS_V2_BASE}/Conversations?status=ACTIVE&pageSize=50`,
      {
        method: "GET",
        headers: {
          Authorization: getMemoryAuthHeader(),
        },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        "[conversations-v2] ❌ Failed to list conversations:",
        res.status,
        errText
      );
      return null;
    }

    const data: any = await res.json();
    const convos = data.conversations || [];
    console.log(
      `[conversations-v2] 🔍 Found ${convos.length} active V2 conversations to search through`
    );

    for (const convo of convos) {
      const participants = convo.participants || [];
      let customerParticipantId: string | undefined;
      let agentParticipantId: string | undefined;
      let matchesUser = false;
      const customerAddresses: string[] = [];

      for (const p of participants) {
        const addresses = p.addresses || [];
        let isCustomer = false;

        for (const addr of addresses) {
          if (addr.address === userEmail) {
            isCustomer = true;
            matchesUser = true;
          }
          if (
            normalizedUserPhone &&
            normalizePhone(addr.address) === normalizedUserPhone
          ) {
            isCustomer = true;
            matchesUser = true;
          }
        }

        if (isCustomer || p.type === "CUSTOMER") {
          customerParticipantId = p.id;
          for (const addr of addresses) {
            customerAddresses.push(addr.address);
          }
        } else {
          // Any non-customer participant is treated as the agent
          agentParticipantId = p.id;
        }
      }

      console.log(
        `[conversations-v2] 🔎 Checking conversation ${
          convo.id
        } | Customer addresses: [${customerAddresses.join(
          ", "
        )}] | Match: ${matchesUser}`
      );

      if (matchesUser) {
        console.log(
          `[conversations-v2] ✅ Found active V2 conversation for ${userEmail}: ${convo.id}`
        );
        console.log(
          `[conversations-v2] ✅ Customer participant ID: ${customerParticipantId}`
        );
        console.log(
          `[conversations-v2] ✅ Agent participant ID: ${agentParticipantId}`
        );
        return {
          conversationSid: convo.id,
          customerParticipantId,
          agentParticipantId,
        };
      }
    }

    console.log(
      `[conversations-v2] ⚠️ No active V2 conversation found for ${userEmail} (searched ${convos.length} conversations)`
    );
    return null;
  } catch (err) {
    console.error("[conversations-v2] Error finding active conversation:", err);
    return null;
  }
}

/**
 * Add CHAT channel participants to a TAC-created voice conversation.
 * This allows us to post chat messages using email/assistant addresses
 * without conflicting with the existing VOICE channel participants.
 * Returns the new CHAT participant IDs.
 */
export async function ensureChatParticipants(
  conversationSid: string,
  userEmail: string
): Promise<{
  chatCustomerParticipantId?: string;
  chatAgentParticipantId?: string;
}> {
  console.log(
    `[conversations-v2] 🔧 Adding CHAT participants to voice conversation ${conversationSid}...`
  );

  const profileId = await lookupProfileByEmail(userEmail);

  // Add CUSTOMER participant with email on CHAT channel
  const customerBody: Record<string, unknown> = {
    type: "CUSTOMER",
    name: userEmail,
    ...(profileId ? { profileId } : {}),
    addresses: [
      {
        address: userEmail,
        channel: "CHAT",
        channelId: "chat",
      },
    ],
  };

  let chatCustomerParticipantId: string | undefined;
  try {
    console.log(
      `[conversations-v2] 📝 Adding CHAT customer participant (${userEmail})...`
    );
    const custRes = await fetch(
      `${CONVERSATIONS_V2_BASE}/Conversations/${conversationSid}/Participants`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getMemoryAuthHeader(),
        },
        body: JSON.stringify(customerBody),
      }
    );

    if (custRes.ok) {
      const custData: any = await custRes.json();
      chatCustomerParticipantId = custData.id;
      console.log(
        `[conversations-v2] ✅ CHAT customer participant added: ${chatCustomerParticipantId}`
      );
    } else {
      const errText = await custRes.text();
      // 409 means participant with this address already exists — try to find it
      if (custRes.status === 409) {
        console.log(
          `[conversations-v2] ⚠️ CHAT customer participant already exists, fetching...`
        );
        chatCustomerParticipantId = await findParticipantByAddress(
          conversationSid,
          userEmail
        );
      } else {
        console.error(
          `[conversations-v2] ❌ Failed to add CHAT customer participant:`,
          custRes.status,
          errText
        );
      }
    }
  } catch (err) {
    console.error(
      `[conversations-v2] Error adding CHAT customer participant:`,
      err
    );
  }

  // Add AI_AGENT participant with "assistant" on CHAT channel
  const agentBody: Record<string, unknown> = {
    type: "AI_AGENT",
    name: "Assistant",
    addresses: [
      {
        address: "assistant",
        channel: "CHAT",
        channelId: "chat",
      },
    ],
  };

  let chatAgentParticipantId: string | undefined;
  try {
    console.log(
      `[conversations-v2] 📝 Adding CHAT agent participant (assistant)...`
    );
    const agentRes = await fetch(
      `${CONVERSATIONS_V2_BASE}/Conversations/${conversationSid}/Participants`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getMemoryAuthHeader(),
        },
        body: JSON.stringify(agentBody),
      }
    );

    if (agentRes.ok) {
      const agentData: any = await agentRes.json();
      chatAgentParticipantId = agentData.id;
      console.log(
        `[conversations-v2] ✅ CHAT agent participant added: ${chatAgentParticipantId}`
      );
    } else {
      const errText = await agentRes.text();
      if (agentRes.status === 409) {
        console.log(
          `[conversations-v2] ⚠️ CHAT agent participant already exists, fetching...`
        );
        chatAgentParticipantId = await findParticipantByAddress(
          conversationSid,
          "assistant"
        );
      } else {
        console.error(
          `[conversations-v2] ❌ Failed to add CHAT agent participant:`,
          agentRes.status,
          errText
        );
      }
    }
  } catch (err) {
    console.error(
      `[conversations-v2] Error adding CHAT agent participant:`,
      err
    );
  }

  console.log(
    `[conversations-v2] 🔧 CHAT participants result — customer: ${chatCustomerParticipantId}, agent: ${chatAgentParticipantId}`
  );
  return { chatCustomerParticipantId, chatAgentParticipantId };
}

/**
 * Find a participant by address in a conversation.
 */
async function findParticipantByAddress(
  conversationSid: string,
  address: string
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${CONVERSATIONS_V2_BASE}/Conversations/${conversationSid}/Participants?PageSize=20`,
      {
        method: "GET",
        headers: {
          Authorization: getMemoryAuthHeader(),
        },
      }
    );

    if (!res.ok) return undefined;

    const data: any = await res.json();
    const participants = data.participants || data || [];
    for (const p of participants) {
      const addresses = p.addresses || [];
      for (const addr of addresses) {
        if (addr.address === address) {
          return p.id;
        }
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Close a Conversations V2 conversation.
 */
export async function closeConversation(
  conversationSid: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${CONVERSATIONS_V2_BASE}/Conversations/${conversationSid}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: getMemoryAuthHeader(),
        },
        body: JSON.stringify({ status: "CLOSED" }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        "[conversations-v2] Failed to close conversation:",
        res.status,
        errText
      );
      return false;
    }

    console.log(
      `[conversations-v2] 🔒 Conversation closed: ${conversationSid}`
    );
    return true;
  } catch (err) {
    console.error("[conversations-v2] Error closing conversation:", err);
    return false;
  }
}
