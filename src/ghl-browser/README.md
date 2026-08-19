# ghl-browser-mcp

Browser-automation MCP server providing **308 tools** covering the full
GoHighLevel (GHL) platform. Every major GHL feature area is accessible:
workflow builder, funnel pages, pipeline management, campaigns, social media,
blogs, forms, email templates, website/page builder, proposals, calendars,
bookings, reporting, memberships, invoices, reputation, affiliates, settings,
trigger links, snapshots, conversation AI, media library, tags & custom fields,
automation templates, conversations, contacts, documents, payments, ecommerce,
events, communities, copilot, custom objects, notifications, voice AI,
power dialer, performance AI, agency management, dashboard widgets, SEO,
snippets, contact scoring, superagents, AI employees, agent builder, agent
studio, industry agents, and location settings.

Uses Playwright with a **persistent browser profile** so the user logs in once
interactively (`npm run login`), and subsequent MCP runs reuse the stored
session cookies.

## Prerequisites

- Node 20+
- Playwright Chromium installed: `npx playwright install chromium`

## Login once

```bash
cd ~/mcp-servers/src/ghl-browser
npm install
npm run build
npm run login
```

A Chromium window opens to `https://app.leadconnectorhq.com/`. Log in manually
with your GHL agency/user credentials. Once the dashboard appears, close the
window — the auth state is persisted to `./browser-state/`.

## Build & run

```bash
npm run build
node dist/index.js
```

Speaks MCP over stdio. Add to your MCP client config:

```json
{
  "mcpServers": {
    "ghl-browser": {
      "command": "node",
      "args": ["C:/Users/steve/mcp-servers/src/ghl-browser/dist/index.js"]
    }
  }
}
```

## Tools (308 total)

All tools are best-effort UI automation. If GHL reorganizes the DOM, tools
may fail gracefully with a screenshot path in the error message for debugging.

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `GHL_BROWSER_HEADLESS` | `true` | Set `false` to see the browser while the MCP runs (debug only) |
| `GHL_SLOW_MO` | `0` | Milliseconds to delay between Playwright actions (debug) |
| `GHL_APP_URL` | `https://app.leadconnectorhq.com` | Override the GHL base URL (e.g. for a white-label host) |

### Integration test

Runs every read-only browser tool end-to-end against the live GHL dashboard:

```bash
node integration-test.mjs
```

For verbose output (including full tool results):

```bash
VERBOSE=1 node integration-test.mjs
```

### Workflow Builder (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_workflows` | List workflows visible on the Workflows index page |
| `ghl_browser_create_workflow` | Open the "Create Workflow" dialog and submit a name |
| `ghl_browser_get_workflow_canvas` | Snapshot the canvas: list nodes, triggers, actions |
| `ghl_browser_add_workflow_node` | Add a trigger or action node (type + config) |
| `ghl_browser_save_workflow` | Save & publish the current workflow |

### Funnel Page Editor (3)

| Tool | Description |
|---|---|
| `ghl_browser_list_funnel_pages` | List funnel pages with status (draft/published) |
| `ghl_browser_edit_funnel_page` | Update headline/body/button on a funnel page and save |
| `ghl_browser_publish_funnel_page` | Publish or unpublish a page |

### Pipeline Drag-Drop (3)

| Tool | Description |
|---|---|
| `ghl_browser_list_pipeline_opportunities` | List opps by stage (read from the Kanban) |
| `ghl_browser_move_opportunity_stage` | Drag an opportunity card to a different stage |
| `ghl_browser_snapshot_pipeline` | Capture a board snapshot (stage → count + opp list) |

### Campaign Builder (4)

| Tool | Description |
|---|---|
| `ghl_browser_list_campaigns` | List campaigns with status |
| `ghl_browser_create_campaign` | Create a campaign shell (name, type) |
| `ghl_browser_add_campaign_step` | Add a step (SMS / Email / Wait / Action) |
| `ghl_browser_start_stop_campaign` | Start, pause, or stop a campaign |

### Social Media (3)

| Tool | Description |
|---|---|
| `ghl_browser_social_compose` | Compose and post to one or more connected accounts |
| `ghl_browser_social_schedule` | Schedule a post for a specific date/time |
| `ghl_browser_social_list_posts` | List recent posts with status (published/scheduled/failed) |

### Blog Authoring (3)

