# FlowStory — One Prompt Setup

Copy the prompt below and paste it into a **new Claude Code session**. Then provide your description and links. Claude will generate a working HTML file you can open directly in your browser.

---

## The Prompt

```
Read the FlowStory framework guide from this URL:
https://raw.githubusercontent.com/noyitz/flowstory/main/CLAUDE.md

This is a framework for creating animated step-by-step architecture flow diagrams. Your task is to:

1. Read the documentation links I provide below to understand the architecture
2. Generate a SINGLE self-contained HTML file called `flow.html` that:
   - Loads CSS from: https://noyitz.github.io/flowstory/templates/style.css
   - Loads the FlowStory engine from: https://noyitz.github.io/flowstory/src/index.js
   - Embeds the diagram JSON inline (not as a separate file)
   - Auto-plays in loop mode on page load
   - Has all the UI: flow selector, play/pause, speed, loop, reset, theme toggle, steps panel, inspector panel

Use the template structure from: https://raw.githubusercontent.com/noyitz/flowstory/main/examples/ai-gateway/index.html
But instead of loading diagram.json from a file, embed the JSON directly in the script.

Here are the resources to learn from and the flow I want to visualize:

RESOURCES:
[paste your links here]

DESCRIPTION:
[describe the flow you want to visualize]
```

---

## Example Usage

Paste the prompt above into Claude Code, then add:

```
RESOURCES:
- https://github.com/opendatahub-io/architecture-context/blob/main/architecture/rhoai.next/kube-auth-proxy.md
- https://github.com/opendatahub-io/architecture-context/blob/main/architecture/rhoai.next/diagrams/kube-auth-proxy-dataflow.mmd

DESCRIPTION:
Show the RHOAI Dashboard Gateway authentication flow: how a user logs in through OAuth, how the kube-auth-proxy handles session management, and the request flow for accessing dashboard components. Include both the happy path and a session expiry error case.
```

Claude will:
1. Read the docs from the links
2. Understand the architecture
3. Generate `flow.html` with the diagram embedded
4. You open `flow.html` in your browser — done

## Iterating

After the first generation, use the **screenshot feedback loop**:
1. Open `flow.html` in your browser
2. Take a screenshot
3. Paste it into Claude Code
4. Say what to change ("move the auth box down", "add an error flow", etc.)
5. Claude updates the file, refresh browser
