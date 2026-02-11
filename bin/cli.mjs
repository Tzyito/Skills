#!/usr/bin/env node

/**
 * @tzyito/skills CLI
 *
 * Dynamically fetches available skills from GitHub and installs them
 * into your editor's skill/rules directory.
 *
 * Usage:
 *   npx @tzyito/skills            # Interactive mode — pick editor & skills
 *   npx @tzyito/skills --list      # List all available skills
 *   npx @tzyito/skills <name>      # Install a specific skill directly
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

// ─── Config ──────────────────────────────────────────────────────────────────

const GITHUB_OWNER = "Tzyito";
const GITHUB_REPO = "Skills";
const GITHUB_BRANCH = "main";
const API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}`;

// ─── Editor Definitions ──────────────────────────────────────────────────────

const EDITORS = [
    {
        id: "cursor",
        name: "Cursor",
        icon: "📝",
        configDir: ".cursor",
        skillDir: ".cursor/rules",
        detect: () => existsSync(resolve(process.cwd(), ".cursor")),
    },
    {
        id: "claude-code",
        name: "Claude Code",
        icon: "🤖",
        configDir: ".claude",
        skillDir: ".claude/skills",
        detect: () => existsSync(resolve(process.cwd(), ".claude")),
    },
    {
        id: "codex",
        name: "Codex (OpenAI)",
        icon: "🧬",
        configDir: ".codex",
        skillDir: ".codex/skills",
        detect: () => existsSync(resolve(process.cwd(), ".codex")),
    },
];

// ─── ANSI Helpers ────────────────────────────────────────────────────────────

const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    inverse: "\x1b[7m",
    green: "\x1b[32m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    magenta: "\x1b[35m",
    white: "\x1b[37m",
    hide: "\x1b[?25l",
    show: "\x1b[?25h",
    clearLine: "\x1b[2K",
    up: (n = 1) => `\x1b[${n}A`,
};

const log = {
    info: (msg) => console.log(`${c.cyan}ℹ${c.reset} ${msg}`),
    success: (msg) => console.log(`${c.green}✔${c.reset} ${msg}`),
    warn: (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`),
    error: (msg) => console.error(`${c.red}✖${c.reset} ${msg}`),
    title: (msg) =>
        console.log(`\n${c.bold}${c.magenta}  🧠 ${msg}${c.reset}\n`),
};

// ─── Interactive Select (zero dependencies, raw mode) ────────────────────────

/**
 * Single-select: ↑↓ to move, Enter to confirm
 */
function singleSelect(title, items) {
    return new Promise((res) => {
        let cursor = 0;
        const { stdin, stdout } = process;

        const render = () => {
            // Move up to redraw (skip on first render)
            if (render._drawn) {
                stdout.write(c.up(items.length + 2));
            }
            render._drawn = true;

            stdout.write(`${c.clearLine}${c.cyan}?${c.reset} ${c.bold}${title}${c.reset} ${c.dim}(↑↓ move, Enter confirm)${c.reset}\n`);

            items.forEach((item, i) => {
                const active = i === cursor;
                const pointer = active ? `${c.cyan}❯${c.reset}` : " ";
                const label = active
                    ? `${c.cyan}${c.bold}${item.label}${c.reset}`
                    : `${item.label}`;
                const hint = item.hint ? `  ${c.dim}${item.hint}${c.reset}` : "";
                stdout.write(`${c.clearLine}  ${pointer} ${label}${hint}\n`);
            });

            stdout.write(`${c.clearLine}\n`);
        };

        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding("utf-8");
        stdout.write(c.hide);
        render();

        const onKey = (key) => {
            // Ctrl+C
            if (key === "\x03") {
                cleanup();
                process.exit(0);
            }
            // Up arrow or k
            if (key === "\x1b[A" || key === "k") {
                cursor = (cursor - 1 + items.length) % items.length;
                render();
            }
            // Down arrow or j
            if (key === "\x1b[B" || key === "j") {
                cursor = (cursor + 1) % items.length;
                render();
            }
            // Enter
            if (key === "\r" || key === "\n") {
                cleanup();
                // Redraw final state
                stdout.write(c.up(items.length + 2));
                stdout.write(
                    `${c.clearLine}${c.green}✔${c.reset} ${c.bold}${title}${c.reset} ${c.cyan}${items[cursor].label}${c.reset}\n`
                );
                // Clear remaining lines
                for (let i = 0; i < items.length + 1; i++) {
                    stdout.write(`${c.clearLine}\n`);
                }
                stdout.write(c.up(items.length + 1));
                res(items[cursor].value);
            }
        };

        const cleanup = () => {
            stdin.removeListener("data", onKey);
            stdin.setRawMode(false);
            stdin.pause();
            stdout.write(c.show);
        };

        stdin.on("data", onKey);
    });
}

