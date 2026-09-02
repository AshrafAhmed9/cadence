import type { ToolScopeRegistry } from "../cf-foundation/actor.js";

/**
 * Minimum permission scope required to call each tool. An agent's grant
 * (see `../cf-foundation/actor.js`'s `resolveToolNames`) determines
 * which of these actually get registered with `document.modelContext` for
 * that agent — a read-only grant never even sees `bulk_update` or
 * `merge_duplicates` in its tool list.
 */
export const CADENCE_TOOL_SCOPES: ToolScopeRegistry = {
  list_issues: "read",
  get_issue: "read",
  search_issues: "read",
  get_board_state: "read",
  get_current_selection: "read",
  list_labels: "read",
  list_cycles: "read",
  get_activity: "read",

  create_issue: "triage",
  update_issue: "triage",
  set_status: "triage",
  set_priority: "triage",
  assign: "triage",
  add_label: "triage",
  remove_label: "triage",
  add_comment: "triage",
  link_issues: "triage",
  move_to_cycle: "triage",
  set_estimate: "triage",

  triage_inbox: "triage",
  find_duplicates: "triage",
  summarize_cycle: "triage",
  estimate_and_rank: "triage",

  split_issue: "write",

  merge_duplicates: "full",
  bulk_update: "full",
};
