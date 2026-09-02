## Oracle AWR in action

Here is an example of an AWR report generated using the `orcl-awr` tool, followed by an analysis of the top SQL statements.

**Sample prompts**:
- Generate a performance report using orcl-awr
- find top 5 sql statement by IO and CPU from above awr report
- Model Gemini 3 Pro (High)

### AWR Report Summary

**Snapshot Period:**
- **Begin:** 30-Nov-25 13:58:49
- **End:** 30-Nov-25 14:58:45
- **Duration:** ~60 minutes

**Load Profile:**
- **DB Time:** 78 minutes (higher than elapsed time, indicating concurrency)
- **Logical Reads:** ~133k blocks/sec (High memory activity)
- **Physical Reads:** ~17.6 blocks/sec (Low disk I/O, good caching)

**🚨 Critical Finding:**
- **Failed Logon Delay** is the dominant wait event across almost all time slots.
- It accounts for a significant portion of database activity (e.g., ~9% of events in multiple 5-minute windows).
- This confirms the earlier manual analysis: there is a persistent issue with failed login attempts (likely a brute force attack or misconfigured application loop).

**Performance Health:**
- **CPU Usage:** Low (0.1s per second)
- **I/O:** Very low write activity, moderate read requests
- **Memory:** High logical reads indicate active buffer cache usage

### Top 5 SQL by CPU Usage

1.  **`b6usrg82hwsa3`** - **DBMS_STATS Gathering**
    *   **CPU:** 1,420.87s
    *   **Executions:** 7
    *   **Activity:** `call dbms_stats.gather_database_stats_job_proc ( )`
    *   **Insight:** This is the automated background job for gathering optimizer statistics. It is the heaviest consumer of CPU, which is expected during maintenance windows.

2.  **`2a5bjk27jynyk`** - **Optimizer Snapshot Insert**
    *   **CPU:** 360.43s
    *   **Executions:** 91
    *   **Activity:** `insert /* KSXM:TAKE_SNPSHOT */ into sys.optstat_snapshot$...`
    *   **Insight:** Related to the stats gathering process, tracking changes in table statistics.

3.  **`b39m8n96gxk7c`** - **Auto Task Execution**
    *   **CPU:** 64.23s
    *   **Executions:** 259
    *   **Activity:** `call dbms_autotask_prvt.run_autotask ( :0,:1 )`
    *   **Insight:** The scheduler framework running automated maintenance tasks.

4.  **`ampw9ddqufjd3`** - **Auto Index Capture**
    *   **CPU:** 62.64s
    *   **Executions:** 248
    *   **Activity:** `begin /*KAPI:capture*/ dbms_auto_index_internal.capture_sts; end;`
    *   **Insight:** Oracle 23c's Automatic Indexing feature monitoring the workload.

5.  **`avzy19hxu6gg4`** - **SQL Tuning Advisor**
    *   **CPU:** 52.08s
    *   **Executions:** 248
    *   **Activity:** `SELECT VALUE(P) FROM TABLE(DBMS_SQLTUNE.SELECT_CURSOR_CACHE...`
    *   **Insight:** Internal job analyzing the cursor cache for tuning opportunities.

### Top 5 SQL by Physical I/O (Disk Reads)

1.  **`b6usrg82hwsa3`** - **DBMS_STATS Gathering** (Same as #1 CPU)
    *   **Disk Reads:** 392,534
    *   **Insight:** Heaviest I/O consumer as well, scanning tables to compute statistics.

2.  **`cfcbdfqr6r86d`** - **Stats Operation Update**
    *   **Disk Reads:** 13,132
    *   **Activity:** `UPDATE ... SYS.WRI$_OPTSTAT_OPR_TASKS...`
    *   **Insight:** Updating the status of statistics operations.

3.  **`4k6u2pfqy4vyw`** - **Wait Class Snapshot**
    *   **Disk Reads:** 9,414
    *   **Activity:** `SELECT ... "SNAP_ID","WAIT_CLASS"...`
    *   **Insight:** Querying wait class history, likely for AWR or performance monitoring views.

4.  **`1fm07xd16u5nr`** - **Stats Task Insert**
    *   **Disk Reads:** 8,231
    *   **Activity:** `insert /* QOSH:REC_STS */ into sys.wri$_optstat_opr_tasks...`
    *   **Insight:** Logging statistics operations.

5.  **`b39m8n96gxk7c`** - **Auto Task Execution** (Same as #3 CPU)
    *   **Disk Reads:** 7,627
    *   **Insight:** Maintenance tasks performing moderate I/O.

### Summary
The database workload is currently dominated by **internal maintenance tasks**, specifically **Optimizer Statistics Gathering** (`dbms_stats`) and **Automatic Indexing** monitoring. There is no significant user workload visible in the top 5 consumers, which aligns with the "Failed Logon Delay" wait event seen earlier—external users are failing to connect, so they aren't generating SQL load!
