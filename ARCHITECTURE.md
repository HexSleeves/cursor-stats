# Cursor Stats Architecture

**Version:** 2.0
**Last Updated:** 2025-12-23

---

## Overview

Cursor Stats is a VS Code extension that monitors Cursor AI usage statistics. The extension follows a layered architecture with clear separation of concerns.

## Architecture Principles

1. **Separation of Concerns** - Each layer has a specific responsibility
2. **Dependency Injection** - Services receive their dependencies through constructors
3. **Repository Pattern** - Data access is abstracted through repositories
4. **Strategy Pattern** - Different display modes use interchangeable strategies
5. **State Encapsulation** - State is managed in dedicated classes, not module-level

---

## Directory Structure

```bash
src/
├── extension.ts              # Extension activation/deactivation entry point
├── core/                     # Core state management
│   ├── ExtensionState.ts     # Centralized extension state
│   ├── CooldownManager.ts    # Error cooldown state management
│   └── NotificationState.ts  # Notification tracking state
├── repositories/             # Data access layer
│   ├── CursorRepository.ts   # Cursor API HTTP calls
│   └── TeamRepository.ts     # Team-related API calls
├── services/                 # Business logic layer
│   ├── StatsService.ts       # Stats orchestration
│   ├── UsageService.ts       # Usage data processing
│   ├── api.ts                # Legacy API (being phased out)
│   ├── database.ts           # SQLite token extraction
│   ├── github.ts             # GitHub update checking
│   └── team.ts               # Team membership services
├── processors/               # Data transformation
│   ├── ModelDetector.ts      # Model name detection from descriptions
│   ├── ItemProcessor.ts      # Invoice item processing
│   └── UsageCalculator.ts    # Usage calculation utilities
├── handlers/                 # UI and event handling
│   ├── StatsUpdateHandler.ts # Main stats update coordinator
│   ├── TokenModeHandler.ts   # Token display strategy
│   ├── ClassicModeHandler.ts # Classic display strategy
│   ├── statusBar.ts          # Status bar rendering
│   └── notifications.ts      # User notifications
├── ui/                       # UI components
│   ├── TooltipBuilder.ts     # Tooltip HTML generation
│   └── StatusColorProvider.ts # Status bar color logic
├── utils/                    # Utilities
│   ├── cooldown.ts           # Cooldown utilities (uses CooldownManager)
│   ├── currency.ts           # Currency conversion
│   ├── dateFormatter.ts      # Date formatting utilities
│   ├── errorHandler.ts       # Error handling utilities
│   ├── httpHeaders.ts        # HTTP header generation
│   ├── i18n.ts               # Internationalization
│   ├── logger.ts             # Logging utilities
│   ├── percentageFormatter.ts # Percentage formatting
│   ├── progressBars.ts       # Progress bar generation
│   ├── remainingDays.ts      # Days remaining calculation
│   ├── report.ts             # Diagnostic report generation
│   └── updateStats.ts        # Stats update utilities
├── constants/                # Constants
│   ├── api.ts                # API endpoints and configuration
│   ├── config.ts             # Configuration defaults
│   └── defaults.ts           # Default values
├── interfaces/               # TypeScript interfaces
│   ├── types.ts              # Type definitions
│   └── i18n.ts               # i18n interfaces
└── locales/                  # Localization files
    ├── en.json               # English translations
    ├── zh.json               # Chinese translations
    └── ...
```

---

## Layer Responsibilities

### 1. Core Layer (`src/core/`)

**Purpose:** Manage extension lifecycle and state

**Classes:**

- **ExtensionState** - Holds VS Code context and global state
- **CooldownManager** - Manages error cooldown state with proper encapsulation
- **NotificationState** - Tracks notification schedules and thresholds

**Key Pattern:** Class-based state management replacing module-level variables

```typescript
// Before (module-level state - anti-pattern)
let _cooldownStartTime: number | null = null;
let _consecutiveErrorCount: number = 0;

// After (encapsulated state)
class CooldownManager {
    private cooldownStartTime: number | null = null;
    private consecutiveErrorCount: number = 0;

    startCooldown(): void { /* ... */ }
    reset(): void { /* ... */ }
    dispose(): void { /* ... */ }
}
```

### 2. Repository Layer (`src/repositories/`)

**Purpose:** Abstract data access and HTTP calls

**Classes:**

- **CursorRepository** - Handles all Cursor.com API calls
- **TeamRepository** - Handles team-related API calls

**Key Pattern:** Repository returns Result<T> types for error handling

```typescript
class CursorRepository {
    async getUsage(userId: string): Promise<Result<CursorUsageResponse>> {
        // Pure HTTP call, no business logic
        // Returns Result wrapper for error handling
    }
}
```

### 3. Service Layer (`src/services/`)

**Purpose:** Business logic orchestration

**Classes:**

- **StatsService** - Orchestrates stats fetching and processing
- **UsageService** - Processes usage data for display

**Key Pattern:** Services receive repositories through dependency injection

