import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { workflowsModule } from "./workflows.js";
import { funnelsModule } from "./funnels.js";
import { pipelinesModule } from "./pipelines.js";
import { campaignsModule } from "./campaigns.js";
import { socialModule } from "./social.js";
import { blogsModule } from "./blogs.js";
import { utilsModule } from "./utils.js";
import { discoveryModule } from "./discovery.js";
import { formBuilderModule } from "./form-builder.js";
import { emailBuilderModule } from "./email-builder.js";
import { pageBuilderModule } from "./page-builder.js";
import { proposalsModule } from "./proposals.js";
import { calendarConfigModule } from "./calendar-config.js";
import { reportingModule } from "./reporting.js";
import { membershipModule } from "./memberships.js";
import { invoiceModule } from "./invoices.js";
import { reputationModule } from "./reputation.js";
import { affiliateModule } from "./affiliates.js";
import { settingsModule } from "./settings.js";
import { triggerLinksModule } from "./trigger-links.js";
import { snapshotModule } from "./snapshots.js";
import { conversationAiModule } from "./conversation-ai.js";
import { mediaLibraryModule } from "./media-library.js";
import { tagsFieldsModule } from "./tags-fields.js";
import { automationTemplatesModule } from "./automation-templates.js";
import { conversationsModule } from "./conversations.js";
import { contactsModule } from "./contacts.js";
import { documentsModule } from "./documents.js";
import { paymentsModule } from "./payments.js";
import { ecommerceModule } from "./ecommerce.js";
import { eventsModule } from "./events.js";
import { communitiesModule } from "./communities.js";
import { copilotModule } from "./copilot.js";
import { customObjectsModule } from "./custom-objects.js";
import { notificationsModule } from "./notifications.js";
import { voiceAiModule } from "./voice-ai.js";
import { powerDialerModule } from "./power-dialer.js";
import { performanceAiModule } from "./performance-ai.js";
import { agencyModule } from "./agency.js";
import { dashboardWidgetsModule } from "./dashboard-widgets.js";
import { calendarBookingsModule } from "./calendar-bookings.js";
import { seoModule } from "./seo.js";
import { snippetsModule } from "./snippets.js";
import { contactScoringModule } from "./contact-scoring.js";
import type { ToolHandler, ToolModule } from "../helpers.js";

const allModules: ToolModule[] = [
  workflowsModule,
  funnelsModule,
  pipelinesModule,
  campaignsModule,
  socialModule,
  blogsModule,
  utilsModule,
  discoveryModule,
  formBuilderModule,
  emailBuilderModule,
  pageBuilderModule,
  proposalsModule,
  calendarConfigModule,
  reportingModule,
  membershipModule,
  invoiceModule,
  reputationModule,
  affiliateModule,
  settingsModule,
  triggerLinksModule,
  snapshotModule,
  conversationAiModule,
  mediaLibraryModule,
  tagsFieldsModule,
  automationTemplatesModule,
  conversationsModule,
  contactsModule,
  documentsModule,
  paymentsModule,
  ecommerceModule,
  eventsModule,
  communitiesModule,
  copilotModule,
  customObjectsModule,
  notificationsModule,
  voiceAiModule,
  powerDialerModule,
  performanceAiModule,
  agencyModule,
  dashboardWidgetsModule,
  calendarBookingsModule,
  seoModule,
  snippetsModule,
  contactScoringModule,
];

export const TOOLS: Tool[] = allModules.flatMap((m) => m.tools);

export const TOOL_HANDLERS: Record<string, ToolHandler> = Object.assign(
  {},
  ...allModules.map((m) => m.handlers),
);
