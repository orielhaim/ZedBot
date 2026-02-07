import {
    createDeepAgent,
    FilesystemBackend,
    CompositeBackend,
    StateBackend,
    StoreBackend,
} from "deepagents";
import { MemorySaver, Command } from "@langchain/langgraph";
import { SqliteSaver } from "./lch-sqlite";
import { InMemoryStore } from "@langchain/langgraph-checkpoint";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import path from "path";
import { tool, summarizationMiddleware } from "langchain";
import { z } from "zod";
import * as readline from "readline";
import { Database } from "bun:sqlite";

export function bunAsBetterSqlite(db: Database) {
    const originalPrepare = db.prepare.bind(db);
    const originalClose = db.close.bind(db);
    const originalRun = db.run.bind(db);

    (db as any).pragma = (s: string) => {
        const sql = s.trim().toUpperCase().startsWith("PRAGMA") ? s : `PRAGMA ${s}`;
        originalRun(sql.endsWith(";") ? sql : sql + ";");
    };

    (db as any).exec = (sql: string) => {
        const parts = sql.split(";").map(x => x.trim()).filter(Boolean);
        for (const part of parts) originalRun(part + ";");
    };

    (db as any).prepare = (sql: string) => {
        const stmt = originalPrepare(sql);
        return {
            run: (...params: any[]) => stmt.run(...params),
            all: (...params: any[]) => stmt.all(...params),
            get: (...params: any[]) => {
                const r = stmt.get(...params);
                return r === null ? undefined : r; // normalize for better-sqlite3 behavior
            },
            // אם צריך:
            // iterate: (...params:any[]) => stmt.iterate(...params),
        };
    };

    (db as any).close = () => originalClose();

    return db as any;
}

const raw = new Database("my.db");

const llm = new ChatOpenAI({
    model: "mistralai/ministral-3-14b-reasoning",
    temperature: 0.5,
    apiKey: "",
    configuration: {
        baseURL: "http://127.0.0.1:1234/v1",
    },
});

const embd = new OpenAIEmbeddings({
    model: "text-embedding-embeddinggemma-300m",
    apiKey: "",
    configuration: {
        baseURL: "http://127.0.0.1:1234/v1",
    },
})

// const store = new InMemoryStore({
//   index: {
//     embeddings: new OpenAIEmbeddings({
//     model: "text-embedding-embeddinggemma-300m",
//     apiKey: "",
//     configuration: {
//         baseURL: "http://127.0.0.1:1234/v1",
//     },
// }),
//     fields: ["content"], // השדה שיעבור ווקטוריזציה
//   },
// });

// 3. הגדרת דחיסה אוטומטית (Summarization)
const compression = summarizationMiddleware({
    model: embd,
    trigger: { tokens: 1000 },
    keep: { messages: 3 },
});

const deleteFile = tool(
    async ({ path }: { path: string }) => {
        return `Deleted ${path}`;
    },
    {
        name: "delete_file",
        description: "Delete a file from the filesystem.",
        schema: z.object({
            path: z.string(),
        }),
    },
);

const sendEmail = tool(
    async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
        return `Sent email to ${to}`;
    },
    {
        name: "send_email",
        description: "Send an email.",
        schema: z.object({
            to: z.string(),
            subject: z.string(),
            body: z.string(),
        }),
    },
);

const MEMORY_DIR = path.resolve(process.cwd(), "memories");

// const checkpointer = new MemorySaver();
const checkpointer = new SqliteSaver(bunAsBetterSqlite(raw));
const agent = await createDeepAgent({
    model: llm,
    tools: [deleteFile, sendEmail],
    interruptOn: {
        delete_file: true,  // Default: approve, edit, reject
        read_file: false,   // No interrupts needed
        send_email: { allowedDecisions: ["approve", "reject"] },  // No editing
    },
        // store: new InMemoryStore(),
    backend: (rt) => new CompositeBackend(
        // 1. ברירת מחדל: זיכרון זמני ב-State (עבור לוגים/טיוטות)
        new StateBackend(rt),
        {
            // 2. גישה לקוד המקור שלך (הסניפט שלך)
            //   "/src/": new FilesystemBackend({
            //     rootDir: path.resolve(process.cwd(), "src"),
            //     virtualMode: true
            //   }),
            // 3. זיכרון עמיד שנשמר בבסיס נתונים
            "/memories/": new FilesystemBackend({
                rootDir: MEMORY_DIR,
                virtualMode: true // חשוב לאבטחה וניהול נתיבים תקין
            })
        }
    ),
    skills: ["skills"],
    checkpointer,
    systemPrompt: `You are a smart helper. Always use available skills like langgraph-docs if available.

    Don't finish until you have a complete answer. Use write_todos for multiple loops.
    
    to save memories, write them to the directory /memories/`,
});

const config = {
    configurable: {
        thread_id: `thread-${Date.now()}`,
    },
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query: string) => new Promise<string>((resolve) => rl.question(query, resolve));

async function run() {
    let inputs: any = {
        messages: [{
            role: "user",
            content: "check the memories to see what do you remmember",
        }]
    };

    let result = await agent.invoke(inputs, config);

    while (true) {
        if (result && result.__interrupt__) {
            const interrupts = result.__interrupt__[0].value;
            const actionRequests = interrupts.actionRequests;
            const reviewConfigs = interrupts.reviewConfigs;
            const configMap = Object.fromEntries(
                reviewConfigs.map((cfg: any) => [cfg.actionName, cfg])
            );

            console.log("\n--- Interrupt Detected ---");
            const decisions = [];

            for (const action of actionRequests) {
                const reviewConfig = configMap[action.name];
                console.log(`\nTool: ${action.name}`);
                console.log(`Arguments: ${JSON.stringify(action.args, null, 2)}`);
                console.log(`Allowed decisions: ${reviewConfig.allowedDecisions.join(", ")}`);

                let decision = null;
                while (!decision) {
                    const answer = await askQuestion(`Decision (approve/reject/edit): `);
                    const type = answer.trim().toLowerCase();

                    if (type === "approve") {
                        decision = { type: "approve" };
                    } else if (type === "reject") {
                        decision = { type: "reject" };
                    } else if (type === "edit") {
                        if (!reviewConfig.allowedDecisions.includes("edit")) {
                            console.log("Edit not allowed for this tool.");
                            continue;
                        }
                        const newArgsStr = await askQuestion("Enter new arguments (JSON): ");
                        try {
                            const newArgs = JSON.parse(newArgsStr);
                            decision = {
                                type: "edit",
                                editedAction: { name: action.name, args: newArgs }
                            };
                        } catch (e) {
                            console.log("Invalid JSON.");
                        }
                    } else {
                        console.log("Invalid decision. Please choose 'approve', 'reject', or 'edit' (if allowed).");
                    }
                }
                decisions.push(decision);
            }

            result = await agent.invoke(
                new Command({ resume: { decisions } }),
                config
            );
        } else {
            const lastMsg = result.messages[result.messages.length - 1];
            if (lastMsg) {
                console.log("\n[Final Output]:", lastMsg.content);
            }
            break;
        }
    }
    rl.close();
}

run().catch(console.error);