| Tool | Description |
|---|---|
| `ghl_browser_list_blogs` | List blog sites and post counts |
| `ghl_browser_create_blog_post` | Draft or publish a blog post (title, body, image) |
| `ghl_browser_update_blog_post` | Edit title/body and save/publish |

### Form Builder (7)

| Tool | Description |
|---|---|
| `ghl_browser_list_forms` | List forms (or surveys) with name, type, status, ID; supports search |
| `ghl_browser_create_form` | Create a new form or survey via the GHL UI |
| `ghl_browser_get_form_builder` | Open a form and return its field layout: names, types, required flags, order |
| `ghl_browser_add_form_field` | Add a field from the palette (text, email, phone, dropdown, etc.) |
| `ghl_browser_save_form` | Save and optionally publish a form |
| `ghl_browser_delete_form` | Delete a form (requires `confirm: true`) |
| `ghl_browser_get_form_embed` | Get embed code (HTML snippet, iframe URL, or direct link) for a form |

### Email Builder (6)

| Tool | Description |
|---|---|
| `ghl_browser_list_email_templates` | List email templates with name, type (builder/html/imported), last updated |
| `ghl_browser_create_email_template` | Create a template from builder, raw HTML, or blank |
| `ghl_browser_edit_email_template` | Update subject, preheader, and body HTML of an existing template |
| `ghl_browser_get_email_preview` | Capture a rendered preview screenshot (desktop or mobile) |
| `ghl_browser_send_test_email` | Send a test email to one or more addresses |
| `ghl_browser_delete_email_template` | Delete a template (requires `confirm: true`) |

### Page Builder (6)

| Tool | Description |
|---|---|
| `ghl_browser_list_sites` | List websites and funnels with name, type, page count, status |
| `ghl_browser_get_page_tree` | Get the page tree for a site: page names, URL paths, status |
| `ghl_browser_open_page_builder` | Open the WYSIWYG builder and return the element tree (sections, columns, elements) |
| `ghl_browser_add_page_section` | Add a section/element (heading, text, image, button, form, columns, etc.) |
| `ghl_browser_edit_page_element` | Edit element properties: text, link, image, colors, font size, CSS class |
| `ghl_browser_save_page` | Save and optionally publish a page |

### Proposals & Estimates (7)

| Tool | Description |
|---|---|
| `ghl_browser_list_proposals` | List proposals with contact, amount, status (draft/sent/accepted/declined) |
| `ghl_browser_create_proposal` | Create a proposal or estimate, optionally from a template |
| `ghl_browser_get_proposal_details` | Open a proposal and return sections, line items, terms, and total |
| `ghl_browser_add_proposal_section` | Add a section (heading, text_block, line_item, table, terms, signature, payment) |
| `ghl_browser_send_proposal` | Send a proposal to the assigned contact via email |
| `ghl_browser_update_proposal_status` | Update status: draft, sent, accepted, or declined |
| `ghl_browser_delete_proposal` | Delete a proposal (requires `confirm: true`) |

### Calendar Configuration (7)

| Tool | Description |
|---|---|
| `ghl_browser_list_calendars` | List appointment calendars with name, type, status, booking URL |
| `ghl_browser_get_calendar_config` | Get full config: slots, availability, buffers, limits, assigned users |
| `ghl_browser_create_calendar` | Create a calendar (simple, round-robin, or group type) |
| `ghl_browser_update_availability` | Set availability windows per day-of-week and timezone |
| `ghl_browser_assign_calendar_users` | Add/remove users from a calendar (rotation pool or group) |
| `ghl_browser_get_booking_link` | Get the public booking URL for sharing or embedding |
| `ghl_browser_delete_calendar` | Delete a calendar (requires `confirm: true`) |

### Reporting Dashboard (6)

| Tool | Description |
|---|---|
| `ghl_browser_list_reports` | List reports with name, category, type, last run date |
| `ghl_browser_create_report` | Create a custom report with metrics, dimensions, and date range |
| `ghl_browser_get_report_data` | Extract report data: table rows, chart values, summary metrics |
| `ghl_browser_export_report` | Export a report as CSV or PDF |
| `ghl_browser_get_dashboard_metrics` | Read dashboard summary: leads, conversions, revenue, appointments |
| `ghl_browser_delete_report` | Delete a custom report (requires `confirm: true`) |

### Memberships & Courses (6)

