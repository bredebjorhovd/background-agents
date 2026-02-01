# Hexagonal Architecture Guide

## Overview

Hexagonal architecture (also known as Ports and Adapters) organizes code into three distinct layers with strict dependency rules. The goal is to isolate business logic from external concerns, making the system more testable, maintainable, and adaptable to change.

## The Three Layers

```
┌───────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE LAYER                        │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ HTTP Handler │  │ PostgreSQL   │  │ GitHub API   │        │
│  │ (FastAPI)    │  │ Repository   │  │ Adapter      │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
│         │                  │                  │                │
└─────────┼──────────────────┼──────────────────┼────────────────┘
          │                  │                  │
          │ implements port  │                  │
          ▼                  ▼                  ▼
┌───────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                           │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │              Use Cases / Commands                     │     │
│  │  • CreateSession(repo_owner, repo_name)              │     │
│  │  • SendPrompt(session_id, content)                   │     │
│  │  • RestoreSnapshot(session_id, snapshot_id)          │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │                   Port Interfaces                     │     │
│  │  • SessionRepository (port)                          │     │
│  │  • GitService (port)                                 │     │
│  │  • EventPublisher (port)                             │     │
│  └──────────────────────────────────────────────────────┘     │
│                          │                                     │
└──────────────────────────┼─────────────────────────────────────┘
                           │ uses
                           ▼
┌───────────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER                              │
│                                                                │
│  ┌──────────────────┐  ┌──────────────────┐                  │
│  │   Entities       │  │  Value Objects   │                  │
│  │  • Session       │  │  • SessionId     │                  │
│  │  • Message       │  │  • RepoRef       │                  │
│  │  • Snapshot      │  │  • MessageId     │                  │
│  └──────────────────┘  └──────────────────┘                  │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │              Business Logic                           │     │
│  │  • Session.addMessage(message)                       │     │
│  │  • Session.createSnapshot() → Snapshot               │     │
│  │  • Snapshot.restore() → Session                      │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Domain Layer (Core)

**What it contains:**
- Business entities (Session, Message, Snapshot)
- Value objects (SessionId, RepoRef, MessageId)
- Domain logic and invariants
- Pure functions with no side effects

**Dependency rule:** Depends on NOTHING. Zero imports from application or infrastructure.

**Example (TypeScript):**
```typescript
// domain/entities/Session.ts
export class Session {
  private constructor(
    public readonly id: SessionId,
    public readonly repoRef: RepoRef,
    private readonly messages: readonly Message[]
  ) {}

  static create(id: SessionId, repoRef: RepoRef): Session {
    return new Session(id, repoRef, []);
  }

  // Pure function - returns new Session, never mutates
  addMessage(message: Message): Session {
    return new Session(
      this.id,
      this.repoRef,
      [...this.messages, message]
    );
  }

  createSnapshot(): Snapshot {
    return Snapshot.fromSession(this);
  }
}
```

**Example (Python):**
```python
# domain/entities/session.py
from dataclasses import dataclass, replace
from typing import List

@dataclass(frozen=True)
class Session:
    id: SessionId
    repo_ref: RepoRef
    messages: tuple[Message, ...]  # Immutable tuple

    @staticmethod
    def create(id: SessionId, repo_ref: RepoRef) -> "Session":
        return Session(id=id, repo_ref=repo_ref, messages=())

    def add_message(self, message: Message) -> "Session":
        # Returns new Session, never mutates
        return replace(self, messages=self.messages + (message,))

    def create_snapshot(self) -> Snapshot:
        return Snapshot.from_session(self)
```

### Application Layer (Use Cases)

**What it contains:**
- Use cases / commands that orchestrate domain objects
- Port interfaces (abstract interfaces for external dependencies)
- API endpoint handlers (HTTP, WebSocket, etc.)
- Application services that coordinate multiple operations

**Dependency rule:** Depends ONLY on domain layer. Uses port interfaces (abstractions), not concrete implementations.

**Example (TypeScript):**
```typescript
// application/ports/SessionRepository.ts
export interface SessionRepository {
  save(session: Session): Promise<void>;
  findById(id: SessionId): Promise<Session | null>;
}

// application/usecases/CreateSession.ts
export class CreateSession {
  constructor(
    private readonly sessionRepo: SessionRepository,  // Port, not implementation
    private readonly gitService: GitService           // Port, not implementation
  ) {}

  async execute(repoOwner: string, repoName: string): Promise<SessionId> {
    const sessionId = SessionId.generate();
    const repoRef = RepoRef.create(repoOwner, repoName);

    // Domain logic
    const session = Session.create(sessionId, repoRef);

    // Persist via port
    await this.sessionRepo.save(session);

    // Initialize git via port
    await this.gitService.clone(repoRef);

    return sessionId;
  }
}
```

**Example (Python):**
```python
# application/ports/session_repository.py
from abc import ABC, abstractmethod

class SessionRepository(ABC):
    @abstractmethod
    async def save(self, session: Session) -> None:
        pass

    @abstractmethod
    async def find_by_id(self, id: SessionId) -> Session | None:
        pass