/**
 * Multi-select: ↑↓ to move, Space to toggle, A to select/deselect all, Enter to confirm
 */
function multiSelect(title, items) {
    return new Promise((res) => {
        let cursor = 0;
        const selected = new Set();
        const { stdin, stdout } = process;

        const render = () => {
            if (render._drawn) {
                stdout.write(c.up(items.length + 2));
            }
            render._drawn = true;

            const count = selected.size;
            const countText =
                count > 0
                    ? ` ${c.dim}(${c.green}${count}${c.dim} selected)${c.reset}`
                    : "";
            stdout.write(
                `${c.clearLine}${c.cyan}?${c.reset} ${c.bold}${title}${c.reset}${countText} ${c.dim}(↑↓ move, Space toggle, A all, Enter confirm)${c.reset}\n`
            );

            items.forEach((item, i) => {
                const active = i === cursor;
                const checked = selected.has(i);
                const pointer = active ? `${c.cyan}❯${c.reset}` : " ";
                const box = checked
                    ? `${c.green}◉${c.reset}`
                    : `${c.dim}◯${c.reset}`;
                const label = active
                    ? `${c.bold}${item.label}${c.reset}`
                    : item.label;
                const desc = item.desc
                    ? `\n     ${c.dim}${item.desc}${c.reset}`
                    : "";
                stdout.write(`${c.clearLine}  ${pointer} ${box} ${label}${desc}\n`);
            });

            stdout.write(`${c.clearLine}\n`);
        };

        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding("utf-8");
        stdout.write(c.hide);
        render();

        const onKey = (key) => {
            // Ctrl+C
            if (key === "\x03") {
                cleanup();
                process.exit(0);
            }
            // Up
            if (key === "\x1b[A" || key === "k") {
                cursor = (cursor - 1 + items.length) % items.length;
                render();
                return;
            }
            // Down
            if (key === "\x1b[B" || key === "j") {
                cursor = (cursor + 1) % items.length;
                render();
                return;
            }
            // Space — toggle
            if (key === " ") {
                if (selected.has(cursor)) {
                    selected.delete(cursor);
                } else {
                    selected.add(cursor);
                }
                render();
                return;
            }
            // A / a — toggle all
            if (key === "a" || key === "A") {
                if (selected.size === items.length) {
                    selected.clear();
                } else {
                    items.forEach((_, i) => selected.add(i));
                }
                render();
                return;
            }
            // Enter
            if (key === "\r" || key === "\n") {
                cleanup();
                const names = [...selected]
                    .sort()
                    .map((i) => items[i].label)
                    .join(", ");
                // Redraw final state
                stdout.write(c.up(items.length + 2));
                stdout.write(
                    `${c.clearLine}${c.green}✔${c.reset} ${c.bold}${title}${c.reset} ${c.cyan}${names || "none"}${c.reset}\n`
                );
                for (let i = 0; i < items.length + 1; i++) {
                    stdout.write(`${c.clearLine}\n`);
                }
                stdout.write(c.up(items.length + 1));
                res([...selected].sort().map((i) => items[i].value));
            }
        };

        const cleanup = () => {
            stdin.removeListener("data", onKey);
            stdin.setRawMode(false);
            stdin.pause();
            stdout.write(c.show);
        };

        stdin.on("data", onKey);
    });
}

