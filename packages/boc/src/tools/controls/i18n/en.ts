export const controlsEnglish = {
  "boc.bergflow.title": "Project Controls",
  "boc.bergflow.origin.system": "System · bundled with OpenCode",
  "boc.bergflow.origin.global": "Global · user configuration",
  "boc.bergflow.origin.project": "Project · checkout configuration",
  "boc.bergflow.origin.plugin": "Plugin · registered capability",
  "boc.bergflow.subtitle": "Your project. Your capabilities.",
  "boc.bergflow.readOnly": "Read-only",
  "boc.bergflow.readOnly.agent":
    "Agents are shown for reference. Agent switching is not yet available in Project Controls.",
  "boc.bergflow.readOnly.instruction": "Only project-owned automatic instruction files can be switched here.",
  "boc.bergflow.scope.instruction":
    "Project files affect future automatic instruction loads. Instructions already in session history and nested instructions loaded while reading files are unchanged.",
  "boc.bergflow.openSession": "Open Project Controls for this session",
  "boc.bergflow.contextFailed": "Could not open controls for this session",
  "boc.bergflow.scope": "Changes apply to all worktrees of this project on this server.",
  "boc.bergflow.running": "Already running actions are not stopped.",
  "boc.bergflow.server": "Server",
  "boc.bergflow.project": "Project",
  "boc.bergflow.worktree": "Worktree",
  "boc.bergflow.choose": "Choose a project to see its capabilities.",
  "boc.bergflow.selectServer": "Choose server",
  "boc.bergflow.selectProject": "Choose project",
  "boc.bergflow.refresh": "Refresh",
  "boc.bergflow.refreshing": "Refreshing…",
  "boc.bergflow.search": "Search capabilities",
  "boc.bergflow.filter": "Category",
  "boc.bergflow.all": "All",
  "boc.bergflow.agent": "Agents",
  "boc.bergflow.skill": "Skills",
  "boc.bergflow.tool": "Tools",
  "boc.bergflow.mcp": "MCP servers",
  "boc.bergflow.instruction": "Instructions",
  "boc.bergflow.default": "Project default",
  "boc.bergflow.override": "Project override",
  "boc.bergflow.enabled": "Enabled here",
  "boc.bergflow.disabled": "Disabled here",
  "boc.bergflow.unknown": "Effect unconfirmed",
  "boc.bergflow.desiredOn": "Desired: enabled",
  "boc.bergflow.desiredOff": "Desired: disabled",
  "boc.bergflow.details": "Details",
  "boc.bergflow.id": "ID",
  "boc.bergflow.source": "Source",
  "boc.bergflow.sourceUnknown": "Source not identified",
  "boc.bergflow.reset": "Use project default",
  "boc.bergflow.retry": "Retry applying saved setting",
  "boc.bergflow.applying": "Applying…",
  "boc.bergflow.savedPending": "Saved, but not yet effective here",
  "boc.bergflow.empty": "No capabilities are available in this location.",
  "boc.bergflow.noMatches": "No capabilities match your search.",
  "boc.bergflow.clearFilters": "Clear filters",
  "boc.bergflow.orphans": "Unavailable in this location",
  "boc.bergflow.partial": "Some inventory is incomplete. Details explain the limits of each control.",
  "boc.bergflow.stale":
    "This snapshot is out of date. Changes are disabled until the connection is restored and the state is refreshed.",
  "boc.bergflow.contextLocked": "Wait for the current change before switching context.",
  "boc.bergflow.bundled": "Included with Boc",
  "boc.bergflow.package": "Installed package",
  "boc.bergflow.local": "Local path",
  "boc.bergflow.version": "Boc Project Controls · Protocol {{protocol}}",
  "boc.bergflow.error.missing": "Project Controls could not connect to its backend. Refresh to try again.",
  "boc.bergflow.error.disabled": "Project Controls is unavailable on this server.",
  "boc.bergflow.error.unsupported":
    "This server's Project Controls protocol is not supported. Update Boc Desktop and its server together.",
  "boc.bergflow.error.unavailable":
    "Could not load controls from the selected server. Check the connection and refresh.",
  "boc.bergflow.error.conflict":
    "Another client changed this project. Review the refreshed settings before trying again.",
  "boc.bergflow.error.persistence": "The setting could not be saved. The previous project setting is unchanged.",
  "boc.bergflow.error.unknown":
    "The outcome is unknown. The change will not be retried automatically; refresh to check the saved setting.",
  "boc.bergflow.error.reconciled":
    "The state has been refreshed. Review the saved setting before making another change.",
  "boc.bergflow.error.rejected":
    "This capability is no longer available or cannot be changed. The list has been refreshed.",
  "boc.bergflow.reason.read_only": "This capability is read-only because its update behavior is not yet verified.",
  "boc.bergflow.reason.unsupported": "The required plugin API is not available on this server.",
  "boc.bergflow.reason.unavailable":
    "This saved override has no capability in the selected location. You can remove it.",
  "boc.bergflow.reason.apply_failed":
    "The project setting was saved, but applying it here failed. Retry the saved setting.",
  "boc.bergflow.reason.unconfirmed_policy":
    "This existing override is preserved. Its effect cannot be confirmed with the supported API. New changes are disabled; you can remove the override.",
  "boc.bergflow.reason.observed_tools":
    "This inventory contains observed registry tools. Session-specific tools may be absent. Enabled does not guarantee availability in every session.",
  "boc.bergflow.effect.next_model_request":
    "Applies to future model requests and tool execution. Already running calls continue.",
  "boc.bergflow.effect.next_instruction_request":
    "Applies to future automatic project-instruction loads. Existing session history and read-triggered nested instructions are retained.",
  "boc.bergflow.effect.next_skill_request":
    "Applies to the skill inventory and future native skill requests. Existing conversation content is retained.",
  "boc.bergflow.effect.mcp_reconnect":
    "Reloads this project's MCP configuration. Connection and authentication status are separate from the setting.",
  "boc.bergflow.effect.read_only": "No immediate change to active sessions is promised.",
  "boc.bergflow.availability.needs_auth": "Sign-in required",
  "boc.bergflow.availability.pending": "Connection pending",
  "boc.bergflow.availability.failed": "Connection failed",
} as const
