export const bergflowEnglish = {
  "boc.bergflow.title": "Project Controls",
  "boc.bergflow.subtitle": "Your project. Your capabilities.",
  "boc.bergflow.readOnly": "Read-only",
  "boc.bergflow.readOnly.agent":
    "Agent switching is not supported by this Bergflow version. Agents are shown for reference.",
  "boc.bergflow.readOnly.instruction":
    "AGENTS.md switching is not supported by this Bergflow version. Discovered files are shown; their effect in a session is unconfirmed.",
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
  "boc.bergflow.version": "Bergflow {{version}} · Protocol {{protocol}}",
  "boc.bergflow.error.missing": "Bergflow is not available on this server.",
  "boc.bergflow.error.disabled":
    "Bergflow is disabled in the server configuration. Its configuration choice is respected.",
  "boc.bergflow.error.unsupported":
    "This server's Bergflow protocol is not supported. Other Boc features remain available.",
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
  "boc.bergflow.effect.next_skill_request":
    "Applies to the skill inventory and future native skill requests. Existing conversation content is retained.",
  "boc.bergflow.effect.mcp_reconnect":
    "Reloads this project's MCP configuration. Connection and authentication status are separate from the setting.",
  "boc.bergflow.effect.read_only": "No immediate change to active sessions is promised.",
  "boc.bergflow.availability.needs_auth": "Sign-in required",
  "boc.bergflow.availability.pending": "Connection pending",
  "boc.bergflow.availability.failed": "Connection failed",
  "boc.bergflow.admin": "Server setup instructions",
  "boc.bergflow.adminText":
    "On the selected server, install the tested Bergflow artifact and add its local directory to the plugins array in OpenCode configuration. TUI discovery is automatic. For a published package, the server administrator can use opencode2 plugin add with an exact package version; that command changes the global configuration. Boc does not install anything remotely or fall back to a local server.",
} as const
