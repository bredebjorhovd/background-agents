# Testing Philosophy

## Test-Driven Development (TDD)

### The Red-Green-Refactor Cycle

TDD is not just about writing tests—it's a design discipline that forces you to think about contracts before implementation.

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  1. RED: Write a failing test                      │
│     - Test should compile but fail                 │
│     - Verifies test actually tests something       │
│     - Defines the contract/API you want            │
│                                                     │
│              ↓                                      │
│                                                     │
│  2. GREEN: Make it pass                            │
│     - Write MINIMUM code to pass                   │
│     - Don't worry about elegance yet               │
│     - Hard-code if necessary                       │
│                                                     │
│              ↓                                      │
│                                                     │
│  3. REFACTOR: Improve the code                     │
│     - Remove duplication                           │
│     - Improve names and structure                  │
│     - Extract functions/classes                    │
│     - Tests must stay green                        │
│                                                     │
│              ↓                                      │
│                                                     │
│  Repeat for next small increment                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Concrete TDD Example

**Feature:** Add message to session

**Step 1: RED**
```typescript
// domain/entities/Session.test.ts
describe('Session', () => {
  it('should add message to session', () => {
    const session = Session.create(
      SessionId.generate(),
      RepoRef.create('owner', 'repo')
    );
    const message = Message.create(MessageId.generate(), 'Hello');

    const updated = session.addMessage(message);

    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0]).toBe(message);
  });
});
```

