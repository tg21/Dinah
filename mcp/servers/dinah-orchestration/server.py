"""Dinah's least-privilege coordination MCP.

The backend supplies DND_BACKEND_URL, DND_AGENT_ID, DND_PROJECT_ID and a
short-lived DND_MCP_TOKEN for each harness invocation. No service URL is
embedded in agent prompts or this server.
"""

import json
import os
from urllib.request import Request, urlopen

from fastmcp import FastMCP

mcp = FastMCP("dinah-orchestration")


def call_backend(path: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    request = Request(
        f"{os.environ['DND_BACKEND_URL']}{path}",
        data=body,
        headers={"Content-Type": "application/json", "x-dinah-mcp-token": os.environ["DND_MCP_TOKEN"]},
        method="POST",
    )
    with urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def context(arguments: dict) -> dict:
    return {
        **arguments,
        "agentId": os.environ["DND_AGENT_ID"],
        "projectId": arguments.get("projectId", os.environ["DND_PROJECT_ID"]),
    }


@mcp.tool()
def get_project_status(projectId: str = "") -> dict:
    """Read current agents, tasks, progress, blockers, and help requests for a project."""
    return call_backend("/api/internal/orchestration/status", context({"projectId": projectId or os.environ["DND_PROJECT_ID"]}))


@mcp.tool()
def request_staff(role: str, projectId: str = "", name: str = "", model: str = "", promptOverride: str = "") -> dict:
    """Ask HR to provision a specialist; returns an awaiting-confirmation staffing request."""
    return call_backend("/api/internal/orchestration/staff", context({"role": role, "projectId": projectId or os.environ["DND_PROJECT_ID"], "name": name or None, "model": model or None, "promptOverride": promptOverride or None}))


@mcp.tool()
def provision_agent(role: str, projectId: str = "", name: str = "", model: str = "", harness: str = "", effortLevel: str = "", promptOverride: str = "") -> dict:
    """Provision an active specialist. Backend authorizes this tool only for HR Mind Flayer."""
    return call_backend("/api/internal/orchestration/provision", context({"role": role, "projectId": projectId or os.environ["DND_PROJECT_ID"], "name": name or None, "model": model or None, "harness": harness or None, "effortLevel": effortLevel or None, "promptOverride": promptOverride or None}))


@mcp.tool()
def create_task(title: str, assignee: str, description: str = "", acceptanceCriteria: list[str] | None = None, dependencies: list[str] | None = None, dispatch: bool = False) -> dict:
    """Create a tracked work item and optionally dispatch it to an active agent."""
    return call_backend("/api/internal/orchestration/task", context({"title": title, "assignee": assignee, "description": description, "acceptanceCriteria": acceptanceCriteria or [], "dependencies": dependencies or [], "dispatch": dispatch}))


@mcp.tool()
def update_progress(taskId: str, status: str, summary: str, percent: int | None = None) -> dict:
    """Publish progress for a task assigned to the calling agent."""
    return call_backend("/api/internal/orchestration/progress", context({"taskId": taskId, "status": status, "summary": summary, "percent": percent}))


@mcp.tool()
def report_blocker(blocker: str, taskId: str = "", severity: str = "medium") -> dict:
    """Record a blocker so the manager can act without scanning the whole project."""
    return call_backend("/api/internal/orchestration/blocker", context({"blocker": blocker, "taskId": taskId or None, "severity": severity}))


@mcp.tool()
def request_help(neededRole: str, question: str, taskId: str = "", urgency: str = "normal") -> dict:
    """Ask for a specialist or decision when the current agent cannot proceed."""
    return call_backend("/api/internal/orchestration/help", context({"neededRole": neededRole, "question": question, "taskId": taskId or None, "urgency": urgency}))


@mcp.tool()
def ask_user(question: str, taskId: str = "") -> dict:
    """Pause this agent and send a question to the user. Resume when the user replies."""
    return call_backend("/api/internal/orchestration/ask-user", context({"question": question, "taskId": taskId or None}))


@mcp.tool()
def create_project(projectId: str = "", description: str = "", customPath: str = "") -> dict:
    """Create a project as CEO and provision its default Manager Bard."""
    return call_backend("/api/internal/orchestration/create-project", context({"newProjectId": projectId, "description": description, "customPath": customPath or None}))


@mcp.tool()
def send_agent_message(toAgentId: str, message: str) -> dict:
    """Accept a direct message into the durable queue; processing is acknowledged separately."""
    return call_backend("/api/internal/orchestration/message", context({"fromAgentId": os.environ["DND_AGENT_ID"], "toAgentId": toAgentId, "message": message}))


@mcp.tool()
def publish_project_message(message: str, type: str = "notification", idempotencyKey: str = "") -> dict:
    """Publish a message to agents subscribed to the current project."""
    return call_backend("/api/internal/orchestration/project-message", context({"message": message, "type": type, "idempotencyKey": idempotencyKey or None}))


@mcp.tool()
def subscribe_project(projectId: str = "") -> dict:
    """Subscribe the calling agent to durable project-channel deliveries."""
    return call_backend("/api/internal/orchestration/subscribe", context({"projectId": projectId or os.environ["DND_PROJECT_ID"]}))


@mcp.tool()
def list_inbox(limit: int = 20, includeCompleted: bool = False) -> dict:
    """List new direct and project-channel deliveries for the calling agent."""
    return call_backend("/api/internal/orchestration/inbox", context({"limit": limit, "includeCompleted": includeCompleted}))


@mcp.tool()
def claim_message(messageId: str, leaseMs: int = 120000) -> dict:
    """Atomically claim one inbox delivery and return its lease token."""
    return call_backend("/api/internal/orchestration/claim", context({"messageId": messageId, "leaseMs": leaseMs}))


@mcp.tool()
def acknowledge_message(messageId: str, leaseToken: str) -> dict:
    """Acknowledge receipt and mark a claimed delivery as processing. Call immediately after claiming, before doing the work; accepts a message or delivery ID."""
    return call_backend("/api/internal/orchestration/acknowledge", context({"messageId": messageId, "leaseToken": leaseToken}))


@mcp.tool()
def complete_message(messageId: str, leaseToken: str, result: str = "") -> dict:
    """Mark a delivery complete. Only the current lease holder may complete it; accepts a message or delivery ID."""
    return call_backend("/api/internal/orchestration/complete", context({"messageId": messageId, "leaseToken": leaseToken, "result": result or None}))


@mcp.tool()
def fail_message(messageId: str, leaseToken: str, reason: str, retryable: bool = True) -> dict:
    """Fail a delivery and either retry it or move it to the dead-letter state."""
    return call_backend("/api/internal/orchestration/fail", context({"messageId": messageId, "leaseToken": leaseToken, "reason": reason, "retryable": retryable}))


@mcp.tool()
def release_message(messageId: str, leaseToken: str, reason: str = "released") -> dict:
    """Return a claimed delivery to the queue for another attempt."""
    return call_backend("/api/internal/orchestration/release", context({"messageId": messageId, "leaseToken": leaseToken, "reason": reason}))


@mcp.tool()
def get_message_status(messageId: str) -> dict:
    """Read delivery attempts and current state using a message or delivery ID."""
    return call_backend("/api/internal/orchestration/message-status", context({"messageId": messageId}))


if __name__ == "__main__":
    mcp.run()
