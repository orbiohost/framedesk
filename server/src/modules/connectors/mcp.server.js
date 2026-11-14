import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
import { EVENT_TYPES } from '../calendar/event.model.js';
import { FILE_CATEGORIES } from '../files/fileTypes.js';
import { FILE_STATUSES } from '../files/file.model.js';
import { PROJECT_STATUSES } from '../projects/project.model.js';
import { TASK_STATUSES } from '../tasks/task.model.js';
import { PRIORITIES } from '../../config/constants.js';
import * as data from './mcpData.service.js';

const INSTRUCTIONS = `FrameDesk is a project manager for creative studios (video, branding, motion, social).
This connection is read-only. Data is organised by workspace; most tools take an optional
workspace_id, which can be left out when the person has a single workspace.
Start with list_workspaces or workspace_overview, then drill into projects, tasks, clients,
calendar events, files (with AI summaries) and transcripts. Dates are ISO 8601 (UTC).
Budgets are in Indian rupees (INR).`;

const DOWNLOAD_INSTRUCTIONS = `
File downloads are on for this connection: get_download_links gives plain HTTPS links to the
original files (videos, photos, documents) for editing, converting or analysing them, and
read_file_content returns small images and text files directly.`;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const workspaceId = z
  .string()
  .optional()
  .describe('Workspace id from list_workspaces. Optional if there is only one workspace.');
const limit = (max, fallback) =>
  z.number().int().min(1).max(max).optional().describe(`Max results (default ${fallback}).`);
const query = z.string().max(200).optional().describe('Case-insensitive text to look for.');

