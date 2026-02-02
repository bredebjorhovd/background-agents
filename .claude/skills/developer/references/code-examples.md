# Code Examples

Complete examples demonstrating hexagonal architecture, TDD, and immutability patterns in TypeScript
and Python.

## TypeScript Examples

### Immutable Domain Entities

```typescript
// domain/entities/Session.ts

export class Session {
  private constructor(
    public readonly id: SessionId,
    public readonly repoRef: RepoRef,
    public readonly messages: readonly Message[],
    public readonly createdAt: Date
  ) {}

  static create(id: SessionId, repoRef: RepoRef): Session {
    return new Session(id, repoRef, [], new Date());
  }

  // ✅ Pure function - returns new Session
  addMessage(message: Message): Session {
    return new Session(
      this.id,
      this.repoRef,
      [...this.messages, message], // New array
      this.createdAt
    );
  }

  // ✅ Pure function - returns new Session
  withMessages(messages: Message[]): Session {
    return new Session(this.id, this.repoRef, messages, this.createdAt);
  }

  createSnapshot(): Snapshot {
    return Snapshot.fromSession(this);
  }
}

// ❌ WRONG - Mutation
class MutableSession {
  addMessage(message: Message): void {
    this.messages.push(message); // MUTATION!
  }
}
```

### Value Objects with Validation

```typescript
// domain/value-objects/SessionId.ts

export class SessionId {
  private constructor(public readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error("SessionId cannot be empty");
    }
  }

  static create(value: string): SessionId {
    return new SessionId(value);
  }

  static generate(): SessionId {
    return new SessionId(crypto.randomUUID());
  }

  equals(other: SessionId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

// domain/value-objects/RepoRef.ts

export class RepoRef {
  private constructor(
    public readonly owner: string,
    public readonly name: string
  ) {
    if (!owner || !name) {
      throw new Error("Owner and name are required");
    }
  }

  static create(owner: string, name: string): RepoRef {
    return new RepoRef(owner, name);
  }

  get fullName(): string {
    return `${this.owner}/${this.name}`;
  }

  equals(other: RepoRef): boolean {
    return this.owner === other.owner && this.name === other.name;
  }
}
```

### Port Interface (Application Layer)

```typescript
// application/ports/SessionRepository.ts

export interface SessionRepository {
  save(session: Session): Promise<void>;
  findById(id: SessionId): Promise<Session | null>;
  findAll(): Promise<Session[]>;
  delete(id: SessionId): Promise<void>;
}

// application/ports/GitService.ts

export interface GitService {
  clone(repoRef: RepoRef): Promise<void>;
  commit(sessionId: SessionId, message: string): Promise<string>;
  push(sessionId: SessionId): Promise<void>;
  createBranch(sessionId: SessionId, branchName: string): Promise<void>;
}
```

### Use Case (Application Layer)

```typescript
// application/usecases/CreateSession.ts

export class CreateSession {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly gitService: GitService,
    private readonly eventPublisher: EventPublisher
  ) {}

  async execute(repoOwner: string, repoName: string): Promise<SessionId> {
    // Create domain objects
    const sessionId = SessionId.generate();
    const repoRef = RepoRef.create(repoOwner, repoName);
    const session = Session.create(sessionId, repoRef);

    // Persist via repository port
    await this.sessionRepo.save(session);

    // Clone repository via git service port
    await this.gitService.clone(repoRef);

    // Publish event via event publisher port
    await this.eventPublisher.publish(SessionCreatedEvent.create(sessionId, repoRef));

    return sessionId;
  }
}

// application/usecases/SendPrompt.ts

export class SendPrompt {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly aiService: AIService
  ) {}

  async execute(sessionId: SessionId, content: string): Promise<Message> {
    // Fetch session
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Create user message
    const userMessage = Message.create(MessageId.generate(), content, "user");

    // Add to session (immutable update)
    const sessionWithUserMsg = session.addMessage(userMessage);
    await this.sessionRepo.save(sessionWithUserMsg);

    // Get AI response
    const aiResponse = await this.aiService.generate(sessionWithUserMsg.messages);

    // Create assistant message
    const assistantMessage = Message.create(MessageId.generate(), aiResponse, "assistant");

    // Add to session (immutable update)
    const finalSession = sessionWithUserMsg.addMessage(assistantMessage);
    await this.sessionRepo.save(finalSession);

    return assistantMessage;
  }
}
```