| Tool | Description |
|---|---|
| `ghl_browser_list_memberships` | List memberships/courses with type, price, member count, status |
| `ghl_browser_create_membership` | Create a membership, course, or offer with pricing and billing |
| `ghl_browser_get_membership_structure` | Get content hierarchy: courses, modules, lessons with titles and order |
| `ghl_browser_add_membership_content` | Add a course, module, or lesson (video, text, PDF, quiz) |
| `ghl_browser_update_membership_settings` | Update pricing, access control, drip schedule, trial period |
| `ghl_browser_delete_membership` | Delete a membership (requires `confirm: true`) |

### Invoices (6)

| Tool | Description |
|---|---|
| `ghl_browser_list_invoices` | List invoices with contact, amount, status, due date, balance |
| `ghl_browser_create_invoice` | Create an invoice with contact, line items, due date, tax |
| `ghl_browser_get_invoice_details` | Get full invoice: line items, payments, balance, status |
| `ghl_browser_send_invoice` | Send invoice to contact via email with optional custom message |
| `ghl_browser_record_invoice_payment` | Record a payment: amount, method, date, reference |
| `ghl_browser_void_invoice` | Void or delete an invoice (requires `confirm: true`) |

### Reputation Management (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_reviews` | List reviews from Google/Facebook with rating, text, response status |
| `ghl_browser_request_review` | Send a review request to a contact via SMS or email |
| `ghl_browser_respond_to_review` | Reply to a review (posted to original platform) |
| `ghl_browser_get_reputation_score` | Get average rating, review count, rating distribution, trend |
| `ghl_browser_list_review_sites` | List connected review platforms with URL, count, and rating |

### Affiliate Management (6)

| Tool | Description |
|---|---|
| `ghl_browser_list_affiliates` | List affiliates with commission rate, status, referral stats |
| `ghl_browser_create_affiliate` | Create a new affiliate with name, email, commission settings |
| `ghl_browser_get_affiliate_details` | Get full details: commission settings, referral links, conversions, payments |
| `ghl_browser_update_affiliate` | Update commission rate, status, or other settings |
| `ghl_browser_get_affiliate_links` | Get referral/tracking links with click and conversion stats |
| `ghl_browser_delete_affiliate` | Delete an affiliate (requires `confirm: true`) |

### Settings & Configuration (7)

| Tool | Description |
|---|---|
| `ghl_browser_get_business_profile` | Get sub-account business profile: name, address, phone, timezone, currency |
| `ghl_browser_update_business_profile` | Update profile fields: name, phone, address, timezone, etc. |
| `ghl_browser_list_users` | List users/team members with name, email, role, status |
| `ghl_browser_create_user` | Invite a new user with first name, email, and role |
| `ghl_browser_update_user_permissions` | Update a user's role or permissions |
| `ghl_browser_get_integrations` | List configured integrations (Twilio, Stripe, etc.) and connection status |
| `ghl_browser_configure_integration` | Open integration settings and update config (enable/disable, API key) |

### Trigger Links (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_trigger_links` | List tracking links with URL, click count, and associated action |
| `ghl_browser_create_trigger_link` | Create a link that fires a workflow/tag/pipeline action on click |
| `ghl_browser_get_trigger_link_stats` | Get click analytics: total clicks, unique, conversions, recent activity |
| `ghl_browser_update_trigger_link` | Update name, redirect URL, or enable/disable status |
| `ghl_browser_delete_trigger_link` | Delete a trigger link (requires `confirm: true`) |

### Snapshots (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_snapshots` | List account snapshots with name, description, creation date, included assets |
| `ghl_browser_create_snapshot` | Capture current sub-account as a reusable snapshot |
| `ghl_browser_get_snapshot_details` | Get snapshot details: included assets, counts, creation info |
| `ghl_browser_load_snapshot` | Load/apply a snapshot to a target sub-account |
| `ghl_browser_delete_snapshot` | Delete a snapshot (requires `confirm: true`) |

### Conversation AI (6)

| Tool | Description |
|---|---|
| `ghl_browser_get_conversation_ai_config` | Get bot config: name, tone, enabled status, knowledge base settings |
| `ghl_browser_update_conversation_ai` | Update bot name, tone, system prompt, response delay, handoff message |
| `ghl_browser_list_ai_training_data` | List knowledge base entries: FAQs, documents, URLs, Q&A pairs |
| `ghl_browser_add_ai_training_data` | Add FAQ, document text, URL to crawl, or custom Q&A pair |
| `ghl_browser_delete_ai_training_data` | Remove a training entry (requires `confirm: true`) |
| `ghl_browser_get_ai_conversation_logs` | Get recent AI chat logs: contact, channel, messages, resolution status |

