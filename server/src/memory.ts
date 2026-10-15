const MEMORY_BASE_URL = "https://memory.twilio.com";

export function getMemoryAuthHeader(): string {
  const apiKey = process.env.TWILIO_API_KEY!;
  const apiSecret = process.env.TWILIO_API_SECRET!;
  return "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
}

export async function lookupProfileByEmail(email: string): Promise<string | null> {
  const storeId = process.env.TWILIO_MEMORY_STORE_ID;
  if (!storeId) return null;
  try {
    const res = await fetch(`${MEMORY_BASE_URL}/v1/Stores/${storeId}/Profiles/Lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getMemoryAuthHeader(),
      },
      body: JSON.stringify({ idType: "email", value: email }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data.profiles && data.profiles.length > 0) {
      return data.profiles[0];
    }
    return null;
  } catch (err) {
    console.error("[memory] Profile lookup failed:", err);
    return null;
  }
}

export async function lookupProfileByPhone(phone: string): Promise<string | null> {
  const storeId = process.env.TWILIO_MEMORY_STORE_ID;
  if (!storeId) return null;
  try {
    const res = await fetch(`${MEMORY_BASE_URL}/v1/Stores/${storeId}/Profiles/Lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getMemoryAuthHeader(),
      },
      body: JSON.stringify({ idType: "phone", value: phone }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data.profiles && data.profiles.length > 0) {
      return data.profiles[0];
    }
    return null;
  } catch (err) {
    console.error("[memory] Profile lookup by phone failed:", err);
    return null;
  }
}

export async function getProfileEmail(profileId: string): Promise<string | undefined> {
  const traits = await fetchProfileTraits(profileId);
  for (const t of traits) {
    if (t.name === "email" || t.traitName === "email") {
      const value = t.value ?? t.traitValue;
      if (typeof value === "string") return value;
    }
  }
  return undefined;
}

