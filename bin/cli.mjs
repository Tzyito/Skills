#!/usr/bin/env node

/**
 * @tzyito/skills CLI
 *
 * Dynamically fetches available skills from GitHub and installs them
 * into your project's .cursor/rules/ directory.
 *
 * Usage:
 *   npx @tzyito/skills            # Interactive mode — pick skills to install
 *   npx @tzyito/skills --list      # List all available skills
 *   npx @tzyito/skills <name>      # Install a specific skill directly
 */

import { createInterface } from "node:readline";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

// ─── Config ──────────────────────────────────────────────────────────────────

const GITHUB_OWNER = "Tzyito";
const GITHUB_REPO = "Skills";
const GITHUB_BRANCH = "main";
const API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}`;
const RULES_DIR = ".cursor/rules";

// ─── Colors (no dependencies) ────────────────────────────────────────────────

const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    magenta: "\x1b[35m",
};

const log = {
    info: (msg) => console.log(`${c.cyan}ℹ${c.reset} ${msg}`),
    success: (msg) => console.log(`${c.green}✔${c.reset} ${msg}`),
    warn: (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`),
    error: (msg) => console.error(`${c.red}✖${c.reset} ${msg}`),
    title: (msg) =>
        console.log(`\n${c.bold}${c.magenta}  🧠 ${msg}${c.reset}\n`),
};

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
 * This way, adding a new directory to the repo automatically makes it available
 * — no need to republish the npm package.
 */
async function getAvailableSkills() {
    // Get repo root contents
    const contents = await fetchJSON(
        `${API_BASE}/contents?ref=${GITHUB_BRANCH}`
    );

    // Filter directories (skip hidden dirs, bin, node_modules, etc.)
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

    // Check which directories contain SKILL.md
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
                    // Try to extract description from SKILL.md frontmatter
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
    // Extract description from YAML frontmatter
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (match) {
        const frontmatter = match[1];
        const descMatch = frontmatter.match(/description:\s*(.+)/);
        if (descMatch) return descMatch[1].trim();
    }
    // Fallback: first heading content
    const headingMatch = content.match(/^#\s+(.+)/m);
    if (headingMatch) return headingMatch[1].trim();
    return "No description";
}

// ─── Interactive Prompt (zero dependencies) ──────────────────────────────────

function createPrompt() {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return {
        ask(question) {
            return new Promise((resolve) => {
                rl.question(question, (answer) => resolve(answer.trim()));
            });
        },
        close() {
            rl.close();
        },
    };
}

async function selectSkills(skills) {
    const prompt = createPrompt();

    console.log(`${c.dim}  Available skills:${c.reset}\n`);
    skills.forEach((skill, i) => {
        const num = `${c.cyan}${String(i + 1).padStart(2)}${c.reset}`;
        const name = `${c.bold}${skill.name}${c.reset}`;
        const desc = `${c.dim}${skill.description.slice(0, 70)}${skill.description.length > 70 ? "…" : ""}${c.reset}`;
        console.log(`  ${num}  ${name}`);
        console.log(`      ${desc}`);
    });

    console.log();
    const answer = await prompt.ask(
        `${c.cyan}?${c.reset} Enter skill numbers to install ${c.dim}(comma-separated, or "a" for all)${c.reset}: `
    );
    prompt.close();

    if (answer.toLowerCase() === "a" || answer.toLowerCase() === "all") {
        return skills;
    }

    const indices = answer
        .split(/[,\s]+/)
        .map((s) => parseInt(s, 10) - 1)
        .filter((i) => i >= 0 && i < skills.length);

    if (indices.length === 0) {
        log.warn("No valid selection. Exiting.");
        process.exit(0);
    }

    return indices.map((i) => skills[i]);
}

// ─── Install ─────────────────────────────────────────────────────────────────

async function installSkill(skill, targetDir) {
    const targetPath = join(targetDir, `${skill.name}.md`);

    // Check if already exists
    if (existsSync(targetPath)) {
        const existing = await readFile(targetPath, "utf-8");
        if (existing === skill.raw) {
            log.info(`${c.dim}${skill.name}${c.reset} — already up to date, skipped`);
            return;
        }
        log.warn(`${skill.name} — updating existing file`);
    }

    await writeFile(targetPath, skill.raw, "utf-8");
    log.success(
        `${c.bold}${skill.name}${c.reset} → ${c.dim}${targetPath}${c.reset}`
    );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);

    log.title("@tzyito/skills");

    // Fetch available skills dynamically from GitHub
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
    const skillName = args.find((a) => !a.startsWith("-"));
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
        // ── Interactive mode ──
        selectedSkills = await selectSkills(skills);
    }

    // ── Install selected skills ──
    const targetDir = resolve(process.cwd(), RULES_DIR);
    await mkdir(targetDir, { recursive: true });

    log.info(`Installing to ${c.dim}${targetDir}${c.reset}\n`);

    for (const skill of selectedSkills) {
        await installSkill(skill, targetDir);
    }

    console.log(
        `\n${c.green}${c.bold}  Done!${c.reset} ${c.dim}Skills installed to ${RULES_DIR}/${c.reset}\n`
    );
}

main().catch((err) => {
    log.error(err.message);
    process.exit(1);
});