### Media Library (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_media` | List files with name, type, size, URL; supports search and type filter |
| `ghl_browser_upload_media` | Upload a file from local path or import from URL |
| `ghl_browser_get_media_details` | Get file details: dimensions, URL, embed code, usage |
| `ghl_browser_create_media_folder` | Create a folder for organizing media files |
| `ghl_browser_delete_media` | Delete a media file (requires `confirm: true`) |

### Tags & Custom Fields (7)

| Tool | Description |
|---|---|
| `ghl_browser_list_tags` | List all tags with name, color, and usage count |
| `ghl_browser_create_tag` | Create a new tag with name and optional color |
| `ghl_browser_delete_tag` | Delete a tag (removes from all contacts; requires `confirm: true`) |
| `ghl_browser_list_custom_fields` | List custom fields: name, key, type, model (contact/opportunity) |
| `ghl_browser_create_custom_field` | Create a custom field (text, number, email, date, select, etc.) |
| `ghl_browser_update_custom_field` | Update field name, placeholder, or options |
| `ghl_browser_delete_custom_field` | Delete a custom field (requires `confirm: true`) |

### Automation Templates (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_automation_templates` | Browse template library by category (lead nurture, onboarding, etc.) |
| `ghl_browser_get_automation_template_details` | Get template steps, triggers, actions, and requirements |
| `ghl_browser_install_automation_template` | Install a template, creating a new workflow from the blueprint |
| `ghl_browser_list_automation_recipes` | List recipes (multi-step sequences combining workflows + campaigns) |
| `ghl_browser_install_automation_recipe` | Install a recipe creating multiple linked assets from one blueprint |

### Conversations (6)

| Tool | Description |
|---|---|
| `ghl_browser_list_conversations` | List conversations with filter: all, unread, starred, sms, email, facebook, instagram, whatsapp, webchat |
| `ghl_browser_get_conversation_thread` | Get the full message thread for a conversation by contact name |
| `ghl_browser_send_conversation_message` | Send a message to a contact in an existing conversation (SMS, email, etc.) |
| `ghl_browser_star_conversation` | Star or unstar a conversation for quick access |
| `ghl_browser_assign_conversation` | Assign a conversation to a team member |
| `ghl_browser_get_conversation_contact` | Get contact details associated with a conversation |

### Contacts (7)

| Tool | Description |
|---|---|
| `ghl_browser_list_contacts` | List contacts with name, email, phone, tags; supports search |
| `ghl_browser_get_contact_details_browser` | Get full contact profile: name, email, phone, address, tags, custom fields |
| `ghl_browser_create_contact_browser` | Create a new contact with name, email, phone, tags, and custom fields |
| `ghl_browser_edit_contact` | Update an existing contact's name, email, phone, tags, or custom fields |
| `ghl_browser_list_smart_lists` | List smart lists with name, contact count, and filter criteria |
| `ghl_browser_create_smart_list` | Create a smart list with filter criteria |
| `ghl_browser_export_contacts` | Trigger a contact export (CSV) for the current filter or list |

### Documents (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_documents` | List documents with name, status, recipient, and date |
| `ghl_browser_create_document` | Create a new document with title and content |
| `ghl_browser_get_document_details` | Get document details: content, signatures, status, activity |
| `ghl_browser_send_document_signature` | Send a document for e-signature to a contact |
| `ghl_browser_delete_document` | Delete a document (requires `confirm: true`) |

### Payments (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_transactions` | List payment transactions with amount, status, contact, date |
| `ghl_browser_get_transaction_details` | Get full transaction details: payment method, charge info, contact |
| `ghl_browser_list_subscriptions` | List active subscriptions with contact, amount, billing cycle, status |
| `ghl_browser_list_payment_providers` | List configured payment providers (Stripe, etc.) with status |
| `ghl_browser_create_payment_link` | Create a payment link with amount, description, and product |

