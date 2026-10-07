import type { DefaultPolicies, Levels, PolicyOverrides } from "./extension.js";

export const DEFAULT_POLICIES: DefaultPolicies = deepFreeze({
  resourceScopes: {
    "orders:summary": "Order ID, status, and dates",
    "orders:detail": "Full order details including items and quantities",
    "orders:financial": "Pricing, payment method, and billing address",
    "account:profile": "Name, email, and contact information",
    "account:preferences": "Communication and notification preferences",
    "returns:create": "Ability to initiate product returns",
  },
  levels: {
    anonymous: {
      tools: {
        search_knowledge_base: { resourceScopes: [] },
      },
    },
    claimed: {
      tools: {
        search_knowledge_base: { resourceScopes: [] },
        lookup_orders: { resourceScopes: ["orders:summary", "orders:detail"] },
      },
    },
    verified: {
      tools: {
        search_knowledge_base: { resourceScopes: [] },
        lookup_orders: {
          resourceScopes: [
            "orders:summary",
            "orders:detail",
            "orders:financial",
          ],
        },
        get_account_details: {
          resourceScopes: ["account:profile", "account:preferences"],
        },
        initiate_return: {
          resourceScopes: ["orders:detail", "returns:create"],
        },
      },
    },
  },
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value as any);
    for (const v of Object.values(value as any)) {
      deepFreeze(v);
    }
  }
  return value;
}

// intersectPolicies computes the effective per-level tools/scopes from the frozen
// defaults and optional client overrides. The security invariant: overrides can
// only NARROW (remove tools, intersect scopes) — never widen. Tools or scopes the
// server does not grant by default are silently ignored. See README table.
export function intersectPolicies(
  defaults: DefaultPolicies,
  overrides?: PolicyOverrides
): Levels {
  const result: Levels = {};

  for (const [levelName, defaultPolicy] of Object.entries(defaults.levels)) {
    const levelOverrides = overrides?.[levelName];
    const tools: Levels[string]["tools"] = {};

    for (const [toolName, defaultToolPolicy] of Object.entries(
      defaultPolicy.tools
    )) {
      const toolOverride = levelOverrides?.tools?.[toolName];

      if (toolOverride?.enabled === false) {
        continue;
      }

      if (toolOverride?.resourceScopes) {
        const defaultSet = new Set(defaultToolPolicy.resourceScopes);
        const intersected = toolOverride.resourceScopes.filter((s) =>
          defaultSet.has(s)
        );
        tools[toolName] = { resourceScopes: intersected };
      } else {
        tools[toolName] = {
          resourceScopes: [...defaultToolPolicy.resourceScopes],
        };
      }
    }

    result[levelName] = { tools };
  }

  return result;
}
