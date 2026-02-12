type User = {
  id: string;
  secondmeUserId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
};

type ChatSession = {
  id: string;
  userId: string;
  title: string;
  updatedAt: Date;
};

type ChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
};

type UserNote = {
  id: string;
  userId: string;
  content: string;
};

const db = {
  users: [] as User[],
  sessions: [] as ChatSession[],
  messages: [] as ChatMessage[],
  notes: [] as UserNote[],
};

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const prisma: any = {
  user: {
    async upsert(args: {
      where: { secondmeUserId: string };
      create: Omit<User, "id">;
      update: Partial<Omit<User, "id" | "secondmeUserId">>;
    }) {
      const found = db.users.find(
        (item) => item.secondmeUserId === args.where.secondmeUserId,
      );
      if (found) {
        Object.assign(found, args.update);
        return found;
      }
      const created: User = { id: uid("user"), ...args.create };
      db.users.push(created);
      return created;
    },
    async findUnique(args: {
      where: { secondmeUserId: string };
      select?: {
        id?: boolean;
        chatSessions?: { orderBy?: unknown; select?: unknown };
      };
    }) {
      const found = db.users.find(
        (item) => item.secondmeUserId === args.where.secondmeUserId,
      );
      if (!found) return null;
      if (!args.select) return found;
      return {
        id: args.select.id ? found.id : undefined,
        chatSessions: args.select.chatSessions
          ? db.sessions
              .filter((item) => item.userId === found.id)
              .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
              .map((item) => ({
                id: item.id,
                title: item.title,
                updatedAt: item.updatedAt,
              }))
          : undefined,
      };
    },
  },
  chatSession: {
    async create(args: {
      data: { userId: string; title: string };
      select?: { id?: boolean };
    }) {
      const session: ChatSession = {
        id: uid("session"),
        userId: args.data.userId,
        title: args.data.title,
        updatedAt: new Date(),
      };
      db.sessions.push(session);
      return args.select?.id ? { id: session.id } : session;
    },
  },
  chatMessage: {
    async create(args: {
      data: { sessionId: string; role: "user" | "assistant"; content: string };
    }) {
      db.messages.push({
        id: uid("msg"),
        sessionId: args.data.sessionId,
        role: args.data.role,
        content: args.data.content,
      });
      const session = db.sessions.find((item) => item.id === args.data.sessionId);
      if (session) session.updatedAt = new Date();
      return { ok: true };
    },
  },
  userNote: {
    async create(args: { data: { userId: string; content: string } }) {
      db.notes.push({ id: uid("note"), ...args.data });
      return { ok: true };
    },
  },
};
