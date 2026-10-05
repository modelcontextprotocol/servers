---
"@modelcontextprotocol/server-memory": patch
---

`create_entities` now reports the entities it skipped because their name already exists (or repeats earlier in the same call): the structured result lists them in a new optional `skipped` array, a second text item names them and points to `add_observations`, and the tool description says so. Skipped entities are still not created and their observations are still not added (#4887).
