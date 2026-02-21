---
name: telegram-search
description: Search and consolidate information from residential complex Telegram chats
context: fork
allowed-tools:
  - mcp__mcp-telegram__search_messages
  - mcp__mcp-telegram__get_messages
  - mcp__mcp-telegram__search_dialogs
  - Bash
---

# Telegram Search — Residential Complex Chats

Searches and consolidates information from the residential complex (ЖК) Telegram chats.

## Usage

```
/telegram-search <keywords> [--in <scope>] [--limit <N>]
```

**Examples**:
- `/telegram-search показатели водоканал тнс` — search all chats, default limit
- `/telegram-search собрание --in main` — only main chat
- `/telegram-search ремонт --in buildings` — only building chats
- `/telegram-search парковка --in parking` — only parking chat
- `/telegram-search оплата --in main,parking --limit 5` — two scopes, 5 results max
- `/telegram-search авария --limit 3` — all chats, max 3 results per chat

## Parameters

### `--in <scope>` — which chats to search

| Value | Chats included |
|-------|---------------|
| `all` | All 9 chats (default) |
| `main` | Общий чат only |
| `buildings` | All 7 building chats |
| `parking` | Parking chat only |
| `main,buildings` | Main + buildings (no parking) |
| `main,parking` | Main + parking (no buildings) |
| Building number e.g. `--in 3` | Specific building chat (see mapping below) |

### `--limit <N>` — max messages per chat

Default: **10**. Use lower values (3–5) for quick checks, higher (20–50) for deep research.

## Chat Scope (FIXED — do not expand without user approval)

### Main Chat
| Chat ID | Alias | Description |
|---------|-------|-------------|
| -1001404829694 | `main` | Общий чат ЖК |

### Building Chats (`buildings`)
| Chat ID | Building # | Alias |
|---------|------------|-------|
| -1001570633098 | 1 | `b1` |
| -1001565128536 | 2 | `b2` |
| -1001531398117 | 3 | `b3` |
| -1001526803382 | 4 | `b4` |
| -1001504259056 | 5 | `b5` |
| -1001324950308 | 6 | `b6` |
| -1001288264361 | 7 | `b7` |

### Parking Chat
| Chat ID | Alias |
|---------|-------|
| -1002095193240 | `parking` |

**Total: 9 chats** (1 main + 7 buildings + 1 parking)

## Workflow

### Step 1: Parse Request

Extract from the user message:
- **Keywords** — words to search for
- **`--in` scope** — if not specified, use `all`
- **`--limit`** — if not specified, use `10`

If no explicit parameters provided — infer scope from keywords:
- "парковка", "машиноместо" → auto-add `parking` to scope
- General topics → `all`

### Step 2: Search Each Chat in Scope

For each chat, call `get_messages` or `search_messages` with each keyword.
Apply `--limit` per chat per keyword.

Search order: main → buildings (b1→b7) → parking.

### Step 3: Consolidate Results

Group by **topic**, not by chat. Deduplicate.

### Step 4: Present Summary

Lead with most actionable info (dates, deadlines, amounts).
Show source chat + date for each key fact.
Flag contradictions between chats.

## Output Format

```markdown
## Результаты поиска: "<keywords>" [скоуп: X чатов, лимит: N]

### Ключевая информация
<most important finding>

### Сроки / Даты
<dates and deadlines>

### Детали по чатам
<only if chats differ>

### Источники
- Чат: [name] — [date] — "[excerpt]"
```

## Error Handling

- MCP not connected → ask user to restart Claude Code
- Chat returns no results → "нет сообщений по теме", continue
- Search fails for a chat → note error, continue with others
