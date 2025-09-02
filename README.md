# 🧠 Command Hub

**Command Hub** is a personal automation toolkit designed to centralize repeatable tasks — like downloading reports, transforming data, triggering alerts, and talking to external systems — into a single, organized space.

It’s built to work seamlessly with **Claude Code**, exposing each script as an **MCP tool** so that natural-language commands can trigger meaningful, repeatable automation.

---

## 🚀 Purpose

The vision of this project is to create a lightweight, modular "command center" for developer-quality personal automation. That means:

- ✅ Clear interfaces for tools
- ✅ Clean CLI scripts you can test directly
- ✅ Secure handling of secrets (`.env`)
- ✅ Claude Code awareness via `.mcp.yaml` descriptors
- ✅ Expandable system: more tools, more power

---

## 🎯 Current Goal (Milestone 1)

We are currently **proving out our first automation tool**, which:

1. Dynamically builds a [Jira](https://asaptire.atlassian.net) JQL query using user-provided arguments (project, status, date range)
2. Authenticates securely via `.env`
3. Calls the Jira API to fetch issues from the query
4. Saves the results as JSON locally

This tool can be run directly from the CLI **or** invoked via Claude Code using an MCP tool interface.

---

## 📁 Project Structure

command-hub/
├── .env # 🔐 Secure credentials (never committed)
├── .gitignore # 👻 Ignores sensitive and generated files
├── README.md # 📖 You’re here
├── download-report.mcp.yaml # 🧰 MCP descriptor for Claude Code
├── tools/
│ └── run-jira-query.js # 🧠 Main CLI logic (Jira query + download)
├── jira-results.json # 📝 Last saved Jira response (output)
├── node_modules/ # 📦 Installed dependencies
├── package.json # 📦 NPM project metadata
└── package-lock.json # 🔒 NPM lockfile

---

## 🛠 Tool 1: `run_jira_query`

Fetches issues from Jira using a dynamic JQL query.

### Run it manually:

```bash
node tools/run-jira-query.js <PROJECT> <STATUS> <START_DATE> <END_DATE>
# Example:
node tools/run-jira-query.js FRON Done 2025-07-01 2025-07-31

Output:

Creates a file called jira-results.json containing up to 1000 issues matching the query.

⸻

🧰 Tool Config for Claude Code

This repo includes a .mcp.yaml descriptor (download-report.mcp.yaml) so Claude Code can load and use this tool dynamically by name — no manual commands required once integrated.

Claude Code will be able to say:

“Get me the FRON project’s done issues for July 2025”

…and the tool will construct the correct JQL, run the query, and return the result.

⸻

🔐 Secrets Setup
	1.	Create a .env file in the root:

JIRA_EMAIL=you@asaptire.atlassian.net
JIRA_TOKEN=your_api_token_here


	2.	Keep this file secret! .gitignore already prevents it from being tracked.
	3.	Tokens can be created from: id.atlassian.com/manage/api-tokens

⸻

📅 What’s Coming Next
	•	JSON → CSV conversion pipeline
	•	Claude-aware transformation logic
	•	Slack/Email output delivery option
	•	Tool registry or command palette
	•	GitHub integration for automation chaining
	•	A simple dashboard or terminal UI for human triggering

⸻

💬 Philosophy

Build small.
Build reusable.
Let AI and CLI work together.
Never drag a file if a tool can pull it.
Let humans talk to systems in their own language — and let systems do the hard part.

⸻

🧑‍💻 Author

Built by Joshua Mullet — for his future self and anyone else who’s tired of repetitive tasks.
```
