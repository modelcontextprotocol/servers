export class MalformedUserIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedUserIdError";
  }
}

// splitOidc validates the compound <issuer>#<subject> form. Both components must
// be non-empty after trim, and exactly one '#' delimiter separates them.
export function splitOidc(value: string): { issuer: string; subject: string } {
  const hashIndex = value.indexOf("#");
  if (hashIndex === -1) {
    throw new MalformedUserIdError(
      "oidc userId.value must be issuer#subject with non-empty parts"
    );
  }
  const issuer = value.slice(0, hashIndex).trim();
  const subject = value.slice(hashIndex + 1).trim();
  if (!issuer || !subject) {
    throw new MalformedUserIdError(
      "oidc userId.value must be issuer#subject with non-empty parts"
    );
  }
  if (subject.includes("#")) {
    throw new MalformedUserIdError(
      "oidc userId.value must have exactly one '#' delimiter"
    );
  }
  return { issuer, subject };
}

export function canonicalize(scheme: string, value: string): string {
  switch (scheme) {
    case "email":
      return value.trim().toLowerCase();
    case "oidc": {
      const { issuer, subject } = splitOidc(value);
      return `${issuer}#${subject}`;
    }
    default:
      throw new Error(`unreachable: scheme "${scheme}" validated upstream`);
  }
}

export interface OrderItem {
  name: string;
  qty: number;
}

export interface Order {
  id: string;
  status: string;
  orderedAt: string;
  items: OrderItem[];
  total: number;
  paymentMethod: string;
  billingAddress: string;
  shippingAddress: string;
}

export interface Account {
  name: string;
  email: string;
  phone: string;
  notifications: string;
  language: string;
}

const ORDERS: Record<string, Order[]> = {
  "ben@example.com": [
    {
      id: "ORD-1001",
      status: "Shipped",
      orderedAt: "2025-01-15",
      items: [{ name: "Wireless Mouse", qty: 1 }],
      total: 29.99,
      paymentMethod: "Visa ****1234",
      billingAddress: "123 Main St, Anytown",
      shippingAddress: "123 Main St, Anytown",
    },
    {
      id: "ORD-1002",
      status: "Processing",
      orderedAt: "2025-02-20",
      items: [{ name: "USB-C Hub", qty: 2 }],
      total: 79.98,
      paymentMethod: "Visa ****1234",
      billingAddress: "123 Main St, Anytown",
      shippingAddress: "456 Other St, Anytown",
    },
  ],
  "jane@example.com": [
    {
      id: "ORD-2001",
      status: "Delivered",
      orderedAt: "2025-01-10",
      items: [{ name: "Mechanical Keyboard", qty: 1 }],
      total: 149.99,
      paymentMethod: "Mastercard ****5678",
      billingAddress: "789 Oak Ave, Springfield",
      shippingAddress: "789 Oak Ave, Springfield",
    },
  ],
};

const ACCOUNTS: Record<string, Account> = {
  "ben@example.com": {
    name: "Ben Carter",
    email: "ben@example.com",
    phone: "+1-555-0100",
    notifications: "email",
    language: "en-US",
  },
  "jane@example.com": {
    name: "Jane Wilson",
    email: "jane@example.com",
    phone: "+1-555-0200",
    notifications: "email,sms",
    language: "en-US",
  },
};

export function resolveUser(
  canonicalId: string
): { orders: Order[]; account: Account } | undefined {
  const orders = ORDERS[canonicalId];
  const account = ACCOUNTS[canonicalId];
  if (!orders || !account) return undefined;
  return { orders, account };
}

export const SCOPE_FIELDS: Record<string, string[]> = {
  "orders:summary": ["id", "status", "orderedAt"],
  "orders:detail": ["items", "shippingAddress"],
  "orders:financial": ["total", "paymentMethod", "billingAddress"],
  "account:profile": ["name", "email", "phone"],
  "account:preferences": ["notifications", "language"],
  // returns:create grants no read fields — it authorizes the write.
};

export function pickScopes<T extends Record<string, unknown>>(
  record: T,
  grantedScopes: string[]
): Partial<T> {
  const fields = new Set<string>();
  for (const scope of grantedScopes) {
    for (const f of SCOPE_FIELDS[scope] ?? []) {
      fields.add(f);
    }
  }
  const result: Partial<T> = {};
  for (const f of fields) {
    if (f in record) {
      (result as Record<string, unknown>)[f] = record[f];
    }
  }
  return result;
}