### Ecommerce (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_products` | List products with name, price, inventory, status |
| `ghl_browser_create_product` | Create a product with name, price, description, and image |
| `ghl_browser_get_product_details` | Get product details: description, variants, inventory, pricing |
| `ghl_browser_list_orders` | List orders with ID, contact, amount, status, date |
| `ghl_browser_get_order_details` | Get order details: items, contact, amount, fulfillment status |

### Events (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_events` | List events with name, date, type, attendee count |
| `ghl_browser_create_event` | Create an event with name, date, type, and description |
| `ghl_browser_get_event_details` | Get event details: description, schedule, location, settings |
| `ghl_browser_list_event_registrations` | List event registrations with name, email, status, check-in state |
| `ghl_browser_delete_event` | Delete an event (requires `confirm: true`) |

### Communities (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_communities` | List communities/groups with name, member count, post count, status |
| `ghl_browser_create_community` | Create a community with name and description |
| `ghl_browser_get_community_details` | Get community details: description, settings, categories, posts |
| `ghl_browser_list_community_members` | List community members with name, role, join date |
| `ghl_browser_delete_community` | Delete a community (requires `confirm: true`) |

### Copilot (5)

| Tool | Description |
|---|---|
| `ghl_browser_get_copilot_status` | Get AI Copilot configuration and enabled features |
| `ghl_browser_configure_copilot` | Update Copilot settings: enable/disable, set behavior preferences |
| `ghl_browser_list_copilot_automations` | List Copilot automation rules with trigger, status |
| `ghl_browser_create_copilot_automation` | Create a new Copilot automation rule |
| `ghl_browser_get_copilot_logs` | Get recent Copilot activity logs |

### Custom Objects (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_custom_objects` | List custom object definitions with name, record count, fields, status |
| `ghl_browser_get_custom_object_schema` | Get field schema for a custom object: name, type, required flags |
| `ghl_browser_list_custom_object_records` | List records for a custom object type |
| `ghl_browser_create_custom_object` | Create a new custom object definition with fields |
| `ghl_browser_delete_custom_object` | Delete a custom object definition (requires `confirm: true`) |

### Notifications (4)

| Tool | Description |
|---|---|
| `ghl_browser_list_notifications` | List recent notifications with filter: all, unread, mentions |
| `ghl_browser_mark_notification_read` | Mark a notification as read by its label text |
| `ghl_browser_get_notification_settings` | Get current notification preferences and channel settings |
| `ghl_browser_update_notification_settings` | Toggle a notification channel (email, sms, push, in_app) on or off |

### Voice AI (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_voice_ai_calls` | List Voice AI calls with contact, phone, duration, status, date |
| `ghl_browser_get_voice_ai_call` | Get transcript and summary for a specific Voice AI call |
| `ghl_browser_get_voice_ai_settings` | Get Voice AI configuration: system prompt, enabled status |
| `ghl_browser_update_voice_ai_settings` | Update Voice AI system prompt or enable/disable |
| `ghl_browser_list_voice_ai_recordings` | List Voice AI call recordings with name, duration, URL |

### Power Dialer (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_power_dialer_campaigns` | List power dialer campaigns with status, contact count, call count |
| `ghl_browser_create_power_dialer_campaign` | Create a power dialer campaign with name and optional contact list |
| `ghl_browser_get_power_dialer_stats` | Get call statistics for a campaign: calls made, connected, duration |
| `ghl_browser_start_power_dialer_campaign` | Start or resume a power dialer campaign |
| `ghl_browser_stop_power_dialer_campaign` | Pause or stop a power dialer campaign |

### Performance AI (5)

| Tool | Description |
|---|---|
| `ghl_browser_get_performance_overview` | Get the Performance AI dashboard with key metrics and scores |
| `ghl_browser_list_performance_suggestions` | List AI-generated optimization suggestions with category and status |
| `ghl_browser_apply_performance_suggestion` | Apply a specific suggestion by label |
| `ghl_browser_dismiss_performance_suggestion` | Dismiss a suggestion by label |
| `ghl_browser_get_performance_scores` | Get performance scores for funnels, websites, and campaigns |

### Agency Management (6)

| Tool | Description |
|---|---|
| `ghl_browser_list_sub_accounts` | List all sub-accounts (locations) with name, phone, email, status; supports search |
| `ghl_browser_create_sub_account` | Create a new sub-account with name, phone, email, address, city, state, zip, country |
| `ghl_browser_get_agency_billing` | Get agency billing summary: plan, amount, payment method |
| `ghl_browser_list_agency_users` | List agency-level users with name, email, role, status |
| `ghl_browser_get_whitelabel_settings` | Get white-label configuration: custom domain, branding, CNAME |
| `ghl_browser_list_snapshots_agency` | List agency-level snapshots with name, assets, date |