export async function fetchProfileTraits(profileId: string): Promise<any[]> {
  const storeId = process.env.TWILIO_MEMORY_STORE_ID;
  if (!storeId) return [];
  try {
    const res = await fetch(
      `${MEMORY_BASE_URL}/v1/Stores/${storeId}/Profiles/${profileId}/Traits?pageSize=100`,
      { headers: { Authorization: getMemoryAuthHeader() } }
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.traits || [];
  } catch (err) {
    console.error("[memory] Fetch traits failed:", err);
    return [];
  }
}

export async function fetchObservations(profileId: string, limit = 50): Promise<any[]> {
  const storeId = process.env.TWILIO_MEMORY_STORE_ID;
  if (!storeId) return [];
  try {
    const res = await fetch(
      `${MEMORY_BASE_URL}/v1/Stores/${storeId}/Profiles/${profileId}/Observations?pageSize=${limit}`,
      { headers: { Authorization: getMemoryAuthHeader() } }
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.observations || [];
  } catch (err) {
    console.error("[memory] Fetch observations failed:", err);
    return [];
  }
}

export async function fetchSummaries(profileId: string, limit = 50): Promise<any[]> {
  const storeId = process.env.TWILIO_MEMORY_STORE_ID;
  if (!storeId) return [];
  try {
    const res = await fetch(
      `${MEMORY_BASE_URL}/v1/Stores/${storeId}/Profiles/${profileId}/ConversationSummaries?pageSize=${limit}`,
      { headers: { Authorization: getMemoryAuthHeader() } }
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.summaries || [];
  } catch (err) {
    console.error("[memory] Fetch summaries failed:", err);
    return [];
  }
}

async function waitForOperationComplete(statusUrl: string, maxWaitMs = 10000): Promise<boolean> {
  const authHeader = getMemoryAuthHeader();
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(statusUrl, { headers: { Authorization: authHeader } });
      if (!res.ok) return false;
      const data: any = await res.json();
      if (data.status === "completed" || data.status === "succeeded") return true;
      if (data.status === "failed") return false;
    } catch {
      return false;
    }
  }
  return true;
}

// Cache for trait group prompt
let cachedTraitGroupsPrompt = "";

export function invalidateTraitGroupsCache() {
  cachedTraitGroupsPrompt = "";
}

export async function ensureTraitGroupAndTrait(storeId: string, traitGroupName: string, traitName: string): Promise<boolean> {
  const authHeader = getMemoryAuthHeader();
  const fetchRes = await fetch(
    `${MEMORY_BASE_URL}/v1/ControlPlane/Stores/${storeId}/TraitGroups/${traitGroupName}?includeTraits=true`,
    { headers: { Authorization: authHeader } }
  );

  if (fetchRes.ok) {
    const groupData: any = await fetchRes.json();
    const traitGroup = groupData.traitGroup || groupData;
    const existingTraits = traitGroup.traits || {};
    if (existingTraits[traitName]) {
      return true;
    }
    const patchBody = {
      traits: { [traitName]: { dataType: "STRING", description: `Auto-created trait: ${traitName}` } },
    };
    console.log("[memory] Patching trait group, body:", JSON.stringify(patchBody, null, 2));
    const patchRes = await fetch(
      `${MEMORY_BASE_URL}/v1/ControlPlane/Stores/${storeId}/TraitGroups/${traitGroupName}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify(patchBody),
      }
    );
    if (!patchRes.ok) {
      console.error("[memory] Failed to add trait to group:", await patchRes.text());
      return false;
    }
    const patchData: any = await patchRes.json();
    if (patchData.statusUrl) {
      await waitForOperationComplete(patchData.statusUrl);
    }
    console.log(`[memory] Added trait "${traitName}" to group "${traitGroupName}"`);
    invalidateTraitGroupsCache();
    return true;
  }

  if (fetchRes.status === 404) {
    const createBody = {
      displayName: traitGroupName,
      description: `Auto-created group: ${traitGroupName}`,
      traits: { [traitName]: { dataType: "STRING", description: `Auto-created trait: ${traitName}` } },
    };
    console.log("[memory] Creating trait group, body:", JSON.stringify(createBody, null, 2));
    const createRes = await fetch(
      `${MEMORY_BASE_URL}/v1/ControlPlane/Stores/${storeId}/TraitGroups`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify(createBody),
      }
    );
    if (!createRes.ok) {
      console.error("[memory] Failed to create trait group:", await createRes.text());
      return false;
    }
    const createData: any = await createRes.json();
    if (createData.statusUrl) {
      await waitForOperationComplete(createData.statusUrl);
    }
    console.log(`[memory] Created trait group "${traitGroupName}" with trait "${traitName}"`);
    invalidateTraitGroupsCache();
    return true;
  }

  console.error("[memory] Unexpected response checking trait group:", fetchRes.status, await fetchRes.text());
  return false;
}

export async function patchProfileTraits(profileId: string, traitGroupName: string, traitName: string, value: any): Promise<string> {
  const storeId = process.env.TWILIO_MEMORY_STORE_ID;
  if (!storeId) return "Memory store not configured.";
  try {
    const ensured = await ensureTraitGroupAndTrait(storeId, traitGroupName, traitName);
    if (!ensured) {
      return `Failed to ensure trait "${traitName}" exists in group "${traitGroupName}". Cannot update.`;
    }

    const res = await fetch(`${MEMORY_BASE_URL}/v1/Stores/${storeId}/Profiles/${profileId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: getMemoryAuthHeader(),
      },
      body: JSON.stringify({
        traits: {
          [traitGroupName]: {
            [traitName]: value,
          },
        },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error("[memory] Patch traits failed:", res.status, errBody);
      return `Failed to update trait: ${res.status}`;
    }
    return `Successfully updated trait "${traitName}" in group "${traitGroupName}" to "${value}".`;
  } catch (err: any) {
    console.error("[memory] Patch traits error:", err);
    return `Error updating trait: ${err.message}`;
  }
}

async function loadTraitGroupDefinitions(): Promise<string> {
  const storeId = process.env.TWILIO_MEMORY_STORE_ID;
  if (!storeId) return "";
  try {
    const res = await fetch(
      `${MEMORY_BASE_URL}/v1/ControlPlane/Stores/${storeId}/TraitGroups?includeTraits=true&pageSize=100`,
      { headers: { Authorization: getMemoryAuthHeader() } }
    );
    if (!res.ok) return "";
    const data: any = await res.json();
    const groups = data.traitGroups || [];
    if (groups.length === 0) return "";

    let prompt = "\n\nAvailable trait groups and traits you can update with the update_profile tool:\n";
    for (const group of groups) {
      prompt += `\n- Trait Group: "${group.displayName}"`;
      if (group.description) prompt += ` (${group.description})`;
      if (group.traits && typeof group.traits === "object") {
        const traitNames = Object.keys(group.traits);
        for (const tName of traitNames) {
          const tDef = group.traits[tName];
          prompt += `\n  - "${tName}"`;
          if (tDef?.description) prompt += `: ${tDef.description}`;
          if (tDef?.type) prompt += ` [type: ${tDef.type}]`;
        }
      }
    }
    return prompt;
  } catch (err) {
    console.error("[memory] Failed to load trait group definitions:", err);
    return "";
  }
}

export async function getTraitGroupsPrompt(): Promise<string> {
  if (!cachedTraitGroupsPrompt) {
    cachedTraitGroupsPrompt = await loadTraitGroupDefinitions();
  }
  return cachedTraitGroupsPrompt;
}