**Run test → it fails (method doesn't exist)**

**Step 2: GREEN**
```typescript
// domain/entities/Session.ts
export class Session {
  constructor(
    public readonly id: SessionId,
    public readonly repoRef: RepoRef,
    public readonly messages: readonly Message[]
  ) {}

  addMessage(message: Message): Session {
    return new Session(this.id, this.repoRef, [...this.messages, message]);
  }
}
```

**Run test → it passes**

**Step 3: REFACTOR**

Code is already simple. Nothing to refactor. Move to next test.

### Why This Order Matters

1. **Test first** → Forces you to think about API design from caller's perspective
2. **Minimum code** → Prevents over-engineering and gold-plating
3. **Refactor last** → You have safety net of passing tests

## Testing Hierarchy: Fakes > Stubs > Mocks

### The Golden Rule

**Use fakes for everything you control.** Only stub/mock external dependencies you don't control.

```
┌──────────────────────────────────────────────────────────┐
│                     FAKES (Preferred)                     │
│                                                           │
│  Real implementations with shortcuts                      │
│  Use for: Your own repositories, services, adapters      │
│  Example: In-memory repository instead of PostgreSQL     │
│                                                           │
└───────────────────────────┬───────────────────────────────┘
                            │
                            │ If fake is too complex/slow
                            ▼
┌──────────────────────────────────────────────────────────┐
│                    STUBS (When Needed)                    │
│                                                           │
│  Return hardcoded values                                 │
│  Use for: External APIs during testing                   │
│  Example: Stub GitHub API to return mock repository      │
│                                                           │
└───────────────────────────┬───────────────────────────────┘
                            │
                            │ Only if you MUST verify calls
                            ▼
┌──────────────────────────────────────────────────────────┐
│                    MOCKS (Last Resort)                    │
│                                                           │
│  Verify method calls and arguments                       │
│  Use for: Rare cases where call pattern matters          │
│  Warning: Tightly couples tests to implementation        │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### Fake Example (Preferred)

**TypeScript:**
```typescript
// tests/fakes/InMemorySessionRepository.ts
export class InMemorySessionRepository implements SessionRepository {
  private sessions = new Map<string, Session>();

  async save(session: Session): Promise<void> {
    this.sessions.set(session.id.value, session);
  }

  async findById(id: SessionId): Promise<Session | null> {
    return this.sessions.get(id.value) || null;
  }

  // Test helpers
  clear(): void {
    this.sessions.clear();
  }

  count(): number {
    return this.sessions.size;
  }
}

// In test
const repo = new InMemorySessionRepository();
const useCase = new CreateSession(repo, gitService);

await useCase.execute('owner', 'repo');
expect(repo.count()).toBe(1);
```

**Python:**
```python
# tests/fakes/in_memory_session_repository.py
class InMemorySessionRepository(SessionRepository):
    def __init__(self):
        self._sessions: dict[str, Session] = {}

    async def save(self, session: Session) -> None:
        self._sessions[session.id.value] = session

    async def find_by_id(self, id: SessionId) -> Session | None:
        return self._sessions.get(id.value)

    # Test helpers
    def clear(self) -> None:
        self._sessions.clear()

    def count(self) -> int:
        return len(self._sessions)

# In test
repo = InMemorySessionRepository()
use_case = CreateSession(repo, git_service)

await use_case.execute('owner', 'repo')
assert repo.count() == 1
```

### Benefits of Fakes

1. **Real behavior** - Catches bugs that mocks miss
2. **Reusable** - One fake serves many tests
3. **Refactor-safe** - Tests survive implementation changes
4. **Fast** - In-memory is faster than real database
5. **Simple** - No mocking framework needed

### When to Use Stubs

Only for external dependencies you don't control:

```typescript
// Stub external GitHub API
const githubApi = {
  getRepository: async () => ({
    owner: 'owner',
    name: 'repo',
    defaultBranch: 'main'
  })
};

const gitService = new GitServiceAdapter(githubApi);
```

### When to Use Mocks (Rarely)

Only when you must verify interaction patterns:

```typescript
// Mock event publisher to verify event was published
const eventPublisher = {
  publish: jest.fn()
};

await useCase.execute('owner', 'repo');

expect(eventPublisher.publish).toHaveBeenCalledWith(
  expect.objectContaining({ type: 'SessionCreated' })
);
```

**Warning:** Mocks couple tests to implementation. Prefer testing outcomes over method calls.

## Test Structure

### Arrange-Act-Assert (AAA)

Every test follows this pattern:

```typescript
it('should add message to session', () => {
  // ARRANGE - Set up test data
  const session = Session.create(
    SessionId.generate(),
    RepoRef.create('owner', 'repo')
  );
  const message = Message.create(MessageId.generate(), 'Hello');

  // ACT - Execute the behavior
  const updated = session.addMessage(message);

  // ASSERT - Verify the outcome
  expect(updated.messages).toHaveLength(1);
  expect(updated.messages[0]).toBe(message);
});
```

### Test Naming

Use descriptive names that explain behavior:

✅ **Good:**
```typescript
it('should create new session with empty messages')
it('should throw error when repository name is empty')
it('should restore session from snapshot')
```

❌ **Bad:**
```typescript
it('works')
it('test1')
it('addMessage')
```

## Testing Each Layer

### Domain Layer Tests

**What to test:**
- Entity behavior and invariants
- Value object validation
- Pure business logic

**No external dependencies needed** - domain is pure.

```typescript
// domain/entities/Session.test.ts
describe('Session', () => {
  describe('create', () => {
    it('should create session with empty messages', () => {
      const session = Session.create(id, repoRef);
      expect(session.messages).toHaveLength(0);
    });
  });

  describe('addMessage', () => {
    it('should return new session with added message', () => {
      const session = Session.create(id, repoRef);
      const updated = session.addMessage(message);

      expect(updated.messages).toHaveLength(1);
      expect(session.messages).toHaveLength(0); // Original unchanged
    });
  });
});
```

### Application Layer Tests

**What to test:**
- Use case orchestration
- Port interactions
- Error handling

**Use fakes for ports:**

```typescript
// application/usecases/CreateSession.test.ts
describe('CreateSession', () => {
  let sessionRepo: InMemorySessionRepository;
  let gitService: FakeGitService;
  let useCase: CreateSession;

  beforeEach(() => {
    sessionRepo = new InMemorySessionRepository();
    gitService = new FakeGitService();
    useCase = new CreateSession(sessionRepo, gitService);
  });

  it('should create and persist session', async () => {
    const sessionId = await useCase.execute('owner', 'repo');

    const saved = await sessionRepo.findById(sessionId);
    expect(saved).not.toBeNull();
    expect(saved!.repoRef.owner).toBe('owner');
  });

  it('should clone repository', async () => {
    await useCase.execute('owner', 'repo');

    expect(gitService.clonedRepos).toHaveLength(1);
    expect(gitService.clonedRepos[0]).toEqual({
      owner: 'owner',
      name: 'repo'
    });
  });
});
```

### Infrastructure Layer Tests

**What to test:**
- Adapter implementation correctness
- Database queries (integration tests)
- API client behavior

**Use real dependencies (or close approximations):**

```typescript
// infrastructure/persistence/SqliteSessionRepository.test.ts
describe('SqliteSessionRepository', () => {
  let db: Database;
  let repo: SqliteSessionRepository;

  beforeEach(async () => {
    db = new Database(':memory:'); // In-memory SQLite
    await runMigrations(db);
    repo = new SqliteSessionRepository(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('should save and retrieve session', async () => {
    const session = Session.create(id, repoRef);

    await repo.save(session);
    const retrieved = await repo.findById(id);

    expect(retrieved).toEqual(session);
  });
});
```

## Coverage Expectations

**Minimum: 80% overall coverage**

But focus on **critical paths**, not just percentages:

- **100% coverage**: Domain layer (pure business logic)
- **≥90% coverage**: Application layer (use cases)
- **≥70% coverage**: Infrastructure layer (adapters)

**Don't chase 100%** if it leads to testing trivial getters/setters.

## Common Testing Mistakes

❌ **Testing implementation details**
```typescript
it('should call repository.save()', async () => {
  const repo = mock<SessionRepository>();
  await useCase.execute('owner', 'repo');
  expect(repo.save).toHaveBeenCalled(); // Couples to implementation
});
```

✅ **Test outcomes**
```typescript
it('should persist session', async () => {
  const repo = new InMemorySessionRepository();
  await useCase.execute('owner', 'repo');
  expect(repo.count()).toBe(1); // Tests behavior
});
```

❌ **Multiple assertions for unrelated things**
```typescript
it('should do many things', async () => {
  // Tests session creation, message adding, snapshot creation...
  // If this fails, which part broke?
});
```

✅ **One logical assertion per test**
```typescript
it('should create session with empty messages', () => { /* ... */ });
it('should add message to session', () => { /* ... */ });
it('should create snapshot from session', () => { /* ... */ });
```

❌ **Mocking everything**
```typescript
const repo = mock<SessionRepository>();
const git = mock<GitService>();
const events = mock<EventPublisher>();
// Brittle, implementation-coupled tests
```

✅ **Using fakes**
```typescript
const repo = new InMemorySessionRepository();
const git = new FakeGitService();
const events = new InMemoryEventPublisher();
// Robust, refactor-safe tests
```

## See Also

- `hexagonal-architecture.md` - How to structure code for testability
- `code-examples.md` - Complete test examples in TypeScript and Python