### Fake Repository (Testing)

```typescript
// tests/fakes/InMemorySessionRepository.ts

export class InMemorySessionRepository implements SessionRepository {
  private sessions = new Map<string, Session>();

  async save(session: Session): Promise<void> {
    // Deep clone to ensure immutability in tests
    this.sessions.set(session.id.value, session);
  }

  async findById(id: SessionId): Promise<Session | null> {
    return this.sessions.get(id.value) || null;
  }

  async findAll(): Promise<Session[]> {
    return Array.from(this.sessions.values());
  }

  async delete(id: SessionId): Promise<void> {
    this.sessions.delete(id.value);
  }

  // Test helpers
  clear(): void {
    this.sessions.clear();
  }

  count(): number {
    return this.sessions.size;
  }

  getAllIds(): SessionId[] {
    return Array.from(this.sessions.keys()).map(SessionId.create);
  }
}
```

### Complete Test Example

```typescript
// application/usecases/CreateSession.test.ts

import { CreateSession } from "./CreateSession";
import { InMemorySessionRepository } from "../../tests/fakes/InMemorySessionRepository";
import { FakeGitService } from "../../tests/fakes/FakeGitService";
import { InMemoryEventPublisher } from "../../tests/fakes/InMemoryEventPublisher";
import { SessionId } from "../../domain/value-objects/SessionId";
import { RepoRef } from "../../domain/value-objects/RepoRef";

describe("CreateSession", () => {
  let sessionRepo: InMemorySessionRepository;
  let gitService: FakeGitService;
  let eventPublisher: InMemoryEventPublisher;
  let useCase: CreateSession;

  beforeEach(() => {
    sessionRepo = new InMemorySessionRepository();
    gitService = new FakeGitService();
    eventPublisher = new InMemoryEventPublisher();
    useCase = new CreateSession(sessionRepo, gitService, eventPublisher);
  });

  describe("execute", () => {
    it("should create and persist new session", async () => {
      const sessionId = await useCase.execute("octocat", "hello-world");

      const saved = await sessionRepo.findById(sessionId);
      expect(saved).not.toBeNull();
      expect(saved!.repoRef.owner).toBe("octocat");
      expect(saved!.repoRef.name).toBe("hello-world");
      expect(saved!.messages).toHaveLength(0);
    });

    it("should clone repository", async () => {
      await useCase.execute("octocat", "hello-world");

      expect(gitService.clonedRepos).toHaveLength(1);
      expect(gitService.clonedRepos[0]).toEqual({
        owner: "octocat",
        name: "hello-world",
      });
    });

    it("should publish SessionCreated event", async () => {
      const sessionId = await useCase.execute("octocat", "hello-world");

      expect(eventPublisher.events).toHaveLength(1);
      expect(eventPublisher.events[0].type).toBe("SessionCreated");
      expect(eventPublisher.events[0].sessionId).toEqual(sessionId);
    });

    it("should throw error when repository name is empty", async () => {
      await expect(useCase.execute("octocat", "")).rejects.toThrow("Owner and name are required");
    });
  });
});
```

### Infrastructure Adapter

```typescript
// infrastructure/persistence/SqliteSessionRepository.ts

import { SessionRepository } from "../../application/ports/SessionRepository";
import { Session } from "../../domain/entities/Session";
import { SessionId } from "../../domain/value-objects/SessionId";
import { RepoRef } from "../../domain/value-objects/RepoRef";
import { Message } from "../../domain/entities/Message";
import { Database } from "better-sqlite3";

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  async save(session: Session): Promise<void> {
    const data = this.serialize(session);

    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO sessions (id, repo_owner, repo_name, data, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .run(
        session.id.value,
        session.repoRef.owner,
        session.repoRef.name,
        JSON.stringify(data),
        session.createdAt.toISOString()
      );
  }

  async findById(id: SessionId): Promise<Session | null> {
    const row = this.db
      .prepare(
        `
      SELECT data FROM sessions WHERE id = ?
    `
      )
      .get(id.value) as { data: string } | undefined;

    return row ? this.deserialize(row.data) : null;
  }

  async findAll(): Promise<Session[]> {
    const rows = this.db
      .prepare(
        `
      SELECT data FROM sessions ORDER BY created_at DESC
    `
      )
      .all() as { data: string }[];

    return rows.map((row) => this.deserialize(row.data));
  }

  async delete(id: SessionId): Promise<void> {
    this.db
      .prepare(
        `
      DELETE FROM sessions WHERE id = ?
    `
      )
      .run(id.value);
  }

  private serialize(session: Session): object {
    return {
      id: session.id.value,
      repoRef: {
        owner: session.repoRef.owner,
        name: session.repoRef.name,
      },
      messages: session.messages.map((m) => ({
        id: m.id.value,
        content: m.content,
        role: m.role,
      })),
      createdAt: session.createdAt.toISOString(),
    };
  }

  private deserialize(data: string): Session {
    const obj = JSON.parse(data);
    const messages = obj.messages.map((m: any) =>
      Message.create(MessageId.create(m.id), m.content, m.role)
    );

    return Session.create(
      SessionId.create(obj.id),
      RepoRef.create(obj.repoRef.owner, obj.repoRef.name)
    ).withMessages(messages);
  }
}
```