function asResult(value) {
  if (value?.[data.RAW_CONTENT]) return { content: value[data.RAW_CONTENT] };
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

// Tool failures the assistant can act on come back as tool errors; anything
// else is logged and reported vaguely.
function tool(name, handler, ctx) {
  return async (args) => {
    try {
      return asResult(await handler(ctx, args ?? {}));
    } catch (err) {
      if (err instanceof data.ToolError) {
        return { isError: true, content: [{ type: 'text', text: err.message }] };
      }
      logger.error({ err, tool: name, grantId: String(ctx.grant._id) }, 'MCP tool failed');
      return {
        isError: true,
        content: [{ type: 'text', text: 'FrameDesk hit an error answering this. Try again.' }],
      };
    }
  };
}

const TOOLS = [
  {
    name: 'list_workspaces',
    title: 'List workspaces',
    description:
      'Lists the FrameDesk workspaces this connection can read, with your role in each. Call this first when you need a workspace_id.',
    inputSchema: {},
    handler: data.listWorkspaces,
  },
  {
    name: 'workspace_overview',
    title: 'Workspace overview',
    description:
      'A snapshot of a workspace: projects by status, task counts, overdue and due-this-week tasks, the next 14 days of calendar events, client count and file totals. Good starting point for status reports.',
    inputSchema: { workspace_id: workspaceId },
    handler: data.workspaceOverview,
  },
  {
    name: 'list_projects',
    title: 'List projects',
    description:
      'Lists projects with status, client, dates, budget (INR) and task counts per status. Archived projects are left out unless asked for.',
    inputSchema: {
      workspace_id: workspaceId,
      status: z.enum(PROJECT_STATUSES).optional(),
      client_id: z.string().optional(),
      query,
      include_archived: z.boolean().optional(),
      limit: limit(200, 50),
    },
    handler: data.listProjects,
  },
  {
    name: 'get_project',
    title: 'Get project',
    description:
      'Everything about one project: details, client, all tasks, calendar events, latest files (with AI summaries) and linked notes.',
    inputSchema: { workspace_id: workspaceId, project_id: z.string() },
    handler: data.getProject,
  },
  {
    name: 'list_tasks',
    title: 'List tasks',
    description:
      'Finds tasks across the workspace or one project. Filter by status, priority, due dates, overdue only, or tasks assigned to you.',
    inputSchema: {
      workspace_id: workspaceId,
      project_id: z.string().optional(),
      status: z.enum(TASK_STATUSES).optional(),
      priority: z.enum(PRIORITIES).optional(),
      assigned_to_me: z.boolean().optional(),
      overdue_only: z.boolean().optional(),
      due_from: z.string().optional().describe('ISO date, inclusive.'),
      due_to: z.string().optional().describe('ISO date, inclusive.'),
      query,
      limit: limit(500, 100),
    },
    handler: data.listTasks,
  },
  {
    name: 'list_clients',
    title: 'List clients',
    description: 'Lists clients with contact details, tags and how many projects each has.',
    inputSchema: {
      workspace_id: workspaceId,
      query,
      include_archived: z.boolean().optional(),
      limit: limit(500, 100),
    },
    handler: data.listClients,
  },
  {
    name: 'get_client',
    title: 'Get client',
    description: "One client's details, all their projects and their calendar events.",
    inputSchema: { workspace_id: workspaceId, client_id: z.string() },
    handler: data.getClient,
  },
  {
    name: 'list_events',
    title: 'List calendar events',
    description:
      'Calendar events (shoots, meetings, deliveries, review calls) in a date range. Defaults to the next 30 days.',
    inputSchema: {
      workspace_id: workspaceId,
      from: z.string().optional().describe('ISO date. Default: now.'),
      to: z.string().optional().describe('ISO date. Default: 30 days after "from".'),
      project_id: z.string().optional(),
      type: z.enum(EVENT_TYPES).optional(),
      limit: limit(500, 200),
    },
    handler: data.listEvents,
  },
  {
    name: 'list_files',
    title: 'List files',
    description:
      'Lists files (videos, images, documents...) in a project or the workspace Drive, with review status, tags, notes and the AI summary when one exists.',
    inputSchema: {
      workspace_id: workspaceId,
      project_id: z.string().optional(),
      drive_only: z.boolean().optional().describe('Only files that belong to no project.'),
      category: z.enum(FILE_CATEGORIES).optional(),
      status: z.enum(FILE_STATUSES).optional(),
      query,
      limit: limit(200, 50),
    },
    handler: data.listFiles,
  },
  {
    name: 'get_file',
    title: 'Get file',
    description:
      "One file's details plus FrameDesk's AI analysis of it (summary, details, key moments) and whether it has a transcript.",
    inputSchema: { workspace_id: workspaceId, file_id: z.string() },
    handler: data.getFile,
  },
  {
    name: 'get_transcript',
    title: 'Get transcript',
    description:
      'The speech-to-text transcript of an audio or video file, optionally with [m:ss] timestamps.',
    inputSchema: {
      workspace_id: workspaceId,
      file_id: z.string(),
      include_timestamps: z.boolean().optional(),
      max_chars: z.number().int().min(1000).max(200_000).optional(),
    },
    handler: data.getTranscript,
  },
  {
    name: 'list_notes',
    title: 'List notes',
    description:
      "Quick notes and ideas: the team's shared notes plus your own private ones. Filter by project, #tag or text.",
    inputSchema: {
      workspace_id: workspaceId,
      project_id: z.string().optional(),
      tag: z.string().max(60).optional(),
      query,
      limit: limit(200, 50),
    },
    handler: data.listNotes,
  },
  {
    name: 'search',
    title: 'Search FrameDesk',
    description:
      'Searches projects, tasks, clients, files, notes and events across every workspace this connection can read. Returns ids to pass to fetch.',
    inputSchema: { query: z.string().min(1).max(200) },
    handler: data.search,
  },
  {
    name: 'fetch',
    title: 'Fetch a search result',
    description: 'Returns the full record for an id returned by search.',
    inputSchema: { id: z.string() },
    handler: data.fetchRecord,
  },
];

// Only offered when the person turned on "Allow file downloads" for this connection.
const DOWNLOAD_TOOLS = [
  {
    name: 'get_download_links',
    title: 'Get download links',
    description:
      'Direct HTTPS download links to the original files (full quality), valid for 1 hour, no auth header needed. Use these to download videos, photos or documents and work on them (edit, convert, cut a reel, analyse frames). Get file ids from list_files, get_project or search.',
    inputSchema: {
      workspace_id: workspaceId,
      file_ids: z.array(z.string()).min(1).max(25),
    },
    handler: data.getDownloadLinks,
  },
  {
    name: 'read_file_content',
    title: 'Read file content',
    description:
      'Returns the content of one small file directly: images (PNG, JPEG, GIF, WebP up to 5 MB) as a picture, text files (txt, md, csv, json, srt, vtt... up to 1 MB) as text. For anything else use get_download_links.',
    inputSchema: { workspace_id: workspaceId, file_id: z.string() },
    handler: data.readFileContent,
  },
];

// A fresh server per request: the endpoint is stateless, and each server is
// bound to the caller's connection.
export function createMcpServer(ctx) {
  const server = new McpServer(
    { name: 'framedesk', title: 'FrameDesk', version: '1.0.0' },
    {
      instructions: ctx.grant.allowDownloads ? INSTRUCTIONS + DOWNLOAD_INSTRUCTIONS : INSTRUCTIONS,
      capabilities: { tools: {} },
    },
  );
  const tools = ctx.grant.allowDownloads ? [...TOOLS, ...DOWNLOAD_TOOLS] : TOOLS;
  for (const { name, title, description, inputSchema, handler } of tools) {
    server.registerTool(
      name,
      { title, description, inputSchema, annotations: { ...READ_ONLY, title } },
      tool(name, handler, ctx),
    );
  }
  return server;
}