# application/usecases/create_session.py
class CreateSession:
    def __init__(
        self,
        session_repo: SessionRepository,  # Port, not implementation
        git_service: GitService           # Port, not implementation
    ):
        self._session_repo = session_repo
        self._git_service = git_service

    async def execute(self, repo_owner: str, repo_name: str) -> SessionId:
        session_id = SessionId.generate()
        repo_ref = RepoRef.create(repo_owner, repo_name)

        # Domain logic
        session = Session.create(session_id, repo_ref)

        # Persist via port
        await self._session_repo.save(session)

        # Initialize git via port
        await self._git_service.clone(repo_ref)

        return session_id
```

### Infrastructure Layer (Adapters)

**What it contains:**
- Concrete implementations of port interfaces
- Database adapters (PostgreSQL, SQLite, in-memory)
- External API clients (GitHub, Anthropic)
- HTTP framework setup (FastAPI, Express)
- Configuration and dependency injection

**Dependency rule:** Depends on application AND domain layers. Implements port interfaces defined in application layer.

**Example (TypeScript):**
```typescript
// infrastructure/persistence/SqliteSessionRepository.ts
import { SessionRepository } from '../../application/ports/SessionRepository';

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  async save(session: Session): Promise<void> {
    const data = this.serialize(session);
    await this.db.run(
      'INSERT OR REPLACE INTO sessions (id, data) VALUES (?, ?)',
      [session.id.value, JSON.stringify(data)]
    );
  }

  async findById(id: SessionId): Promise<Session | null> {
    const row = await this.db.get(
      'SELECT data FROM sessions WHERE id = ?',
      [id.value]
    );
    return row ? this.deserialize(row.data) : null;
  }

  private serialize(session: Session): object { /* ... */ }
  private deserialize(data: string): Session { /* ... */ }
}
```

**Example (Python):**
```python
# infrastructure/persistence/sqlite_session_repository.py
from application.ports.session_repository import SessionRepository

class SqliteSessionRepository(SessionRepository):
    def __init__(self, db: Database):
        self._db = db

    async def save(self, session: Session) -> None:
        data = self._serialize(session)
        await self._db.execute(
            "INSERT OR REPLACE INTO sessions (id, data) VALUES (?, ?)",
            (session.id.value, json.dumps(data))
        )

    async def find_by_id(self, id: SessionId) -> Session | None:
        row = await self._db.fetch_one(
            "SELECT data FROM sessions WHERE id = ?",
            (id.value,)
        )
        return self._deserialize(row.data) if row else None

    def _serialize(self, session: Session) -> dict: ...
    def _deserialize(self, data: str) -> Session: ...
```

## Ports and Adapters Pattern

**Port** = Interface defined in application layer that describes what the application needs

**Adapter** = Concrete implementation in infrastructure layer that provides the actual functionality

```
Application Layer          Infrastructure Layer
┌──────────────┐          ┌──────────────────┐
│              │          │                  │
│ <<interface>>│          │  PostgreSQL      │
│ SessionRepo  │◄─────────│  Adapter         │
│              │implements│                  │
└──────────────┘          └──────────────────┘
                          ┌──────────────────┐
                          │  In-Memory       │
                          │  Adapter (Fake)  │
                          └──────────────────┘
```

This allows:
- **Testing**: Use fake in-memory adapter in tests
- **Flexibility**: Swap PostgreSQL for MongoDB without touching application layer
- **Isolation**: Business logic doesn't know about database details

## Dependency Injection

Wire up concrete implementations at application startup:

**TypeScript:**
```typescript
// infrastructure/di/container.ts
export function createContainer(): Container {
  const db = new Database('./sessions.db');
  const sessionRepo = new SqliteSessionRepository(db);
  const gitService = new GitServiceAdapter();

  return {
    createSession: new CreateSession(sessionRepo, gitService),
    sendPrompt: new SendPrompt(sessionRepo, /* ... */),
    // ... other use cases
  };
}
```

**Python:**
```python
# infrastructure/di/container.py
def create_container() -> Container:
    db = Database('./sessions.db')
    session_repo = SqliteSessionRepository(db)
    git_service = GitServiceAdapter()

    return Container(
        create_session=CreateSession(session_repo, git_service),
        send_prompt=SendPrompt(session_repo, ...),
        # ... other use cases
    )
```

## Benefits

1. **Testability** - Use fakes for ports in tests, no mocking framework needed
2. **Flexibility** - Swap implementations (SQLite → PostgreSQL) without touching business logic
3. **Clarity** - Business logic is pure and isolated from infrastructure concerns
4. **Maintainability** - Changes to external APIs only affect adapters, not core logic
5. **Parallel development** - Team can work on domain while infrastructure is being built

## Common Mistakes

❌ **Domain importing from application/infrastructure**
```typescript
// domain/Session.ts - WRONG!
import { SessionRepository } from '../application/ports/SessionRepository';
```

✅ Domain should have ZERO imports from outer layers

❌ **Business logic in infrastructure**
```typescript
// infrastructure/SqliteSessionRepository.ts - WRONG!
async save(session: Session): Promise<void> {
  if (session.messages.length > 100) {  // Business rule!
    throw new Error('Too many messages');
  }
  // ...
}
```

✅ Business rules belong in domain/application layers

❌ **Use cases depending on concrete implementations**
```typescript
// application/CreateSession.ts - WRONG!
import { SqliteSessionRepository } from '../../infrastructure/persistence';

constructor(private repo: SqliteSessionRepository) {}
```

✅ Use cases should depend on port interfaces only

## See Also

- `testing-philosophy.md` - How to test each layer effectively
- `code-examples.md` - More detailed TypeScript and Python examples