---

## Python Examples

### Immutable Domain Entities

```python
# domain/entities/session.py

from dataclasses import dataclass, replace
from datetime import datetime
from typing import Tuple

from domain.value_objects.session_id import SessionId
from domain.value_objects.repo_ref import RepoRef
from domain.entities.message import Message
from domain.entities.snapshot import Snapshot


@dataclass(frozen=True)  # frozen=True makes it immutable
class Session:
    id: SessionId
    repo_ref: RepoRef
    messages: Tuple[Message, ...]  # Tuple is immutable
    created_at: datetime

    @staticmethod
    def create(id: SessionId, repo_ref: RepoRef) -> "Session":
        return Session(
            id=id,
            repo_ref=repo_ref,
            messages=(),
            created_at=datetime.utcnow()
        )

    # ✅ Pure function - returns new Session
    def add_message(self, message: Message) -> "Session":
        return replace(self, messages=self.messages + (message,))

    # ✅ Pure function - returns new Session
    def with_messages(self, messages: Tuple[Message, ...]) -> "Session":
        return replace(self, messages=messages)

    def create_snapshot(self) -> Snapshot:
        return Snapshot.from_session(self)


# ❌ WRONG - Mutation
class MutableSession:
    def __init__(self):
        self.messages = []  # Mutable list

    def add_message(self, message: Message) -> None:
        self.messages.append(message)  # MUTATION!
```

### Value Objects with Validation

```python
# domain/value_objects/session_id.py

from dataclasses import dataclass
import uuid


@dataclass(frozen=True)
class SessionId:
    value: str

    def __post_init__(self):
        if not self.value or not self.value.strip():
            raise ValueError("SessionId cannot be empty")

    @staticmethod
    def create(value: str) -> "SessionId":
        return SessionId(value=value)

    @staticmethod
    def generate() -> "SessionId":
        return SessionId(value=str(uuid.uuid4()))

    def __str__(self) -> str:
        return self.value


# domain/value_objects/repo_ref.py

from dataclasses import dataclass


@dataclass(frozen=True)
class RepoRef:
    owner: str
    name: str

    def __post_init__(self):
        if not self.owner or not self.name:
            raise ValueError("Owner and name are required")

    @staticmethod
    def create(owner: str, name: str) -> "RepoRef":
        return RepoRef(owner=owner, name=name)

    @property
    def full_name(self) -> str:
        return f"{self.owner}/{self.name}"
```

### Port Interface (Application Layer)

```python
# application/ports/session_repository.py

from abc import ABC, abstractmethod
from typing import List, Optional

from domain.entities.session import Session
from domain.value_objects.session_id import SessionId


class SessionRepository(ABC):
    @abstractmethod
    async def save(self, session: Session) -> None:
        pass

    @abstractmethod
    async def find_by_id(self, id: SessionId) -> Optional[Session]:
        pass

    @abstractmethod
    async def find_all(self) -> List[Session]:
        pass

    @abstractmethod
    async def delete(self, id: SessionId) -> None:
        pass


# application/ports/git_service.py

from abc import ABC, abstractmethod

from domain.value_objects.session_id import SessionId
from domain.value_objects.repo_ref import RepoRef


class GitService(ABC):
    @abstractmethod
    async def clone(self, repo_ref: RepoRef) -> None:
        pass

    @abstractmethod
    async def commit(self, session_id: SessionId, message: str) -> str:
        pass

    @abstractmethod
    async def push(self, session_id: SessionId) -> None:
        pass

    @abstractmethod
    async def create_branch(self, session_id: SessionId, branch_name: str) -> None:
        pass
```

