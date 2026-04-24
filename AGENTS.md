# Studio 33 Manager — Project Context for AI Agents

## Overview
Internal management app for **Studio 33 Architects** (Agadir, Morocco), founded by **Chaima Zerkdi**.
Single-file HTML application with inline CSS and JavaScript. No build step required.

## Main File
- `/Users/chniwla/Downloads/stduio33manager3/index.html` — The entire app (~6000 lines)

## Tech Stack
- **Frontend**: Vanilla HTML/CSS/JS (single file, no framework)
- **Backend**: Supabase REST API (tables: `projects`, `clients`, `invoices`, `devis`, `charges`, `entrees`, `library`, `mediatheque`)
- **AI Assistant**: OpenRouter API — model `anthropic/claude-sonnet-4` (called "Samia IA")
- **Persistence**: Supabase for main data, `localStorage` for daily reports and task completion state
- **Fonts**: Plus Jakarta Sans (body), Cormorant Garamond (display)
- **Design**: Google Home style — light theme, white surfaces, rounded cards (`--radius: 16px`), gold accent (`#C9A84C`)

## Authentication
Users are hardcoded in a `USERS` array (no Supabase auth):
```js
const USERS = [
  { id: 1, username: 'admin',   password: 'studio33', name: 'Chaima Zerkdi', role: 'admin',  avatar: 'CZ' },
  { id: 6, username: 'nadia',   password: 'na2025',   name: 'Nadia',         role: 'member', avatar: 'NA' },
  { id: 7, username: 'nezha',   password: 'nz2025',   name: 'Nezha',         role: 'member', avatar: 'NZ' },
  { id: 8, username: 'oumaima', password: 'ou2025',   name: 'Oumaima',       role: 'member', avatar: 'OU' },
  { id: 9, username: 'zineb',   password: 'zi2025',   name: 'Zineb',         role: 'member', avatar: 'ZI' },
];
```

## Role-Based Access
- **admin** (Chaima): sees everything — projects, clients, invoices, devis, finances, library, media, team
- **member** (Nadia, Nezha, Oumaima, Zineb): sees only Dashboard, Projets, Tâches, Rapport

## Key Functions
| Function | Description |
|---|---|
| `login()` | Authenticates against USERS array |
| `updateUIForUser()` | Shows/hides nav based on role |
| `renderMesTaches()` | Task checklist page with progress bar |
| `toggleTask(projectId, taskId)` | Toggle task done/undone in localStorage |
| `openAddTaskModal()` | Manual task creation modal |
| `saveNewTask()` | Saves new task to Supabase |
| `renderRapport()` | Daily report form for members |
| `submitRapport()` | Saves report to localStorage `s33_daily_reports` |
| `renderEquipe()` | Admin view of all team member reports |
| `startReminderCheck()` | Hourly toast reminder if no report submitted (9h–19h) |
| `executeSamiaActions()` | Handles AI actions: create_project, assign_task, create_invoice, etc. |

## Supabase Helpers
```js
sbGet(table)                    // GET all rows
sbInsert(table, data)           // POST insert
sbUpdate(table, id, data)       // PATCH update by id
sbDelete(table, id)             // DELETE by id
```

## Task Data Structure
Tasks are stored as a JSON array inside `projects.tasks`:
```js
{
  id: Number,
  name: String,
  done: Boolean,
  priority: 'normal' | 'urgent',
  assignedTo: String,       // member name
  assignedUserId: Number,   // member id
  deadline: 'YYYY-MM-DD' | null
}
```
Task completion state is stored in `localStorage` key `s33_done_tasks_<userId>`.

## Daily Report Structure (localStorage: `s33_daily_reports`)
```js
{
  userId, userName, userAvatar,
  date,           // 'YYYY-MM-DD'
  type,           // 'daily' | 'weekly'
  projectId, projectName,
  tasks,          // text
  hours,          // number
  blockers,       // text
  files,          // array
  submittedAt     // ISO string
}
```

## CSS Variables
```css
--gold: #C9A84C
--radius: 16px
--radius-sm: 10px
--radius-pill: 999px
--surface: #fff
--surface2: #f5f5f5
--surface3: #ebebeb
--text: #1a1a1a
--text-dim: #666
--text-faint: #999
--border: #e8e8e8
```

## Deployment
- **Netlify site**: `studio33manager`
- **Site ID**: `bd6aff52-3574-4b03-87de-83cb7409bee5`
- Deploy manually: `netlify deploy --prod --dir /Users/chniwla/Downloads/stduio33manager3`
- Or drag & drop `index.html` at [app.netlify.com/drop](https://app.netlify.com/drop)

## Dev Server
```bash
npx serve /Users/chniwla/Downloads/stduio33manager3 -p 3000
```

## Important Notes
- **Do not add external dependencies** — everything must stay inline in `index.html`
- **Do not use build tools** — no webpack, vite, or npm packages in the app itself
- **Language**: UI is in French (Morocco), comments can be in French or English
- **Logo**: SI33 PNG is embedded as base64 in the HTML (auth screen + loading overlay)
- All monetary values are in **MAD** (Moroccan Dirham)
