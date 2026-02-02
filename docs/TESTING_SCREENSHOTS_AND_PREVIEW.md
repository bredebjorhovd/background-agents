# Testing Screenshots and Live Preview

This guide walks through testing the screenshot, live preview, and artifacts features added to
Open-Inspect.

## How preview and VS Code get to your browser (tunneling)

Ports like **5173** (preview) and **8080** (VS Code) are **not** open on your machine. They run
**inside the Modal sandbox**. When the sandbox is created, Modal creates **reverse tunnels**: each
port in `encrypted_ports` gets a **unique public HTTPS URL** (e.g. `https://xxx-5173.w.modal.host`
and `https://xxx-8080.w.modal.host`). When you open that URL in your browser, Modal’s edge forwards
the request into the sandbox’s `localhost:PORT`. So your browser talks to Modal over HTTPS; Modal
talks to the sandbox over an internal tunnel. The control plane stores these URLs in the preview
artifact’s `metadata.tunnelUrls` (by port) so the web app and tools can use them.

## What to expect

| Feature                | Where it appears                                        | How it’s created                                                                              |
| ---------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Live preview**       | Action bar (“View preview”), sidebar (“Live preview”)   | Automatically when the sandbox spawns (Modal tunnel on port 5173).                            |
| **Screenshots**        | Sidebar (thumbnails in metadata), Artifacts section     | Agent uses the `take-screenshot` tool.                                                        |
| **Artifacts list**     | Right sidebar → “Artifacts” (PRs, screenshots, preview) | PR from create-pull-request; screenshots from take-screenshot; preview from sandbox creation. |
| **Start-preview tool** | Agent response                                          | Agent uses `start-preview` to get the preview URL and tell you.                               |

---

## 1. Quick smoke test (screenshot only)

No dev server needed; uses a public URL.

1. **Create a session** in the web app (pick any repo you have access to).
2. **Wait** until the sandbox is ready (session shows “connected” or similar).
3. **Send a prompt**, e.g.:
   - _“Take a screenshot of https://example.com”_
   - _“Use the take-screenshot tool to capture https://example.com and tell me when it’s done.”_
4. **Check the UI:**
   - **Right sidebar** → “Screenshots” area: thumbnail(s) for the session.
   - **Right sidebar** → “Artifacts”: an entry of type “screenshot” with a link to the full image.
   - Click the thumbnail or artifact link to open the full screenshot.

---

## 2. Live preview (tunnel + “View preview”)

The preview URL is created when the sandbox starts. To actually see your app on it, something must
serve on **port 5173** inside the sandbox (e.g. Vite).

1. **Create a session** for a repo that has a frontend dev server (e.g. Vite on 5173, or
   configurable port).
2. **Wait** for the sandbox to be ready.
3. **Check the UI:**
   - **Action bar** (top): “View preview” button.
   - **Right sidebar**: “Live preview” link in the metadata section.
   - **Right sidebar** → “Artifacts”: one artifact of type “preview” with the tunnel URL.
4. **Prompt the agent** to start the app and then open the link, e.g.:
   - _“Start the dev server (e.g. pnpm dev or npm run dev) so it listens on port 5173. Tell me when
     it’s up.”_
5. When the agent says it’s up, **click “View preview”** (or “Live preview” in the sidebar). You
   should see your app in a new tab.  
   If the tunnel isn’t ready yet or the server isn’t on 5173, you’ll get a connection error; retry
   after the agent confirms the server is running on 5173.

---

## 3. Get the preview URL from the agent (start-preview)

1. In an active session, ask, e.g.:
   - _“What’s the live preview URL for this session?”_
   - _“How do I view the running app?”_
2. The agent should use the **start-preview** tool and reply with the URL (and remind you to start
   the dev server on 5173 if needed).
3. That URL is the same one used by “View preview” / “Live preview” in the UI.

---

## 4. Full flow: dev server + screenshot + preview

End-to-end check that the agent can start the app, capture it, and you can use the preview link.

1. **Create a session** for a repo with a simple frontend (e.g. Vite/React on port 5173).
2. **Wait** for the sandbox to be ready; confirm “View preview” / “Live preview” appear.
3. **Send a single prompt**, e.g.:
   - _“Start the dev server on port 5173, take a screenshot of http://localhost:5173, and tell me
     the live preview URL so I can open it.”_
4. **Verify:**
   - **Screenshots** in the sidebar: at least one thumbnail from the dev server.
   - **Artifacts**: “screenshot” and “preview” entries.
   - **Action bar**: “View preview” opens the tunnel; after the agent has started the server, the
     page should load your app.
   - Agent’s message includes the preview URL (from start-preview).

---

## 5. Optional: take-screenshot options

You can ask the agent to use different options (they’re passed through to the tool):

- **Full page:**  
  _“Take a full-page screenshot of https://example.com”_
- **Viewport size:**  
  _“Take a screenshot of https://example.com with viewport 1920x1080.”_

Check the sidebar/artifacts again to see the new screenshot.

---

## Troubleshooting

| Issue                                 | What to check                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No “View preview” / “Live preview”    | Sandbox may not have a tunnel yet (retry after sandbox is “connected”), or preview_tunnel_url was not stored (check control plane / Modal).                                                                                                                                                              |
| “View preview” fails to load          | Dev server in the sandbox must be listening on **port 5173**. Ask the agent to start it and confirm the port.                                                                                                                                                                                            |
| No screenshot thumbnail / artifact    | Agent must call the take-screenshot tool (prompt it explicitly). Ensure R2 and artifact upload are configured (Terraform + control plane).                                                                                                                                                               |
| Session ID / auth errors in tools     | Sandbox env: `SESSION_CONFIG`, `SANDBOX_AUTH_TOKEN`, `CONTROL_PLANE_URL` must be set by the control plane when the sandbox connects.                                                                                                                                                                     |
| **VS Code "didn't send any data"**    | Wait 10–15 seconds after the agent says VS Code is ready, then refresh the VS Code tab. If it persists, ask the agent to run the start-vscode tool again.                                                                                                                                                |
| **VS Code doesn't show the app code** | VS Code (code-server) opens the **same repo** as Preview: `/workspace/<repo_name>` inside the sandbox. If you see an empty or wrong folder, the agent may have started code-server before the repo was cloned; ask the agent to run "Launch code-server" (start-vscode) again so it opens the repo root. |
| **Preview not working**               | The preview uses your **dev server** (e.g. http://localhost:5173). Ask the agent to start the dev server and use the start-preview tool so the Preview tab shows your app.                                                                                                                               |
| **Select element (in-app)**           | Open the **Preview** tab → click **Select** in the toolbar → click any element in the preview. The selected component is shown above the chat and included in your next message.                                                                                                                         |
| **WebSocket HTTP 410**                | The control plane returns 410 only when the sandbox was **intentionally stopped** (e.g. inactivity timeout). Unexpected disconnects allow the sandbox to reconnect.                                                                                                                                      |

---

## Summary checklist

- [ ] **Screenshot (public URL):** Prompt “Take a screenshot of https://example.com” → thumbnail +
      artifact in sidebar.
- [ ] **Preview artifact:** After sandbox ready → “View preview” in action bar, “Live preview” in
      sidebar, “preview” in Artifacts.
- [ ] **Start-preview:** Ask “What’s the live preview URL?” → agent returns URL from start-preview.
- [ ] **Live app in browser:** Agent starts dev server on 5173 → you click “View preview” → app
      loads.
- [ ] **Full flow:** One prompt: start server + screenshot + give preview URL → screenshot visible,
      “View preview” works.