### Use Case (Application Layer)

```python
# application/usecases/create_session.py

from application.ports.session_repository import SessionRepository
from application.ports.git_service import GitService
from application.ports.event_publisher import EventPublisher
from domain.entities.session import Session
from domain.value_objects.session_id import SessionId
from domain.value_objects.repo_ref import RepoRef
from domain.events.session_created_event import SessionCreatedEvent


class CreateSession:
    def __init__(
        self,
        session_repo: SessionRepository,
        git_service: GitService,
        event_publisher: EventPublisher
    ):
        self._session_repo = session_repo
        self._git_service = git_service
        self._event_publisher = event_publisher

    async def execute(self, repo_owner: str, repo_name: str) -> SessionId:
        # Create domain objects
        session_id = SessionId.generate()
        repo_ref = RepoRef.create(repo_owner, repo_name)
        session = Session.create(session_id, repo_ref)

        # Persist via repository port
        await self._session_repo.save(session)

        # Clone repository via git service port
        await self._git_service.clone(repo_ref)

        # Publish event via event publisher port
        await self._event_publisher.publish(
            SessionCreatedEvent.create(session_id, repo_ref)
        )

        return session_id


# application/usecases/send_prompt.py

from application.ports.session_repository import SessionRepository
from application.ports.ai_service import AIService
from domain.entities.message import Message
from domain.value_objects.session_id import SessionId
from domain.value_objects.message_id import MessageId


class SendPrompt:
    def __init__(
        self,
        session_repo: SessionRepository,
        ai_service: AIService
    ):
        self._session_repo = session_repo
        self._ai_service = ai_service

    async def execute(self, session_id: SessionId, content: str) -> Message:
        # Fetch session
        session = await self._session_repo.find_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Create user message
        user_message = Message.create(
            MessageId.generate(),
            content,
            "user"
        )

        # Add to session (immutable update)
        session_with_user_msg = session.add_message(user_message)
        await self._session_repo.save(session_with_user_msg)

        # Get AI response
        ai_response = await self._ai_service.generate(
            session_with_user_msg.messages
        )

        # Create assistant message
        assistant_message = Message.create(
            MessageId.generate(),
            ai_response,
            "assistant"
        )

        # Add to session (immutable update)
        final_session = session_with_user_msg.add_message(assistant_message)
        await self._session_repo.save(final_session)

        return assistant_message
```

### Fake Repository (Testing)

```python
# tests/fakes/in_memory_session_repository.py

from typing import Dict, List, Optional

from application.ports.session_repository import SessionRepository
from domain.entities.session import Session
from domain.value_objects.session_id import SessionId


class InMemorySessionRepository(SessionRepository):
    def __init__(self):
        self._sessions: Dict[str, Session] = {}

    async def save(self, session: Session) -> None:
        self._sessions[session.id.value] = session

    async def find_by_id(self, id: SessionId) -> Optional[Session]:
        return self._sessions.get(id.value)

    async def find_all(self) -> List[Session]:
        return list(self._sessions.values())

    async def delete(self, id: SessionId) -> None:
        self._sessions.pop(id.value, None)

    # Test helpers
    def clear(self) -> None:
        self._sessions.clear()

    def count(self) -> int:
        return len(self._sessions)

    def get_all_ids(self) -> List[SessionId]:
        return [SessionId.create(id) for id in self._sessions.keys()]
```

### Complete Test Example

