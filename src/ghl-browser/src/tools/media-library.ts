import { openPage, gotoGhl, waitForAppReady } from "../browser.js";
import type { ToolModule } from "../helpers.js";
import { withPageError, asString } from "../helpers.js";

export const mediaLibraryModule: ToolModule = {
  tools: [
    {
      name: "ghl_browser_list_media",
      description:
        "List files in the GHL media library. Returns file name, type, size, and URL.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Optional search term" },
          type: {
            type: "string",
            description: "Filter by type: 'all' (default), 'image', 'video', 'document', 'audio'",
          },
          folder: { type: "string", description: "Folder name to filter by" },
        },
      },
    },
    {
      name: "ghl_browser_upload_media",
      description:
        "Upload a file to the GHL media library from a local path or URL.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Local file path to upload" },
          fileUrl: { type: "string", description: "URL to import instead of local upload" },
          folder: { type: "string", description: "Target folder name" },
          altText: { type: "string", description: "Alt text for images" },
        },
      },
    },
    {
      name: "ghl_browser_get_media_details",
      description:
        "Get details of a specific media file: dimensions, URL, embed code, usage count.",
      inputSchema: {
        type: "object",
        properties: {
          fileName: { type: "string", description: "File name to search for" },
          fileId: { type: "string", description: "Media file ID (preferred)" },
        },
      },
    },
    {
      name: "ghl_browser_create_media_folder",
      description:
        "Create a new folder in the media library for organizing files.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Folder name" },
          parentFolder: { type: "string", description: "Parent folder name (optional)" },
        },
        required: ["name"],
      },
    },
    {
      name: "ghl_browser_delete_media",
      description:
        "Delete a media file. This action is irreversible.",
      inputSchema: {
        type: "object",
        properties: {
          fileName: { type: "string" },
          fileId: { type: "string" },
          confirm: { type: "boolean", description: "Must be true to proceed" },
        },
        required: ["confirm"],
      },
    },
  ],
  handlers: {
    ghl_browser_list_media: async (args) => {
      const search = asString(args.search);
      const type = asString(args.type) || "all";
      const folder = asString(args.folder);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "media-list", async () => {
          await gotoGhl(page, "/media");
          await waitForAppReady(page);

          if (folder) {
            const folderItem = page
              .locator(`[class*="folder"]:has-text("${folder}"), a:has-text("${folder}"), [class*="Folder"]:has-text("${folder}")`)
              .first();
            try {
              await folderItem.click({ timeout: 5000 });
              await page.waitForTimeout(1000);
            } catch {
              // folder may not exist
            }
          }

          if (search) {
            const searchInput = page
              .locator('input[placeholder*="Search"], input[type="search"]')
              .first();
            try {
              await searchInput.fill(search, { timeout: 5000 });
              await page.waitForTimeout(1000);
            } catch {
              // search not available
            }
          }

          if (type !== "all") {
            const typeFilter = page
              .locator(`button:has-text("${type}"), [class*="filter"]:has-text("${type}"), [class*="tab"]:has-text("${type}")`)
              .first();
            try {
              await typeFilter.click({ timeout: 5000 });
              await page.waitForTimeout(1000);
            } catch {
              // type filter may not exist
            }
          }

          const files = await page.evaluate(() => {
            const items: Array<{
              name: string;
              type: string;
              size: string;
              url: string;
              thumbnail: string;
              id: string;
            }> = [];
            const cardSelectors = [
              '[class*="MediaCard"]',
              '[class*="media-card"]',
              '[class*="FileCard"]',
              '[class*="file-item"]',
              '[class*="FileItem"]',
              '[class*="gallery-item"]',
              '[class*="GridItem"]',
            ];
            for (const sel of cardSelectors) {
              document.querySelectorAll(sel).forEach((el) => {
                const nameEl = el.querySelector(
                  "[class*='name'], [class*='Name'], [class*='title'], span, p",
                );
                const typeEl = el.querySelector(
                  "[class*='type'], [class*='Type'], [class*='ext'], [class*='badge']",
                );
                const sizeEl = el.querySelector(
                  "[class*='size'], [class*='Size']",
                );
                const imgEl = el.querySelector("img");
                const linkEl = el.querySelector("a[href]");
                const id = el.getAttribute("data-id") || el.getAttribute("data-file-id") || "";
                items.push({
                  name: nameEl?.textContent?.trim() || "",
                  type: typeEl?.textContent?.trim() || (imgEl ? "image" : ""),
                  size: sizeEl?.textContent?.trim() || "",
                  url: linkEl?.getAttribute("href") || imgEl?.getAttribute("src") || "",
                  thumbnail: imgEl?.getAttribute("src") || "",
                  id,
                });
              });
            }

            if (items.length === 0) {
              document.querySelectorAll("table tr, [class*='row']").forEach((el) => {
                const nameEl = el.querySelector("td:first-child, [class*='name']");
                if (nameEl?.textContent?.trim()) {
                  items.push({
                    name: nameEl.textContent.trim(),
                    type: el.querySelector("td:nth-child(2)")?.textContent?.trim() || "",
                    size: el.querySelector("td:nth-child(3)")?.textContent?.trim() || "",
                    url: el.querySelector("a")?.getAttribute("href") || "",
                    thumbnail: "",
                    id: el.getAttribute("data-row-key") || "",
                  });
                }
              });
            }

            return items;
          });

          const deduped = Array.from(
            new Map(files.map((f) => [f.id || f.name, f])).values(),
          );
          return { count: deduped.length, files: deduped };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_upload_media: async (args) => {
      const filePath = asString(args.filePath);
      const fileUrl = asString(args.fileUrl);
      const folder = asString(args.folder);
      const altText = asString(args.altText);
      if (!filePath && !fileUrl) throw new Error("filePath or fileUrl is required");

      const { page, close } = await openPage();
      try {
        return await withPageError(page, "media-upload", async () => {
          await gotoGhl(page, "/media");
          await waitForAppReady(page);

          if (folder) {
            const folderItem = page
              .locator(`[class*="folder"]:has-text("${folder}"), a:has-text("${folder}")`)
              .first();
            try {
              await folderItem.click({ timeout: 5000 });
              await page.waitForTimeout(1000);
            } catch {
              // folder may not exist
            }
          }

          const uploadBtn = page
            .locator('button:has-text("Upload"), button:has-text("Add"), input[type="file"]')
            .first();

          if (filePath) {
            const fileInput = page.locator('input[type="file"]').first();
            try {
              await fileInput.setInputFiles(filePath, { timeout: 5000 });
            } catch {
              await uploadBtn.click({ timeout: 5000 });
              await page.waitForTimeout(500);
              const hiddenInput = page.locator('input[type="file"]').first();
              await hiddenInput.setInputFiles(filePath, { timeout: 10000 });
            }
            await page.waitForTimeout(3000);
          } else if (fileUrl) {
            const importBtn = page
              .locator('button:has-text("Import"), button:has-text("URL"), button:has-text("From URL")')
              .first();
            try {
              await importBtn.click({ timeout: 5000 });
              await page.waitForTimeout(1000);
              const urlInput = page.locator('input[type="url"], input[placeholder*="URL"]').first();
              await urlInput.fill(fileUrl, { timeout: 5000 });
              const confirmBtn = page.locator('button:has-text("Import"), button:has-text("Add")').first();
              await confirmBtn.click({ timeout: 5000 });
            } catch {
              throw new Error("URL import not supported in current media library view");
            }
            await page.waitForTimeout(3000);
          }

          if (altText) {
            const altInput = page
              .locator('input[name="alt"], input[placeholder*="Alt"], input[placeholder*="alt"]')
              .first();
            try {
              await altInput.fill(altText, { timeout: 3000 });
            } catch {
              // alt text may need to be set after upload
            }
          }

          return { filePath: filePath || null, fileUrl: fileUrl || null, folder: folder || null, altText: altText || null, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_get_media_details: async (args) => {
      const name = asString(args.fileName);
      const id = asString(args.fileId);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "media-details", async () => {
          if (id) {
            await gotoGhl(page, `/media/${id}`);
          } else if (name) {
            await gotoGhl(page, "/media");
            await waitForAppReady(page);
            const searchInput = page.locator('input[placeholder*="Search"]').first();
            try {
              await searchInput.fill(name, { timeout: 5000 });
              await page.waitForTimeout(1000);
            } catch {
              // search not available
            }
            const card = page
              .locator(`[class*="card"]:has-text("${name}"), [class*="item"]:has-text("${name}"), a:has-text("${name}")`)
              .first();
            await card.click({ timeout: 5000 });
          } else {
            throw new Error("fileName or fileId is required");
          }
          await waitForAppReady(page);
          await page.waitForTimeout(2000);

          const details = await page.evaluate(() => {
            const info: Record<string, string> = {};
            document.querySelectorAll("input, [class*='info'] span, dt, dd, label + span").forEach((el) => {
              const input = el as HTMLInputElement;
              const label =
                input.getAttribute("name") ||
                input.getAttribute("placeholder") ||
                el.closest("dt")?.textContent?.trim() ||
                "";
              const value = input.value || el.textContent?.trim() || "";
              if (label && value && value.length < 500) info[label] = value;
            });

            const previewImg = document.querySelector('[class*="preview"] img, img[class*="preview"]');
            const urlInput = document.querySelector('input[value*="http"]');
            const embedCode = document.querySelector("textarea, code, pre");

            return {
              title: document.querySelector("h1, h2, [class*='title']")?.textContent?.trim() || "",
              info,
              previewUrl: previewImg?.getAttribute("src") || "",
              fileUrl: (urlInput as HTMLInputElement)?.value || "",
              embedCode: embedCode?.textContent?.trim() || "",
            };
          });

          return {
            fileId: id || null,
            fileName: name || details.title || null,
            info: details.info,
            previewUrl: details.previewUrl,
            fileUrl: details.fileUrl,
            embedCode: details.embedCode,
            url: page.url(),
          };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_create_media_folder: async (args) => {
      const name = asString(args.name);
      const parentFolder = asString(args.parentFolder);
      const { page, close } = await openPage();
      try {
        return await withPageError(page, "media-create-folder", async () => {
          await gotoGhl(page, "/media");
          await waitForAppReady(page);

          if (parentFolder) {
            const parent = page
              .locator(`[class*="folder"]:has-text("${parentFolder}"), a:has-text("${parentFolder}")`)
              .first();
            try {
              await parent.click({ timeout: 5000 });
              await page.waitForTimeout(1000);
            } catch {
              // parent folder may not exist
            }
          }

          const newFolderBtn = page
            .locator('button:has-text("New Folder"), button:has-text("Create Folder"), button:has-text("Add Folder")')
            .first();
          try {
            await newFolderBtn.click({ timeout: 5000 });
          } catch {
            const menuBtn = page
              .locator('button:has-text("⋮"), button:has-text("⋯"), [class*="more"]')
              .first();
            await menuBtn.click({ timeout: 5000 });
            await page.waitForTimeout(500);
            await page.locator('text="New Folder", text="Create Folder"').first().click({ timeout: 5000 });
          }
          await page.waitForTimeout(1000);

          const nameInput = page
            .locator('input[name="name"], input[placeholder*="Folder"], input[placeholder*="name"]')
            .first();
          await nameInput.fill(name);

          const saveBtn = page
            .locator('button:has-text("Save"), button:has-text("Create"), button:has-text("OK")')
            .first();
          await saveBtn.click({ timeout: 5000 });
          await page.waitForTimeout(1000);

          return { name, parentFolder: parentFolder || null, url: page.url() };
        });
      } finally {
        await close();
      }
    },

    ghl_browser_delete_media: async (args) => {
      const name = asString(args.fileName);
      const id = asString(args.fileId);
      const confirm = Boolean(args.confirm);
      if (!confirm) throw new Error("confirm must be true to delete a media file");
      if (!name && !id) throw new Error("fileName or fileId is required");

      const { page, close } = await openPage();
      try {
        return await withPageError(page, "media-delete", async () => {
          await gotoGhl(page, "/media");
          await waitForAppReady(page);

          if (name) {
            const searchInput = page.locator('input[placeholder*="Search"]').first();
            try {
              await searchInput.fill(name, { timeout: 5000 });
              await page.waitForTimeout(1000);
            } catch {
              // search not available
            }
          }

          const rowSelector = id
            ? `[data-id="${id}"], [data-file-id="${id}"]`
            : `[class*="card"]:has-text("${name}"), [class*="item"]:has-text("${name}")`;

          const row = page.locator(rowSelector).first();

          const menuBtn = row
            .locator('button:has-text("⋮"), button:has-text("⋯"), [class*="menu"], [class*="actions"] button')
            .first();
          try {
            await menuBtn.click({ timeout: 5000 });
            await page.waitForTimeout(500);
          } catch {
            // try right-click or select first
            await row.click({ button: "right", timeout: 5000 });
            await page.waitForTimeout(500);
          }

          const deleteOption = page
            .locator('text="Delete", text="delete", [class*="delete"]')
            .first();
          await deleteOption.click({ timeout: 5000 });
          await page.waitForTimeout(500);

          const confirmBtn = page
            .locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")')
            .first();
          await confirmBtn.click({ timeout: 5000 });
          await waitForAppReady(page);

          return { fileName: name, fileId: id, deleted: true };
        });
      } finally {
        await close();
      }
    },
  },
};
