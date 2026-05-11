# FlowStory — Quick Start Guide

Generate animated architecture flow diagrams using AI tools. No install needed — just a prompt.

## Step 1: Open Claude Code

Use the CLI (`claude`), desktop app, IDE extension, or [claude.ai/code](https://claude.ai/code).

Start a **new session**.

## Step 2: Paste This Prompt

```
Read this guide: https://raw.githubusercontent.com/noyitz/flowstory/main/CLAUDE.md

Then read this template: https://raw.githubusercontent.com/noyitz/flowstory/main/examples/ai-gateway/index.html

Generate a SINGLE self-contained HTML file at ./flow.html that:
- Loads CSS from: https://noyitz.github.io/flowstory/templates/style.css
- Loads FlowStory from: https://noyitz.github.io/flowstory/src/index.js
- Embeds the diagram JSON inline in the script (NOT as a separate file)
- Auto-plays in loop mode on page load
- Uses viz.load(diagram) to load the inline JSON object

Here are the resources to learn the architecture from:

RESOURCES:
- <PASTE YOUR LINKS HERE — repos, docs, mermaid diagrams, ADRs, etc.>

DESCRIPTION:
<DESCRIBE THE FLOW YOU WANT — what components, what scenarios (happy path, error cases, etc.)>

After generating, open the file in a browser to test it.
```

## Step 3: Fill in Your Details

Replace the placeholders with your actual links and description. For example:

```
RESOURCES:
- https://github.com/my-org/my-project/blob/main/docs/architecture.md
- https://github.com/my-org/my-project/blob/main/docs/diagrams/auth-flow.mmd

DESCRIPTION:
Show the user authentication flow: browser → API Gateway → OAuth provider → 
token exchange → session created → redirect to dashboard. 
Include an error case for expired tokens (401 → redirect to login).
```

## Step 4: Iterate with Screenshots

After the first generation:

1. Open `flow.html` in your browser
2. Take a screenshot
3. Paste it back into Claude Code
4. Describe what to change: *"move the database box down"*, *"arrow 3 overlaps arrow 5, shift right"*, *"add a rate-limit error flow"*
5. Claude updates the file — refresh and repeat

Usually 3-5 iterations gets you a polished diagram.

## Step 5: Share

The generated `flow.html` is fully self-contained. You can:

- **Email it** — anyone can open it in a browser
- **Host on GitHub Pages** — push to a repo, enable Pages
- **Drop in a docs folder** — works as a static file anywhere

## Tips

- **Be specific**: Name the components, protocols, ports, and error cases. The more detail you give, the better the diagram.
- **Multiple flows**: You can ask for several scenarios (happy path, error, auth failure) — they appear in a dropdown selector.
- **The screenshot loop is the key technique**: Don't try to get it perfect on the first try. Generate, screenshot, adjust, repeat.

## Example Output

See a live example: [AI Inference Gateway Flow Visualizer](https://noyitz.github.io/ai-gateway-docs/ai-gateway-flow.html)

## Links

- **Framework repo**: https://github.com/noyitz/flowstory
- **Full schema docs**: https://github.com/noyitz/flowstory/blob/main/CLAUDE.md
- **Agent prompt (for non-Claude tools)**: https://github.com/noyitz/flowstory/blob/main/docs/agent-prompt.md
