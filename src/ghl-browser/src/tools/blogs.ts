import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError } from "../helpers.js";

export const blogsModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_blogs",
      description: "List blog sites and their post counts.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ghl_browser_create_blog_post",
      description: "Create a blog post (draft or publish) with title, body, and optional image URL.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string", description: "HTML or plain-text body" },
          imageUrl: { type: "string" },
          publish: { type: "boolean", description: "If true, publish immediately; else save as draft" },
        },
        required: ["title", "body"],
      },
    },
    {
      name: "ghl_browser_update_blog_post",
      description: "Update the title/body of a blog post and save.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Existing post title (used to find the row)" },
          newTitle: { type: "string" },
          newBody: { type: "string" },
          publish: { type: "boolean" },
        },
        required: ["title"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_blogs: async () => {
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "blogs-list", async () => {
          await gotoGhl(page, "/sites/blogs");
          await waitForAppReady(page);
          const rows = await page.evaluate(() => {
            const items: Array<{ name: string; postCount: string; url: string }> = [];
            document
              .querySelectorAll('[class*="blog"], [data-testid*="blog"]')
              .forEach((el) => {
                const a = el.closest("a") as HTMLAnchorElement | null;
                const nameEl = el.querySelector("h3, h4, [class*='name']");
                const countEl = el.querySelector('[class*="count"]');
                const text = el.textContent?.slice(0, 120) || "";
                if (nameEl || text.length > 3) {
                  items.push({
                    name: nameEl?.textContent?.trim() || text.trim().slice(0, 80),
                    postCount: countEl?.textContent?.trim() || "",
                    url: a?.href || "",
                  });
                }
              });
            return items;
          });
          return { count: rows.length, rows };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_blog_post: async (args) => {
      const title = String(args.title);
      const body = String(args.body);
      const imageUrl = args.imageUrl as string | undefined;
      const publish = Boolean(args.publish);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "blogs-create", async () => {
          await gotoGhl(page, "/sites/blogs");
          await waitForAppReady(page);
          const newBtn = page.locator('button:has-text("New Post"), button:has-text("Create")').first();
          await newBtn.click();
          await waitForAppReady(page);
          const titleInput = page.locator('input[name="title"], input[placeholder*="Title"]').first();
          await titleInput.fill(title);
          const bodyEditor = page.locator('[contenteditable="true"], .ProseMirror, textarea').first();
          await bodyEditor.fill(body);
          if (imageUrl) {
            try {
              await page.locator('button:has-text("Image"), [aria-label*="image"]').first().click({ timeout: 2000 });
              await page.locator('input[type="url"], input[placeholder*="URL"]').first().fill(imageUrl, { timeout: 2000 });
            } catch {
              // image step optional
            }
          }
          const saveBtn = publish
            ? page.locator('button:has-text("Publish")').first()
            : page.locator('button:has-text("Save"), button:has-text("Draft")').first();
          await saveBtn.click();
          await waitForAppReady(page);
          return { title, published: publish, imageUrl: imageUrl || null, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_update_blog_post: async (args) => {
      const title = String(args.title);
      const newTitle = args.newTitle as string | undefined;
      const newBody = args.newBody as string | undefined;
      const publish = Boolean(args.publish);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "blogs-update", async () => {
          await gotoGhl(page, "/sites/blogs");
          await waitForAppReady(page);
          await page.locator(`a:has-text("${title}"), [class*="row"]:has-text("${title}")`).first().click();
          await waitForAppReady(page);
          if (newTitle) {
            const titleInput = page.locator('input[name="title"]').first();
            await titleInput.fill(newTitle);
          }
          if (newBody) {
            const bodyEditor = page.locator('[contenteditable="true"], .ProseMirror, textarea').first();
            await bodyEditor.fill(newBody);
          }
          const saveBtn = publish
            ? page.locator('button:has-text("Publish")').first()
            : page.locator('button:has-text("Save")').first();
          await saveBtn.click();
          await waitForAppReady(page);
          return { originalTitle: title, newTitle: newTitle || null, published: publish, url: page.url() };
        });
      } finally {
        await close();
      }
    },
  },
};
