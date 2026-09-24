import { runDemo } from "./demo.js";

runDemo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
