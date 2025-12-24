# Cursor-Stats Refactoring Plan

**Date:** 2025-12-23
**Version:** 1.0
**Author:** Architecture Analysis

---

## Executive Summary

The cursor-stats VS Code extension is a functional codebase that displays Cursor AI usage statistics in the status bar. While the extension works correctly, the codebase exhibits several architectural and code quality issues that will impact long-term maintainability and extensibility.

**Key Findings:**
- **3 Critical Issues** requiring immediate attention
- **12 Major Issues** affecting maintainability
- **8 Minor Issues** for code quality improvement
- **Estimated Effort:** 40-60 hours of focused work

**Primary Concerns:**
1. Massive god files (`updateStats.ts`: 787 lines, `api.ts`: 563 lines, `statusBar.ts`: 508 lines)
2. Poor separation of concerns across handlers and utilities
3. Module-level state management causing potential lifecycle issues
4. Significant code duplication (date formatting, API calls)
5. Inconsistent error handling patterns

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Identified Issues and Opportunities](#identified-issues-and-opportunities)
3. [Proposed Refactoring Plan](#proposed-refactoring-plan)
4. [Risk Assessment and Mitigation](#risk-assessment-and-mitigation)
5. [Testing Strategy](#testing-strategy)
6. [Success Metrics](#success-metrics)

---

## Current State Analysis

### File Structure Overview

```
src/
├── extension.ts              (495 lines) - Extension activation, commands
├── handlers/
│   ├── statusBar.ts         (508 lines) - Status bar & tooltip rendering
│   └── notifications.ts     (388 lines) - User notifications
├── services/
│   ├── api.ts              (563 lines) - API calls to cursor.com
│   ├── database.ts         (135 lines) - SQLite token extraction
│   ├── github.ts           (386 lines) - Update checking
│   └── team.ts             (254 lines) - Team membership & spend
├── utils/
│   ├── updateStats.ts      (787 lines) - Main stats update logic ⚠️
│   ├── cooldown.ts         (148 lines) - Error cooldown management
│   ├── currency.ts         (249 lines) - Currency conversion
│   ├── i18n.ts             (235 lines) - Internationalization
│   ├── logger.ts           (119 lines) - Logging utility
│   ├── percentageFormatter.ts (50 lines) - Percentage formatting
│   ├── progressBars.ts     (379 lines) - Progress bar generation
│   ├── remainingDays.ts    (132 lines) - Days remaining calculation
│   ├── report.ts           (278 lines) - Report generation
│   └── httpHeaders.ts      (67 lines) - HTTP header utilities
└── interfaces/
    ├── types.ts            (226 lines) - TypeScript interfaces
    └── i18n.ts             (228 lines) - i18n interface
```

### Architecture Summary

**Current Pattern:** Service-oriented with some separation of concerns, but significant blending of responsibilities.

**Strengths:**
- Clear separation between services, handlers, and utilities (nominally)
- Good use of TypeScript interfaces
- Comprehensive internationalization support
- Detailed logging throughout

**Weaknesses:**
- Handler files contain business logic that should be in services
- Utility files have grown into complex business logic handlers
- Module-level state scattered across files
- Inconsistent error handling patterns

---

## Identified Issues and Opportunities

### Critical Issues (Must Fix)

#### 1. God Object: `updateStats.ts` (787 lines)

**Location:** `/src/utils/updateStats.ts`

**Problem:**
This single file handles too many responsibilities:
- Stats fetching orchestration
- Token mode vs classic mode logic
- UI string generation
- Data transformation
- Notification triggering
- Model name extraction and parsing
- Date formatting (duplicated)

**Code Example:**
```typescript
export async function updateStats(statusBarItem: vscode.StatusBarItem) {
    // 41-166: Token checking and mode selection
    // 169-180: Stats fetching with auth retry
    // 192-280: Usage-based status calculation
    // 296-449: Tooltip content building
    // 450-693: Usage-based pricing display
    // 720-761: Notification scheduling
    // All in one 787-line function
}
```

**Impact:**
- Nearly impossible to test
- Difficult to modify without breaking other functionality
- Violates Single Responsibility Principle (SRP)

#### 2. God Object: `statusBar.ts` (508 lines)

**Location:** `/src/handlers/statusBar.ts`

**Problem:**
Status bar handler contains:
- Tooltip markdown generation (300+ lines)
- Color calculation logic
- Separator creation
- Date formatting utilities
- Width calculation

**Code Example:**
```typescript
export async function createMarkdownTooltip(
    contentLines: string[],
    isError: boolean,
    allLines: string[] = []
): Promise<string> {
    // 80+ lines of HTML generation
    // Inline CSS
    // Markdown parsing logic
    // Width calculation
}
```

**Impact:**
- Hardcoded HTML/CSS mixed with TypeScript
- Difficult to maintain or theme
- Tight coupling between display and logic

#### 3. Module-Level State Anti-Pattern

**Locations:**
- `/src/utils/cooldown.ts` - Lines 7-13
- `/src/utils/i18n.ts` - Lines 10-12
- `/src/utils/logger.ts` - Lines 3-5

**Problem:**
Module-level state creates issues with:
- Test isolation
- Lifecycle management
- Potential memory leaks
- Difficulty resetting state

**Code Example:**
```typescript
// cooldown.ts
let _countdownInterval: NodeJS.Timeout | null = null;
let _refreshInterval: NodeJS.Timeout | null = null;
let _cooldownStartTime: number | null = null;
let _consecutiveErrorCount: number = 0;
let _isWindowFocused: boolean = true;
let _statusBarItem: vscode.StatusBarItem | null = null;

// No class or encapsulation
// Exported getters/setters directly
```

**Impact:**
- State persists across tests
- Difficult to reset in different scenarios
- Violates dependency injection principles

---

### Major Issues

#### 4. Code Duplication: Date Formatting

**Locations:**
- `/src/utils/updateStats.ts` - Lines 216-234, 322-344, 470-488
- `/src/utils/progressBars.ts` - Lines 169-220
- `/src/utils/remainingDays.ts` - Lines 25-58

**Problem:**
Same date formatting logic appears 3+ times:

```typescript
// Duplicated in updateStats.ts
const formatDateWithMonthName = (date: Date) => {
    const day = date.getDate();
    const monthNames = [
        t('statusBar.months.january'),
        t('statusBar.months.february'),
        // ... 10 more months
    ];
    const monthName = monthNames[date.getMonth()];
    return `${day} ${monthName}`;
};

// Duplicated in progressBars.ts (getMonthNumber function)
// Duplicated in remainingDays.ts (parse logic)
```

**Impact:**
- Maintenance burden (changes needed in 3+ places)
- Inconsistent behavior possible
- Code bloat

#### 5. API Service Lacks Separation

**Location:** `/src/services/api.ts` (563 lines)

**Problem:**
Single file handles:
- `fetchCursorStats()` - Stats fetching
- `fetchTokenUsageStats()` - Token mode stats
- `fetchTodayUsage()` - Today's usage
- `getCurrentUsageLimit()` - Limit checking
- `checkUsageBasedStatus()` - Status checking
- `fetchMonthData()` - Invoice parsing (150+ lines)

**Specific Issue:**
```typescript
function fetchMonthData(
    items: any[],
    month: number,
    year: number,
    displayLanguage: string
): ProcessedItem[] {
    // 150+ lines of complex parsing logic
    // Model name detection
    // Description parsing
    // Discount handling
    // All embedded in API service
}
```

**Impact:**
- API service does data transformation (should be separate)
- Difficult to test parsing logic independently
- Violates SRP

#### 6. Hardcoded HTML/CSS in TypeScript

**Location:** `/src/handlers/statusBar.ts` - Lines 108-351

**Problem:**
```typescript
panel.webview.html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            :root {
                --bg-color: var(--vscode-editor-background);
                /* 100+ lines of CSS */
            }
        </style>
    </head>
    <body>
        <!-- 100+ lines of HTML -->
    </body>
    </html>
`;
```

**Impact:**
- No syntax highlighting for HTML/CSS
- Difficult to maintain
- Can't use CSS preprocessing
- Hard to theme

#### 7. Inconsistent Error Handling

**Locations:** Throughout codebase

**Problem:**
```typescript
// Pattern 1: Silent catch
try {
    const todayUsage = await fetchTodayUsage(token, teamInfo.teamId);
} catch (error: any) {
    log(`[Stats] Failed to fetch today usage: ${error.message}`, true);
    // Continues without handling
}

// Pattern 2: Re-throw
try {
    // ... code ...
} catch (error: any) {
    log('[Database] Error opening database: ' + error, true);
    return undefined; // Inconsistent return
}

// Pattern 3: Enhance error (only in team.ts)
const enhancedError = enhanceApiError(error, 'Team Spend');
throw enhancedError;
```

**Impact:**
- Unpredictable error propagation
- Inconsistent user experience
- Difficult to debug

#### 8. Magic Numbers and Strings

**Location:** Throughout codebase

**Examples:**
```typescript
// cooldown.ts
export const COOLDOWN_DURATION_MS = 10 * 60 * 1000; // Good

// But elsewhere:
if (errorCount >= 5) { // Magic number
    startCooldown();
}

// currency.ts
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // Good

// But API URLs hardcoded:
'https://cursor.com/api/usage'
'https://cursor.com/api/dashboard/get-team-spend'
```

**Impact:**
- Difficult to change behavior
- No single source of truth
- Risk of inconsistencies

#### 9. Large Function: `fetchMonthData`

**Location:** `/src/services/api.ts` - Lines ~250-400

**Problem:**
150+ line function that:
- Parses invoice items
- Detects model names from descriptions
- Handles discounts
- Categorizes usage types
- Formats display strings

**Impact:**
- Nearly impossible to unit test
- Difficult to modify
- High cyclomatic complexity

#### 10. Notification Handler Complexity

**Location:** `/src/handlers/notifications.ts` (388 lines)

**Problem:**
Multiple notification types with stateful tracking:
- Usage threshold notifications
- Spending notifications
- Unpaid invoice notifications
- Smart usage monitor
- Next notification calculation
- State persistence

**Specific Issue:**
```typescript
let nextUsageNotificationAt: { [key: string]: number } = {};
let nextSpendingNotificationAt: number | null = null;
// Module-level state for notification tracking
```

**Impact:**
- Difficult to test notification logic
- State can become inconsistent
- Complex notification scheduling

#### 11. Missing Input Validation

**Locations:** Throughout API handlers

**Examples:**
```typescript
// updateStats.ts
const maxAmount = vscode.workspace.getConfiguration('cursorStats')
    .get<number>('tokenMaxAmount', 20);
// No validation that maxAmount > 0

// currency.ts
const rate = rates.usd[targetCurrency.toLowerCase()];
// No validation that rate exists and is a number
```

**Impact:**
- Potential runtime errors
- Poor user experience with invalid inputs
- Security concerns

#### 12. Type Safety Issues

**Locations:** Various files

**Examples:**
```typescript
// statusBar.ts
export async function createMarkdownTooltip(
    contentLines: string[],
    isError: boolean,
    allLines: string[] = []
): Promise<string>
// What's the relationship between contentLines and allLines?

// types.ts
export interface ProcessedItem {
    [key: string]: any;  // Defeats purpose of TypeScript
}
```

**Impact:**
- Lost type safety benefits
- Increased runtime errors
- Poor IDE support

---

### Minor Issues

#### 13. Inconsistent Naming Conventions

**Examples:**
```typescript
// Some use underscores: _statusBarItem
// Others use underscores for private: _countdownInterval
// Some use get prefix: getCursorTokenFromDB()
// Others don't: createMarkdownTooltip()
```

#### 14. Comments in Multiple Languages

**Locations:** Various files

**Examples:**
```typescript
/**
 * @author SM
 * 团队服务：包含团队成员检测、团队支出获取与个人支出提取等能力。
 */
```

**Impact:**
- Language barrier for contributors
- Inconsistent documentation

#### 15. Long Parameter Lists

**Example:**
```typescript
export async function checkForUpdates(
    lastReleaseCheck: number,
    RELEASE_CHECK_INTERVAL: number,
    specificVersion?: string
): Promise<void>
```

#### 16. Unused Dependencies

**Location:** `package.json`

- Need to audit which npm packages are actually used

---

## Proposed Refactoring Plan

### Phase 1: Foundation (8-12 hours)

**Goal:** Establish patterns and infrastructure for refactoring

#### 1.1 Create State Management Classes

**Files to Create:**
```
src/core/
├── CooldownManager.ts      (new)
├── NotificationState.ts    (new)
└── ExtensionState.ts       (new)
```

**Changes:**
- Convert `cooldown.ts` module state to `CooldownManager` class
- Convert notification state to `NotificationState` class
- Implement proper lifecycle management

**Example:**
```typescript
// src/core/CooldownManager.ts
export class CooldownManager {
    private countdownInterval: NodeJS.Timeout | null = null;
    private refreshInterval: NodeJS.Timeout | null = null;
    private cooldownStartTime: number | null = null;
    private consecutiveErrorCount: number = 0;

    constructor(private statusBarItem: vscode.StatusBarItem) {}

    startCooldown(): void { /* ... */ }
    reset(): void { /* ... */ }
    dispose(): void { /* ... */ }
}
```

**Benefits:**
- Encapsulated state
- Proper cleanup
- Testable

#### 1.2 Extract Constants

**File to Create:**
```
src/constants/
├── api.ts              (new)
├── config.ts           (new)
└── defaults.ts         (new)
```

**Changes:**
- Move all magic numbers to constants
- Centralize API URLs
- Define default values

**Example:**
```typescript
// src/constants/api.ts
export const API_ENDPOINTS = {
    USAGE: 'https://cursor.com/api/usage',
    TEAMS: 'https://cursor.com/api/dashboard/teams',
    TEAM_DETAILS: 'https://cursor.com/api/dashboard/team',
    GET_TEAM_SPEND: 'https://cursor.com/api/dashboard/get-team-spend',
    GET_MONTHLY_INVOICE: 'https://cursor.com/api/dashboard/get-monthly-invoice',
    TOKEN_USAGE: 'https://cursor.com/api/dashboard/token-usage',
} as const;

export const API_CONFIG = {
    TIMEOUT: 15000,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
} as const;
```

#### 1.3 Create Date Utilities

**File to Create:**
```
src/utils/dateFormatter.ts   (new)
```

**Changes:**
- Consolidate all date formatting logic
- Support localized month names
- Parse period strings

**Example:**
```typescript
// src/utils/dateFormatter.ts
export class DateFormatter {
    static formatWithMonthName(date: Date, locale: string): string {
        const day = date.getDate();
        const monthName = this.getMonthName(date.getMonth(), locale);
        return `${day} ${monthName}`;
    }

    static parsePeriod(period: string): { start: Date; end: Date } {
        // Unified period parsing logic
    }

    private static getMonthName(month: number, locale: string): string {
        // Localized month names
    }
}
```

---

### Phase 2: Service Layer Refactoring (12-16 hours)

**Goal:** Separate data fetching from business logic

#### 2.1 Create Repository Pattern for Data

**Files to Create:**
```
src/repositories/
├── CursorRepository.ts     (new)
├── TeamRepository.ts       (new)
└── UsageRepository.ts      (new)
```

**Changes:**
- Move all axios calls to repositories
- Repositories only handle HTTP
- No business logic in repositories

**Example:**
```typescript
// src/repositories/CursorRepository.ts
export class CursorRepository {
    constructor(
        private httpClient: HttpClient,
        private tokenProvider: TokenProvider
    ) {}

    async getUsage(userId: string): Promise<CursorUsageResponse> {
        const token = await this.tokenProvider.getToken();
        return this.httpClient.get(API_ENDPOINTS.USAGE, {
            params: { user: userId },
            headers: this.createHeaders(token)
        });
    }

    async getMonthlyInvoice(
        month: number,
        year: number
    ): Promise<MonthlyInvoice> {
        // ...
    }
}
```

#### 2.2 Create Service Layer

**Files to Create:**
```
src/services/
├── StatsService.ts         (new)
├── UsageService.ts         (new)
├── TeamService.ts          (new)
├── CurrencyService.ts      (new)
└── NotificationService.ts  (new)
```

**Changes:**
- Services orchestrate repositories
- Services contain business logic
- Services are stateless

**Example:**
```typescript
// src/services/StatsService.ts
export class StatsService {
    constructor(
        private cursorRepo: CursorRepository,
        private teamRepo: TeamRepository,
        private usageService: UsageService
    ) {}

    async getStats(userId: string): Promise<Stats> {
        const [usage, teamInfo] = await Promise.all([
            this.cursorRepo.getUsage(userId),
            this.teamRepo.getTeamInfo(userId)
        ]);

        return this.usageService.processUsageData(usage, teamInfo);
    }
}
```

#### 2.3 Extract Data Processing

**Files to Create:**
```
src/processors/
├── ItemProcessor.ts        (new)
├── ModelDetector.ts        (new)
└── UsageCalculator.ts      (new)
```

**Changes:**
- Move `fetchMonthData` logic to `ItemProcessor`
- Extract model name detection to `ModelDetector`
- Create usage calculation utilities

**Example:**
```typescript
// src/processors/ModelDetector.ts
export class ModelDetector {
    private static PATTERNS = {
        TOKEN_BASED: /^(\d+) token-based usage calls to ([\w.-]+),/i,
        EXTRA_FAST: /extra fast premium requests? \(([^)]+)\)/i,
        REQUEST_COUNT: /^(\d+)\s+(.+?)(?: request| calls)?/i,
    };

    static detectFromDescription(description: string): ModelInfo {
        // Extract model name from description
        // Return structured model info
    }
}
```

---

### Phase 3: Handler Refactoring (10-14 hours)

**Goal:** Simplify handlers to only handle UI concerns

#### 3.1 Split `updateStats.ts`

**Files to Create:**
```
src/handlers/
├── StatsUpdateHandler.ts   (new)
├── TokenModeHandler.ts     (new)
└── ClassicModeHandler.ts   (new)
```

**Changes:**
- Create strategy pattern for modes
- Each handler handles one mode
- Common logic in base handler

**Example:**
```typescript
// src/handlers/StatsUpdateHandler.ts
export interface StatsDisplayStrategy {
    update(item: vscode.StatusBarItem): Promise<void>;
}

export class TokenModeStrategy implements StatsDisplayStrategy {
    constructor(
        private statsService: StatsService,
        private currencyService: CurrencyService
    ) {}

    async update(item: vscode.StatusBarItem): Promise<void> {
        const tokenStats = await this.statsService.getTokenStats();
        const cost = await this.currencyService.formatCost(tokenStats.totalCost);
        // Update status bar
    }
}
```

#### 3.2 Separate Tooltip Rendering

**Files to Create:**
```
src/ui/
├── TooltipBuilder.ts       (new)
├── TooltipRenderer.ts      (new)
└── StatusColorProvider.ts  (new)
```

**Changes:**
- Extract tooltip HTML generation
- Create CSS template system
- Separate color logic

**Example:**
```typescript
// src/ui/TooltipBuilder.ts
export class TooltipBuilder {
    constructor(private theme: Theme) {}

    withTitle(title: string): this {
        this.sections.push({ type: 'title', content: title });
        return this;
    }

    withSection(header: string, items: TooltipItem[]): this {
        this.sections.push({ type: 'section', header, items });
        return this;
    }

    build(): string {
        // Generate markdown/HTML
    }
}
```

#### 3.3 Extract CSS to Templates

**Files to Create:**
```
src/ui/templates/
├── tooltip.html            (new)
├── tooltip.css             (new)
└── changelog.html          (new)
```

**Changes:**
- Move HTML to separate files
- Use CSS variables for theming
- Support syntax highlighting

---

### Phase 4: Cleanup and Polish (8-12 hours)

**Goal:** Address remaining issues and improve code quality

#### 4.1 Standardize Error Handling

**File to Modify:**
```
src/utils/
└── errorHandler.ts         (create or enhance)
```

**Changes:**
- Create error class hierarchy
- Standardize error logging
- Implement error recovery strategies

**Example:**
```typescript
// src/utils/errorHandler.ts
export class ExtensionError extends Error {
    constructor(
        message: string,
        public code: ErrorCode,
        public context?: any
    ) {
        super(message);
        this.name = 'ExtensionError';
    }
}

export function handleApiError(error: any, context: string): never {
    if (axios.isAxiosError(error)) {
        throw new ExtensionError(
            `API Error: ${error.message}`,
            ErrorCode.API_ERROR,
            { url: error.config?.url, status: error.response?.status }
        );
    }
    throw error;
}
```

#### 4.2 Improve Type Safety

**Files to Modify:**
- All files with `any` types

**Changes:**
- Replace `any` with proper types
- Use discriminated unions
- Add type guards

**Example:**
```typescript
// Instead of:
function processItem(item: any): ProcessedItem { ... }

// Use:
function processItem(item: InvoiceItem): ProcessedItem {
    if (item.type === 'usage') {
        return processUsageItem(item);
    }
    // TypeScript knows item.type here
}
```

#### 4.3 Add Input Validation

**File to Create:**
```
src/utils/
└── validation.ts           (new)
```

**Changes:**
- Validate configuration values
- Validate API responses
- Add Zod or similar schemas

**Example:**
```typescript
// src/utils/validation.ts
import { z } from 'zod';

export const ConfigSchema = z.object({
    tokenMaxAmount: z.number().positive(),
    refreshInterval: z.number().min(5000),
    currency: z.enum(SUPPORTED_CURRENCIES),
});

export function validateConfig(config: unknown): Config {
    return ConfigSchema.parse(config);
}
```

#### 4.4 Remove Code Duplication

**Changes:**
- Use consolidated date formatter
- Consolidate API header creation
- Share tooltip building logic

---

### Phase 5: Testing and Documentation (4-6 hours)

**Goal:** Ensure reliability and maintainability

#### 5.1 Add Unit Tests

**Files to Create:**
```
src/__tests__/
├── core/
│   ├── CooldownManager.test.ts
│   └── NotificationState.test.ts
├── services/
│   ├── StatsService.test.ts
│   └── CurrencyService.test.ts
├── processors/
│   ├── ModelDetector.test.ts
│   └── ItemProcessor.test.ts
└── utils/
    ├── DateFormatter.test.ts
    └── percentageFormatter.test.ts
```

#### 5.2 Add Integration Tests

**Files to Create:**
```
src/__tests__/
└── integration/
    └── StatsWorkflow.test.ts
```

#### 5.3 Update Documentation

**Files to Update:**
- `README.md`
- Add `ARCHITECTURE.md`
- Add `CONTRIBUTING.md`

---

## Proposed Directory Structure (After Refactoring)

```
src/
├── extension.ts              (reduced to ~150 lines)
├── core/                     (new)
│   ├── CooldownManager.ts
│   ├── NotificationState.ts
│   └── ExtensionState.ts
├── repositories/             (new)
│   ├── CursorRepository.ts
│   ├── TeamRepository.ts
│   └── UsageRepository.ts
├── services/
│   ├── StatsService.ts       (new)
│   ├── UsageService.ts       (new)
│   ├── TeamService.ts        (refactored)
│   ├── CurrencyService.ts    (refactored)
│   ├── api.ts                (deprecated, moved to repos)
│   ├── database.ts           (unchanged)
│   ├── github.ts             (unchanged)
│   └── team.ts               (partially moved to repo)
├── handlers/
│   ├── StatsUpdateHandler.ts (new)
│   ├── TokenModeHandler.ts   (new)
│   ├── ClassicModeHandler.ts (new)
│   ├── statusBar.ts          (refactored, ~200 lines)
│   └── notifications.ts      (refactored, ~200 lines)
├── ui/                       (new)
│   ├── TooltipBuilder.ts
│   ├── TooltipRenderer.ts
│   ├── StatusColorProvider.ts
│   └── templates/
│       ├── tooltip.html
│       ├── tooltip.css
│       └── changelog.html
├── processors/               (new)
│   ├── ItemProcessor.ts
│   ├── ModelDetector.ts
│   └── UsageCalculator.ts
├── utils/
│   ├── cooldown.ts           (moved to core)
│   ├── currency.ts           (refactored, use service)
│   ├── i18n.ts               (refactored)
│   ├── logger.ts             (unchanged)
│   ├── percentageFormatter.ts
│   ├── progressBars.ts       (refactored, use dateFormatter)
│   ├── remainingDays.ts      (refactored, use dateFormatter)
│   ├── report.ts             (unchanged)
│   ├── httpHeaders.ts        (moved to repos)
│   ├── dateFormatter.ts      (new)
│   ├── errorHandler.ts       (new)
│   └── validation.ts         (new)
├── constants/                (new)
│   ├── api.ts
│   ├── config.ts
│   └── defaults.ts
├── interfaces/
│   ├── types.ts
│   └── i18n.ts
└── locales/                  (unchanged)
    ├── en.json
    ├── zh.json
    └── ...
```

---

## Risk Assessment and Mitigation

### High Risk Areas

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Breaking existing functionality during refactoring | High | Medium | Comprehensive test suite before starting; incremental refactoring |
| Introducing bugs in state management | High | Medium | Thorough testing of state transitions; keep existing state logic initially |
| Performance regression | Medium | Low | Performance benchmarks before/after; profile hot paths |
| Extension activation issues | High | Low | Thorough testing of activation/deactivation cycle |

### Medium Risk Areas

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Breaking internationalization | Medium | Low | Test all language packs; preserve existing translation keys |
| Currency conversion errors | Medium | Low | Unit tests for all currency calculations |
| API integration breakage | High | Medium | Keep repository API surface identical initially |

### Dependency Graph

```
extension.ts
    └──→ StatsUpdateHandler
            └──→ StatsService
                    ├──→ CursorRepository
                    ├──→ TeamRepository
                    └──→ UsageService
                            └──→ ItemProcessor
                                    └──→ ModelDetector

extension.ts
    └──→ CooldownManager (new)
    └──→ NotificationService
            └──→ NotificationState (new)
```

---

## Testing Strategy

### Unit Tests

**Target Coverage:** 80%+

**Priority Areas:**
1. All processors (ModelDetector, ItemProcessor)
2. All services (StatsService, CurrencyService)
3. State management classes
4. Utility functions (dateFormatter, validation)

**Example Test:**
```typescript
describe('ModelDetector', () => {
    it('should detect GPT-4 from token-based description', () => {
        const result = ModelDetector.detectFromDescription(
            '1000 token-based usage calls to gpt-4, beyond limit'
        );
        expect(result.modelName).toBe('gpt-4');
        expect(result.type).toBe('token-based');
    });

    it('should return unknown for unrecognized patterns', () => {
        const result = ModelDetector.detectFromDescription(
            'some random description'
        );
        expect(result.modelName).toBe('unknown-model');
    });
});
```

### Integration Tests

**Scenarios:**
1. Full stats update flow
2. Token mode fallback to classic mode
3. Cooldown activation and recovery
4. Notification triggering

**Example Test:**
```typescript
describe('Stats Update Integration', () => {
    it('should update status bar with token mode', async () => {
        const mockRepo = mockCursorRepository();
        const handler = new TokenModeHandler(mockRepo);
        const statusBar = createMockStatusBarItem();

        await handler.update(statusBar);

        expect(statusBar.text).toContain('$(credit-card)');
        expect(statusBar.tooltip).toContain('Token Usage');
    });
});
```

### Manual Testing Checklist

- [ ] Extension activates successfully
- [ ] Status bar displays in token mode
- [ ] Status bar displays in classic mode
- [ ] Fallback from token to classic mode works
- [ ] Currency conversion works for all currencies
- [ ] Notifications trigger at correct thresholds
- [ ] Cooldown mode activates after errors
- [ ] All languages display correctly
- [ ] Report generation works
- [ ] Update checking works

---

## Success Metrics

### Code Quality Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Largest file | 787 lines | <300 lines |
| Average file length | ~300 lines | <200 lines |
| Cyclomatic complexity (max) | ~50 | <15 |
| Code duplication | ~8% | <2% |
| Test coverage | 0% | 80%+ |
| TypeScript strict mode | Partial | Full |

### Maintainability Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Files with >5 responsibilities | 5 | 0 |
| Module-level state files | 3 | 0 |
| Hardcoded strings (non-i18n) | ~50 | <10 |
| Functions with >10 parameters | 2 | 0 |
| Classes with >10 methods | 0 | 0 |

### Performance Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Extension activation time | ~100ms | <150ms |
| Stats update time | ~500ms | <600ms |
| Memory usage | ~5MB | <6MB |

---

## Implementation Order

### Sprint 1: Foundation (Week 1)
1. Create constants files
2. Create DateFormatter utility
3. Set up test framework
4. Add tests for existing code

### Sprint 2: State Management (Week 1-2)
5. Create CooldownManager class
6. Create NotificationState class
7. Migrate usage to new classes
8. Add tests for state classes

### Sprint 3: Repository Layer (Week 2)
9. Create repository interfaces
10. Implement CursorRepository
11. Implement TeamRepository
12. Add tests for repositories

### Sprint 4: Service Layer (Week 2-3)
13. Create processor classes
14. Create service classes
15. Migrate business logic
16. Add tests for services

### Sprint 5: Handler Refactoring (Week 3-4)
17. Split updateStats.ts
18. Create strategy classes
19. Refactor statusBar.ts
20. Extract UI components

### Sprint 6: Cleanup (Week 4)
21. Standardize error handling
22. Improve type safety
23. Add input validation
24. Remove duplication

### Sprint 7: Polish (Week 5)
25. Update documentation
26. Performance optimization
27. Final testing
28. Code review

---

## Rollback Strategy

Each phase should be in a separate branch:
- `refactor/foundation`
- `refactor/state-management`
- `refactor/repositories`
- `refactor/services`
- `refactor/handlers`
- `refactor/cleanup`

If a phase introduces issues:
1. Revert the branch
2. Analyze the failure
3. Fix the approach
4. Retry the phase

**Critical:** Always keep `master` in a working state.

---

## Next Steps

1. **Review this plan** with the team
2. **Prioritize phases** based on pain points
3. **Set up testing infrastructure** before any refactoring
4. **Create feature branches** for each phase
5. **Start with Phase 1** (Foundation)

---

## Appendix: File-by-File Analysis

### Files Requiring Major Refactoring

| File | Lines | Issues | Priority |
|------|-------|--------|----------|
| `updateStats.ts` | 787 | God object, mixed concerns | Critical |
| `api.ts` | 563 | Mixed responsibilities | High |
| `statusBar.ts` | 508 | HTML/CSS in TS | High |
| `notifications.ts` | 388 | Stateful, complex | High |
| `github.ts` | 386 | Webview in TS | Medium |
| `extension.ts` | 495 | Too many commands | Medium |
| `team.ts` | 254 | Can use repo pattern | Medium |
| `progressBars.ts` | 379 | Date duplication | Medium |

### Files Requiring Minor Refactoring

| File | Lines | Issues | Priority |
|------|-------|--------|----------|
| `currency.ts` | 249 | Move to service | Low |
| `cooldown.ts` | 148 | Module state | Low |
| `i18n.ts` | 235 | Module state | Low |
| `remainingDays.ts` | 132 | Date duplication | Low |
| `httpHeaders.ts` | 67 | Move to repo | Low |

### Files That Are Good

| File | Lines | Status |
|------|-------|--------|
| `logger.ts` | 119 | ✓ Well-structured |
| `percentageFormatter.ts` | 50 | ✓ Single purpose |
| `database.ts` | 135 | ✓ Clear responsibility |
| `report.ts` | 278 | ✓ Reasonable complexity |
| `types.ts` | 226 | ✓ Good type definitions |
| `i18n.ts` (interface) | 228 | ✓ Well-defined |

---

**End of Refactoring Plan**