// ─── GitHub API ──────────────────────────────────────────────────────────────

async function fetchJSON(url) {
    const res = await fetch(url, {
        headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "@tzyito/skills-cli",
        },
    });
    if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

async function fetchText(url) {
    const res = await fetch(url, {
        headers: { "User-Agent": "@tzyito/skills-cli" },
    });
    if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
    }
    return res.text();
}

/**
 * Dynamically discover available skills from the GitHub repository.
 * Each skill is a directory containing a SKILL.md file.
 * Adding a new directory to the repo automatically makes it available
 * — no need to republish the npm package.
 */
async function getAvailableSkills() {
    const contents = await fetchJSON(
        `${API_BASE}/contents?ref=${GITHUB_BRANCH}`
    );

    const skipDirs = new Set([
        ".git",
        ".github",
        "bin",
        "node_modules",
        ".vscode",
        ".cursor",
    ]);
    const dirs = contents.filter(
        (item) => item.type === "dir" && !skipDirs.has(item.name)
    );

    const skills = [];
    await Promise.all(
        dirs.map(async (dir) => {
            try {
                const dirContents = await fetchJSON(
                    `${API_BASE}/contents/${dir.name}?ref=${GITHUB_BRANCH}`
                );
                const hasSkillMd = dirContents.some(
                    (f) => f.name === "SKILL.md" && f.type === "file"
                );
                if (hasSkillMd) {
                    const raw = await fetchText(
                        `${RAW_BASE}/${dir.name}/SKILL.md`
                    );
                    const desc = extractDescription(raw);
                    skills.push({
                        name: dir.name,
                        description: desc,
                        url: `${RAW_BASE}/${dir.name}/SKILL.md`,
                        raw,
                    });
                }
            } catch {
                // skip dirs that can't be read
            }
        })
    );

    return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function extractDescription(content) {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (match) {
        const frontmatter = match[1];
        const descMatch = frontmatter.match(/description:\s*(.+)/);
        if (descMatch) return descMatch[1].trim();
    }
    const headingMatch = content.match(/^#\s+(.+)/m);
    if (headingMatch) return headingMatch[1].trim();
    return "No description";
}

// ─── Editor Selection ────────────────────────────────────────────────────────

async function selectEditor(editorFlag) {
    // If --editor flag is passed, use it directly
    if (editorFlag) {
        const found = EDITORS.find(
            (e) => e.id === editorFlag.toLowerCase()
        );
        if (found) return found;
        log.error(
            `Unknown editor "${editorFlag}". Available: ${EDITORS.map((e) => e.id).join(", ")}`
        );
        process.exit(1);
    }

    // Auto-detect editors present in the project
    const detected = EDITORS.filter((e) => e.detect());

    // If exactly one editor detected, use it directly
    if (detected.length === 1) {
        log.info(
            `Detected ${c.bold}${detected[0].icon} ${detected[0].name}${c.reset} ${c.dim}(found ${detected[0].configDir}/)${c.reset}`
        );
        return detected[0];
    }

    // Build items for selection
    const items = EDITORS.map((editor) => {
        const isDetected = editor.detect();
        const status = isDetected
            ? `${c.green}● detected${c.reset}`
            : `${c.dim}○${c.reset}`;
        return {
            label: `${editor.icon} ${editor.name}`,
            hint: `${status}  ${c.dim}→ ${editor.skillDir}/${c.reset}`,
            value: editor,
        };
    });

    // Pre-select detected editor if any
    if (detected.length > 1) {
        log.info(
            `Detected multiple editors: ${detected.map((e) => `${e.icon} ${e.name}`).join(", ")}`
        );
    }

    const editor = await singleSelect("Select your editor", items);
    return editor;
}

// ─── Skill Selection ─────────────────────────────────────────────────────────

async function selectSkillsInteractive(skills) {
    const items = skills.map((skill) => ({
        label: skill.name,
        desc:
            skill.description.length > 80
                ? skill.description.slice(0, 80) + "…"
                : skill.description,
        value: skill,
    }));

    const selected = await multiSelect("Select skills to install", items);

    if (selected.length === 0) {
        log.warn("No skills selected. Exiting.");
        process.exit(0);
    }

    return selected;
}

// ─── Install ─────────────────────────────────────────────────────────────────

async function installSkill(skill, targetDir) {
    // Preserve original directory structure: <skillDir>/<name>/SKILL.md
    const skillFolder = join(targetDir, skill.name);
    const targetPath = join(skillFolder, "SKILL.md");

    await mkdir(skillFolder, { recursive: true });

    if (existsSync(targetPath)) {
        const existing = await readFile(targetPath, "utf-8");
        if (existing === skill.raw) {
            log.info(
                `${c.dim}${skill.name}${c.reset} — already up to date, skipped`
            );
            return;
        }
        log.warn(`${skill.name} — updating existing file`);
    }

    await writeFile(targetPath, skill.raw, "utf-8");
    log.success(
        `${c.bold}${skill.name}${c.reset} → ${c.dim}${skill.name}/SKILL.md${c.reset}`
    );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);

    log.title("@tzyito/skills");

    // ── Parse --editor flag ──
    const editorFlagIdx = args.findIndex(
        (a) => a === "--editor" || a === "-e"
    );
    const editorFlag =
        editorFlagIdx !== -1 ? args[editorFlagIdx + 1] : undefined;

    // ── Select editor ──
    const editor = await selectEditor(editorFlag);
    const skillDir = editor.skillDir;

    log.success(
        `Using ${c.bold}${editor.icon} ${editor.name}${c.reset} → ${c.dim}${skillDir}/${c.reset}`
    );

    // Check if editor config dir exists
    const configPath = resolve(process.cwd(), editor.configDir);
    if (!existsSync(configPath)) {
        log.warn(
            `${c.bold}${editor.configDir}/${c.reset} not found — will be created`
        );
    }

    // ── Fetch available skills from GitHub ──
    console.log();
    log.info("Fetching available skills from GitHub...");
    let skills;
    try {
        skills = await getAvailableSkills();
    } catch (err) {
        log.error(`Failed to fetch skills: ${err.message}`);
        log.info(
            "Make sure you have internet access and the repo is public."
        );
        process.exit(1);
    }

    if (skills.length === 0) {
        log.warn("No skills found in the repository.");
        process.exit(0);
    }

    log.info(`Found ${c.bold}${skills.length}${c.reset} skill(s)\n`);

    // ── Handle --list flag ──
    if (args.includes("--list") || args.includes("-l")) {
        skills.forEach((s) => {
            console.log(`  ${c.bold}${s.name}${c.reset}`);
            console.log(`  ${c.dim}${s.description}${c.reset}\n`);
        });
        return;
    }

    // ── Handle direct skill name argument ──
    const skipFlags = new Set([
        "--list",
        "-l",
        "--editor",
        "-e",
        editorFlag,
    ]);
    const skillName = args.find(
        (a) => !a.startsWith("-") && !skipFlags.has(a)
    );
    let selectedSkills;

    if (skillName) {
        const found = skills.filter((s) =>
            s.name.toLowerCase().includes(skillName.toLowerCase())
        );
        if (found.length === 0) {
            log.error(`No skill matching "${skillName}" found.`);
            log.info(
                `Available: ${skills.map((s) => s.name).join(", ")}`
            );
            process.exit(1);
        }
        selectedSkills = found;
    } else {
        // ── Interactive multi-select ──
        selectedSkills = await selectSkillsInteractive(skills);
    }

    // ── Install selected skills ──
    const targetDir = resolve(process.cwd(), skillDir);
    await mkdir(targetDir, { recursive: true });

    console.log();
    log.info(`Installing to ${c.dim}${targetDir}${c.reset}\n`);

    for (const skill of selectedSkills) {
        await installSkill(skill, targetDir);
    }

    console.log(
        `\n${c.green}${c.bold}  Done!${c.reset} ${c.dim}Skills installed to ${skillDir}/${c.reset}\n`
    );
}

main().catch((err) => {
    log.error(err.message);
    process.exit(1);
});