### Dashboard Widgets (5)

| Tool | Description |
|---|---|
| `ghl_browser_get_dashboard_overview` | Read main dashboard KPIs: leads, opportunities, revenue, appointments |
| `ghl_browser_get_dashboard_widget` | Read data from a specific widget by name |
| `ghl_browser_list_dashboard_widgets` | List all visible widgets with titles and summary values |
| `ghl_browser_get_pipeline_summary` | Read pipeline summary cards: stage counts, total value, conversion rate |
| `ghl_browser_get_appointment_summary` | Read appointment metrics: today's count, upcoming, no-shows, completed |

### Calendar Bookings (6)

| Tool | Description |
|---|---|
| `ghl_browser_list_bookings` | List bookings/appointments with contact, date, time, status, calendar |
| `ghl_browser_get_booking_details` | Get full booking details: contact, time, notes, custom fields |
| `ghl_browser_confirm_booking` | Confirm a pending booking by contact name |
| `ghl_browser_cancel_booking` | Cancel a booking with optional reason |
| `ghl_browser_mark_booking_noshow` | Mark a booking as no-show |
| `ghl_browser_reschedule_booking` | Reschedule a booking to a new date and time |

### SEO Management (5)

| Tool | Description |
|---|---|
| `ghl_browser_get_seo_overview` | Get SEO dashboard: site health score, keyword rankings, traffic, issues |
| `ghl_browser_list_seo_pages` | List SEO-tracked pages with optimization score, title, URL |
| `ghl_browser_get_seo_page_analysis` | Get detailed SEO analysis for a page: issues, suggestions, keyword usage |
| `ghl_browser_list_seo_keywords` | List tracked keywords with ranking, change, and search volume |
| `ghl_browser_add_seo_keyword` | Add a keyword to track in the SEO dashboard |

### Snippets (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_snippets` | List content snippets with name, preview, and last modified date |
| `ghl_browser_get_snippet` | Get full content of a specific snippet by name |
| `ghl_browser_create_snippet` | Create a new content snippet with name and body |
| `ghl_browser_update_snippet` | Update the content of an existing snippet |
| `ghl_browser_delete_snippet` | Delete a content snippet (requires `confirm: true`) |

### Contact Scoring (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_scoring_models` | List scoring models with name, status, and rule count |
| `ghl_browser_get_scoring_model` | Get rules and criteria of a scoring model: points, conditions, thresholds |
| `ghl_browser_create_scoring_model` | Create a new contact scoring model with name and description |
| `ghl_browser_add_scoring_rule` | Add a scoring rule: field, condition, point value |
| `ghl_browser_get_contact_scores` | Get scoring results for a contact: model scores, total, breakdown |

### AI Superagents (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_superagents` | List AI Superagents with name, status, type, and last activity |
| `ghl_browser_get_superagent_details` | Get full config: prompts, knowledge base, channels, handoff settings |
| `ghl_browser_create_superagent` | Create a new AI Superagent with name and description |
| `ghl_browser_update_superagent` | Update system prompt, tone, or configuration |
| `ghl_browser_get_superagent_logs` | Get recent conversation logs for a Superagent |

### AI Employees (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_ai_employees` | List AI Employees with name, role, status, and assigned channels |
| `ghl_browser_get_ai_employee_details` | Get full config: role, skills, knowledge base, channels, handoff rules |
| `ghl_browser_create_ai_employee` | Create a new AI Employee with name and role description |
| `ghl_browser_update_ai_employee` | Update prompt, knowledge base, or channel assignments |
| `ghl_browser_toggle_ai_employee` | Enable or disable an AI Employee |

### Agent Builder (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_agent_blueprints` | List agent blueprints/templates in the Agent Builder |
| `ghl_browser_get_agent_blueprint` | Get blueprint details: steps, triggers, actions, prompts |
| `ghl_browser_create_agent_from_blueprint` | Create a new agent from an existing blueprint |
| `ghl_browser_get_agent_builder_config` | Open builder and return config: prompts, tools, knowledge |
| `ghl_browser_publish_agent` | Publish/deploy an agent from the builder |