```python
# tests/application/usecases/test_create_session.py

import pytest

from application.usecases.create_session import CreateSession
from tests.fakes.in_memory_session_repository import InMemorySessionRepository
from tests.fakes.fake_git_service import FakeGitService
from tests.fakes.in_memory_event_publisher import InMemoryEventPublisher


class TestCreateSession:
    @pytest.fixture
    def session_repo(self):
        return InMemorySessionRepository()

    @pytest.fixture
    def git_service(self):
        return FakeGitService()

    @pytest.fixture
    def event_publisher(self):
        return InMemoryEventPublisher()

    @pytest.fixture
    def use_case(self, session_repo, git_service, event_publisher):
        return CreateSession(session_repo, git_service, event_publisher)

    @pytest.mark.asyncio
    async def test_should_create_and_persist_new_session(
        self, use_case, session_repo
    ):
        session_id = await use_case.execute("octocat", "hello-world")

        saved = await session_repo.find_by_id(session_id)
        assert saved is not None
        assert saved.repo_ref.owner == "octocat"
        assert saved.repo_ref.name == "hello-world"
        assert len(saved.messages) == 0

    @pytest.mark.asyncio
    async def test_should_clone_repository(self, use_case, git_service):
        await use_case.execute("octocat", "hello-world")

        assert len(git_service.cloned_repos) == 1
        assert git_service.cloned_repos[0] == {
            "owner": "octocat",
            "name": "hello-world"
        }

    @pytest.mark.asyncio
    async def test_should_publish_session_created_event(
        self, use_case, event_publisher
    ):
        session_id = await use_case.execute("octocat", "hello-world")

        assert len(event_publisher.events) == 1
        assert event_publisher.events[0].type == "SessionCreated"
        assert event_publisher.events[0].session_id == session_id

    @pytest.mark.asyncio
    async def test_should_raise_error_when_repository_name_is_empty(
        self, use_case
    ):
        with pytest.raises(ValueError, match="Owner and name are required"):
            await use_case.execute("octocat", "")
```

### Infrastructure Adapter

```python
# infrastructure/persistence/sqlite_session_repository.py

import json
import sqlite3
from typing import List, Optional

from application.ports.session_repository import SessionRepository
from domain.entities.session import Session
from domain.entities.message import Message
from domain.value_objects.session_id import SessionId
from domain.value_objects.repo_ref import RepoRef
from domain.value_objects.message_id import MessageId


class SqliteSessionRepository(SessionRepository):
    def __init__(self, db_path: str):
        self._db = sqlite3.connect(db_path)
        self._db.row_factory = sqlite3.Row

    async def save(self, session: Session) -> None:
        data = self._serialize(session)

        self._db.execute(
            """
            INSERT OR REPLACE INTO sessions
            (id, repo_owner, repo_name, data, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                session.id.value,
                session.repo_ref.owner,
                session.repo_ref.name,
                json.dumps(data),
                session.created_at.isoformat()
            )
        )
        self._db.commit()

    async def find_by_id(self, id: SessionId) -> Optional[Session]:
        cursor = self._db.execute(
            "SELECT data FROM sessions WHERE id = ?",
            (id.value,)
        )
        row = cursor.fetchone()
        return self._deserialize(row["data"]) if row else None

    async def find_all(self) -> List[Session]:
        cursor = self._db.execute(
            "SELECT data FROM sessions ORDER BY created_at DESC"
        )
        return [self._deserialize(row["data"]) for row in cursor.fetchall()]

    async def delete(self, id: SessionId) -> None:
        self._db.execute("DELETE FROM sessions WHERE id = ?", (id.value,))
        self._db.commit()

    def _serialize(self, session: Session) -> dict:
        return {
            "id": session.id.value,
            "repo_ref": {
                "owner": session.repo_ref.owner,
                "name": session.repo_ref.name
            },
            "messages": [
                {
                    "id": m.id.value,
                    "content": m.content,
                    "role": m.role
                }
                for m in session.messages
            ],
            "created_at": session.created_at.isoformat()
        }

    def _deserialize(self, data: str) -> Session:
        obj = json.loads(data)
        messages = tuple(
            Message.create(
                MessageId.create(m["id"]),
                m["content"],
                m["role"]
            )
            for m in obj["messages"]
        )

        return Session.create(
            SessionId.create(obj["id"]),
            RepoRef.create(obj["repo_ref"]["owner"], obj["repo_ref"]["name"])
        ).with_messages(messages)
```

## Key Takeaways

1. **Immutability** - Always create new objects, never mutate
2. **Pure functions** - Domain logic has no side effects
3. **Ports and Adapters** - Application depends on interfaces, infrastructure implements them
4. **Fakes for testing** - Use real implementations with shortcuts, not mocks
5. **TDD** - Write tests first, implement minimum code, refactor

These patterns apply equally to TypeScript and Python. The core principles remain the same across
languages.
