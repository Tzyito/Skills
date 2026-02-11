# 🧠 @tzyito/skills

A collection of AI coding skills that can be quickly installed into your project via `npx`.

Supports **Cursor**, **Claude Code**, and **Codex**.

## Usage

```bash
npx @tzyito/skills
```

The CLI will:

1. Auto-detect your editor (or let you pick)
2. Fetch the latest skills from GitHub
3. Let you select skills with keyboard (↑↓ move, Space toggle, A all, Enter confirm)
4. Install them to the correct directory

### Options

```bash
# List all available skills
npx @tzyito/skills --list

# Install a specific skill directly
npx @tzyito/skills framer-motion-animation

# Specify editor
npx @tzyito/skills --editor cursor
npx @tzyito/skills --editor claude-code
npx @tzyito/skills --editor codex
```

## Supported Editors

| Editor | Config Dir | Install Path |
|--------|-----------|--------------|
| Cursor | `.cursor/` | `.cursor/rules/<skill>/SKILL.md` |
| Claude Code | `.claude/` | `.claude/skills/<skill>/SKILL.md` |
| Codex | `.codex/` | `.codex/skills/<skill>/SKILL.md` |

## Available Skills

| Skill | Description |
|-------|-------------|
| [framer-motion-animation](./framer-motion-animation/SKILL.md) | Apple/Shopify-grade Framer Motion animation guidelines |

## Contributing a Skill

Create a new directory with a `SKILL.md` file:

```
your-skill-name/
└── SKILL.md
```

The `SKILL.md` should include YAML frontmatter:

```yaml
---
name: your-skill-name
description: A brief description of what this skill does.
---
```

Push to `main` — the CLI fetches skills dynamically from GitHub, **no republish needed**.

## License

[MIT](./LICENSE)