### Agent Studio (4)

| Tool | Description |
|---|---|
| `ghl_browser_list_agent_studio_sessions` | List recent test/debug sessions with agent, status, timestamp |
| `ghl_browser_get_agent_studio_session` | Get full transcript and metrics from a test session |
| `ghl_browser_run_agent_test` | Run a test conversation against an agent |
| `ghl_browser_get_agent_studio_metrics` | Get performance metrics: response time, accuracy, satisfaction |

### Industry Agents (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_industry_agents` | List pre-built industry agents (real estate, dental, legal, etc.) |
| `ghl_browser_get_industry_agent_details` | Get details: features, prompts, channels, requirements |
| `ghl_browser_install_industry_agent` | Install an industry agent into the current sub-account |
| `ghl_browser_list_installed_industry_agents` | List industry agents currently installed |
| `ghl_browser_uninstall_industry_agent` | Remove an installed industry agent (requires `confirm: true`) |

### Location Settings (5)

| Tool | Description |
|---|---|
| `ghl_browser_get_location_settings` | Get full location settings: business info, timezone, currency, locale |
| `ghl_browser_update_location_settings` | Update a setting: timezone, currency, locale, phone format |
| `ghl_browser_get_location_features` | List feature toggles for the sub-account |
| `ghl_browser_toggle_location_feature` | Enable or disable a feature toggle |
| `ghl_browser_get_location_domains` | Get configured domains: custom domains, CNAME, SSL status |

### Ad Publishing (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_ad_campaigns` | List ad campaigns (Facebook/Google) with name, platform, status, budget, spend |
| `ghl_browser_get_ad_campaign_details` | Get detailed metrics and settings for a specific ad campaign |
| `ghl_browser_create_ad_campaign` | Create a new ad campaign on Facebook or Google |
| `ghl_browser_get_ad_metrics` | Get aggregate ad performance: impressions, clicks, CTR, spend, conversions |
| `ghl_browser_toggle_ad_campaign` | Enable or pause an ad campaign |

### Bulk Actions (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_bulk_operations` | List recent bulk operations with type, status, count, and date |
| `ghl_browser_get_bulk_operation_status` | Get the status and progress of a specific bulk operation |
| `ghl_browser_bulk_add_tag` | Add a tag to multiple contacts at once |
| `ghl_browser_bulk_remove_tag` | Remove a tag from multiple contacts at once |
| `ghl_browser_bulk_update_field` | Update a custom field value for multiple contacts at once |

### Chat Widget (5)

| Tool | Description |
|---|---|
| `ghl_browser_get_chat_widget_config` | Get current live chat widget config: enabled, colors, position, greeting |
| `ghl_browser_update_chat_widget` | Update chat widget settings: greeting, position, colors |
| `ghl_browser_toggle_chat_widget` | Enable or disable the live chat widget |
| `ghl_browser_get_chat_widget_code` | Get the embed code snippet for the chat widget |
| `ghl_browser_list_chat_widget_departments` | List departments/routing rules with agents and hours |

### Content AI (5)

| Tool | Description |
|---|---|
| `ghl_browser_get_content_ai_settings` | Get Content AI config: tone, brand voice, language, usage limits |
| `ghl_browser_list_content_ai_templates` | List writing templates by category (email, ad, social, blog) |
| `ghl_browser_generate_content_ai_text` | Generate AI content using a template and prompt |
| `ghl_browser_list_content_ai_history` | List recently generated outputs with template and date |
| `ghl_browser_get_content_ai_usage` | Get usage stats: credits used, remaining, content generated |

### Gift Cards (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_gift_cards` | List gift card products with denomination, status, inventory |
| `ghl_browser_get_gift_card_details` | Get details of a specific gift card product |
| `ghl_browser_create_gift_card` | Create a new gift card product with name and denomination |
| `ghl_browser_list_gift_card_transactions` | List purchase/redemption transactions |
| `ghl_browser_toggle_gift_card` | Activate or deactivate a gift card product |

### Preference Management (5)

| Tool | Description |
|---|---|
| `ghl_browser_get_preference_settings` | Get communication preference settings: opt-in defaults, channels |
| `ghl_browser_list_preference_categories` | List preference categories with channel settings |
| `ghl_browser_create_preference_category` | Create a new preference category |
| `ghl_browser_get_contact_preferences` | Get a contact's communication preferences across all categories |
| `ghl_browser_get_compliance_summary` | Get compliance summary: TCPA, GDPR, CAN-SPAM status |