```typescript
class StatsService {
    constructor(
        private cursorRepo: CursorRepository,
        private teamRepo: TeamRepository
    ) {}

    async getStats(userId: string): Promise<Stats> {
        const [usage, teamInfo] = await Promise.all([
            this.cursorRepo.getUsage(userId),
            this.teamRepo.getTeamInfo(userId)
        ]);
        return this.processData(usage, teamInfo);
    }
}
```

### 4. Processor Layer (`src/processors/`)

**Purpose:** Transform raw data into domain objects

**Classes:**

- **ModelDetector** - Extracts model names from descriptions
- **ItemProcessor** - Processes invoice items
- **UsageCalculator** - Calculates usage metrics

**Key Pattern:** Stateless utility classes with static methods

```typescript
class ModelDetector {
    static detectFromDescription(description: string): ModelInfo {
        // Extract model name and type from description
    }
}
```

### 5. Handler Layer (`src/handlers/`)

**Purpose:** UI updates and event handling

**Classes:**

- **StatsUpdateHandler** - Coordinates stats updates
- **TokenModeHandler** - Strategy for token mode display
- **ClassicModeHandler** - Strategy for classic mode display
- **statusBar** - Status bar rendering
- **notifications** - User notifications

**Key Pattern:** Strategy pattern for different display modes

```typescript
interface StatsDisplayStrategy {
    update(item: vscode.StatusBarItem): Promise<void>;
}

class TokenModeStrategy implements StatsDisplayStrategy {
    constructor(
        private statsService: StatsService,
        private currencyService: CurrencyService
    ) {}

    async update(item: vscode.StatusBarItem): Promise<void> {
        // Token mode specific logic
    }
}
```

### 6. UI Layer (`src/ui/`)

**Purpose:** UI component generation

**Classes:**

- **TooltipBuilder** - Builds tooltip HTML content
- **StatusColorProvider** - Determines status bar colors

**Key Pattern:** Builder pattern for complex UI construction

```typescript
class TooltipBuilder {
    withTitle(title: string): this { /* ... */ }
    withSection(header: string, items: TooltipItem[]): this { /* ... */ }
    build(): string { /* ... */ }
}
```

---

## Data Flow

### Stats Update Flow

```
extension.ts (activation)
    ↓
ExtensionState (initialize)
    ↓
StatsUpdateHandler.update()
    ↓
┌─────────────────────────────┐
│ StatsService.getStats()     │
│ ↓                           │
│ CursorRepository.getUsage() │ ←→ HTTP Call
│ TeamRepository.getTeamInfo()│ ←→ HTTP Call
│ ↓                           │
│ UsageService.processData()  │
│ ↓                           │
│ ModelDetector.detect()      │
│ ItemProcessor.process()     │
│ UsageCalculator.calculate() │
└─────────────────────────────┘
    ↓
TokenModeHandler / ClassicModeHandler (select strategy)
    ↓
TooltipBuilder.build()
    ↓
statusBar.update()
```

### Error Handling Flow

```
Repository Layer
    ↓
Result<T> wrapper (ok/error)
    ↓
Service Layer (handle errors, retry)
    ↓
CooldownManager (track errors)
    ↓
errorHandler (log, notify user)
```

---

## Key Design Patterns

### 1. Repository Pattern

Separates data access from business logic. Repositories only handle HTTP calls and return Result types.

### 2. Strategy Pattern

Different display modes (Token vs Classic) are implemented as interchangeable strategies.

### 3. Builder Pattern

TooltipBuilder provides fluent interface for constructing complex tooltips.

### 4. Dependency Injection

Services receive dependencies through constructors, making testing easier.

### 5. Result Type

Repositories return `Result<T>` instead of throwing exceptions, making error handling explicit.

---

## Migration Notes

### From Legacy to New Architecture

| Legacy Pattern | New Pattern |
|----------------|-------------|
| Module-level state | Class-based state (CooldownManager, NotificationState) |
| `api.ts` (563 lines) | CursorRepository, TeamRepository |
| `updateStats.ts` (787 lines) | StatsUpdateHandler, TokenModeHandler, ClassicModeHandler |
| Scattered date formatting | DateFormatter utility |
| Inconsistent error handling | errorHandler.ts + Result type |

### Backward Compatibility

The refactoring maintains backward compatibility:

- `cooldown.ts` now uses CooldownManager internally
- Existing APIs are preserved
- Extension behavior remains unchanged

---

## Testing Strategy

### Unit Tests

- **Processors** - Test data transformation logic
- **Services** - Mock repositories, test business logic
- **State Managers** - Test state transitions

### Integration Tests

- **Handlers** - Test full update flow
- **Repositories** - Test API integration with mocks

---

## Future Improvements

1. **Complete migration** - Fully remove legacy `api.ts` and `updateStats.ts`
2. **Type safety** - Replace remaining `any` types with proper types
3. **Validation** - Add Zod schemas for runtime validation
4. **Testing** - Achieve 80%+ test coverage
5. **Documentation** - Add JSDoc comments to all public APIs