### Reseller (5)

| Tool | Description |
|---|---|
| `ghl_browser_get_reseller_overview` | Get reseller program overview: plan, commission, clients, revenue |
| `ghl_browser_list_reseller_clients` | List reseller clients with plan, status, monthly revenue |
| `ghl_browser_get_reseller_client_details` | Get detailed info for a specific reseller client |
| `ghl_browser_get_reseller_pricing` | Get reseller pricing tiers and commission structure |
| `ghl_browser_list_reseller_invoices` | List reseller invoices with date, amount, status |

### SaaS Mode (5)

| Tool | Description |
|---|---|
| `ghl_browser_get_saas_overview` | Get SaaS overview: plan, pricing, active clients, MRR |
| `ghl_browser_list_saas_plans` | List subscription plans with price, features, subscriber count |
| `ghl_browser_create_saas_plan` | Create a new subscription plan with pricing and features |
| `ghl_browser_list_saas_clients` | List SaaS clients with plan, status, billing |
| `ghl_browser_get_saas_billing_summary` | Get billing summary: MRR, ARR, churn rate |

### Platform Billing (5)

| Tool | Description |
|---|---|
| `ghl_browser_get_platform_billing_overview` | Get billing overview: plan, cycle, next payment, balance |
| `ghl_browser_list_platform_invoices` | List platform-level invoices with date, amount, status |
| `ghl_browser_get_platform_payment_method` | Get payment method on file: card type, last 4, expiry |
| `ghl_browser_list_platform_usage` | Get usage breakdown: contacts, emails, SMS, storage |
| `ghl_browser_get_platform_plan_comparison` | Compare available plans with pricing and limits |

### Store Catalog (5)

| Tool | Description |
|---|---|
| `ghl_browser_list_store_products` | List products with name, price, inventory, category, status |
| `ghl_browser_get_store_product_details` | Get detailed information for a specific product |
| `ghl_browser_create_store_product` | Create a new product with name, price, description, category |
| `ghl_browser_list_store_categories` | List product categories with name and product count |
| `ghl_browser_get_store_orders_summary` | Get orders summary: total orders, revenue, pending, fulfilled |

### Utils (4)

| Tool | Description |
|---|---|
| `ghl_browser_screenshot` | Navigate to any GHL path and capture a PNG (saved to `./screenshots/`) |
| `ghl_browser_session_check` | Returns `{ authenticated: true/false }` against the GHL dashboard |
| `ghl_browser_logout` | Clear stored browser state (forces re-login on next tool call) |
| `ghl_browser_evaluate` | Run arbitrary JS in the page context (for ad-hoc scraping / debugging) |

### Discovery (3)

Network-capture tools used to discover undocumented GHL XHR endpoints. Feed
the discovered endpoints back into `ghl-mcp` as new REST tools.

Both network tools also capture **WebSocket frames** exchanged during the
observation window (`wsFrames` + `wsSummary` in the response), which is
where Firebase real-time updates would be delivered.

| Tool | Description |
|---|---|
| `ghl_browser_capture_network` | Navigate to a GHL path and capture every XHR/fetch request + WS frames |
| `ghl_browser_audit_api_calls` | Run a JS action and capture XHR/fetch + WS calls (listeners attach BEFORE navigation, so page-load calls are included) |
| `ghl_browser_extract_state` | Dump all `window.__*` globals and large inline `<script>` JSON blobs (SSR-embedded entity graph) |

See `discovery-results/FINDINGS.md` for the initial sweep results. Key
finding: the GHL SPA is server-rendered — pages embed data in the HTML
document rather than issuing separate REST calls to fetch it. Real-time
updates flow over Firebase; WebSocket capture is available for deeper
investigation.

## Endpoints NOT accessible via PIT

See the main `ghl-mcp` README for the list of REST-accessible endpoints. This
server exists specifically to cover the gaps that REST cannot reach.

## Known limitations

- DOM selectors are brittle; a GHL redeploy can break tools until updated.
- Each tool opens its own page within the shared browser context for isolation.
- Screenshots are written to `./screenshots/` on error for debugging.
- Concurrent tool calls are serialized (Playwright pages share a single tab focus).
