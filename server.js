const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DynamoDBClient, DescribeTableCommand, CreateTableCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const PORT = Number(process.env.PORT || 4173);
const TABLE_NAME = "Students";
const APP_DIR = __dirname;
const allowedClasses = new Set(["1年A組", "1年B組", "2年A組", "3年B組"]);
const allowedStatuses = new Set(["在籍", "休学中"]);
const demoStudents = [
  { id: "A2026001", name: "佐藤 葵", className: "1年A組", email: "aoi.sato@example.jp", attendance: 98, status: "在籍", color: "#eeeaff", ink: "#7558d8" },
  { id: "A2026002", name: "鈴木 蓮", className: "1年A組", email: "ren.suzuki@example.jp", attendance: 96, status: "在籍", color: "#e5f4ef", ink: "#419978" },
  { id: "A2026003", name: "高橋 結衣", className: "1年B組", email: "yui.takahashi@example.jp", attendance: 100, status: "在籍", color: "#fff0e5", ink: "#cb8050" },
  { id: "A2025008", name: "田中 悠真", className: "2年A組", email: "yuma.tanaka@example.jp", attendance: 91, status: "在籍", color: "#eaf0ff", ink: "#5a79c9" },
  { id: "A2025009", name: "伊藤 さくら", className: "2年A組", email: "sakura.ito@example.jp", attendance: 97, status: "在籍", color: "#fbeaf0", ink: "#c2678e" },
  { id: "A2025010", name: "渡辺 陽斗", className: "2年A組", email: "haruto.watanabe@example.jp", attendance: 88, status: "在籍", color: "#fff4dd", ink: "#ba8c31" },
  { id: "A2024004", name: "山本 美月", className: "3年B組", email: "mizuki.yamamoto@example.jp", attendance: 95, status: "在籍", color: "#e6f3f8", ink: "#4387a1" },
  { id: "A2024005", name: "中村 大翔", className: "3年B組", email: "hiroto.nakamura@example.jp", attendance: 0, status: "休学中", color: "#f0edf5", ink: "#80748f" },
];

if (!process.env.AWS_ENDPOINT_URL || !process.env.AWS_SHARED_CREDENTIALS_FILE || !process.env.NODE_EXTRA_CA_CERTS) {
  throw new Error("AWS Emulator variables are missing. Start the server with .\\start.ps1.");
}

const lowLevelClient = new DynamoDBClient({
  endpoint: process.env.AWS_ENDPOINT_URL,
  region: process.env.AWS_REGION || "us-east-1",
  disableHostPrefix: true,
});
const db = DynamoDBDocumentClient.from(lowLevelClient, { marshallOptions: { removeUndefinedValues: true } });

async function ensureTable() {
  let created = false;
  try {
    await lowLevelClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") throw error;
    await lowLevelClient.send(new CreateTableCommand({
      TableName: TABLE_NAME,
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }));
    created = true;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const result = await lowLevelClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
      if (result.Table?.TableStatus === "ACTIVE") break;
    } catch (error) {
      if (error.name !== "ResourceNotFoundException") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (created) {
    for (const student of demoStudents) {
      await db.send(new PutCommand({ TableName: TABLE_NAME, Item: student }));
    }
    console.log(`Created DynamoDB table ${TABLE_NAME} and loaded ${demoStudents.length} sample records.`);
  }
}

function sendJson(response, statusCode, body) {
  const text = JSON.stringify(body);
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(text), "cache-control": "no-store" });
  response.end(text);
}

async function readJson(request) {
  let data = "";
  for await (const chunk of request) {
    data += chunk;
    if (data.length > 1_000_000) throw Object.assign(new Error("リクエストが大きすぎます"), { statusCode: 413 });
  }
  try {
    return JSON.parse(data || "{}");
  } catch {
    throw Object.assign(new Error("JSONの形式が正しくありません"), { statusCode: 400 });
  }
}

function validateStudent(input) {
  const student = {
    id: String(input.id || "").trim(),
    name: String(input.name || "").trim(),
    className: String(input.className || ""),
    email: String(input.email || "").trim(),
    status: String(input.status || "在籍"),
  };
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(student.id)) throw Object.assign(new Error("学籍番号は半角英数字で3〜32文字にしてください"), { statusCode: 400 });
  if (student.name.length < 1 || student.name.length > 80) throw Object.assign(new Error("氏名を入力してください"), { statusCode: 400 });
  if (!allowedClasses.has(student.className)) throw Object.assign(new Error("クラスを選択してください"), { statusCode: 400 });
  if (!allowedStatuses.has(student.status)) throw Object.assign(new Error("ステータスが正しくありません"), { statusCode: 400 });
  if (student.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) throw Object.assign(new Error("メールアドレスの形式が正しくありません"), { statusCode: 400 });
  return student;
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/health" && request.method === "GET") {
    const result = await lowLevelClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    return sendJson(response, 200, { status: "ok", service: "AWS Emulator / DynamoDB", endpoint: process.env.AWS_ENDPOINT_URL, table: TABLE_NAME, tableStatus: result.Table?.TableStatus });
  }

  if (url.pathname === "/api/students" && request.method === "GET") {
    const result = await db.send(new ScanCommand({ TableName: TABLE_NAME }));
    const students = (result.Items || []).sort((a, b) => a.id.localeCompare(b.id, "ja"));
    return sendJson(response, 200, students);
  }

  if (url.pathname === "/api/students" && request.method === "POST") {
    const input = validateStudent(await readJson(request));
    try {
      await db.send(new PutCommand({ TableName: TABLE_NAME, Item: { ...input, attendance: 100, color: "#eeeaff", ink: "#7558d8" }, ConditionExpression: "attribute_not_exists(id)" }));
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException") throw Object.assign(new Error("この学籍番号はすでに登録されています"), { statusCode: 409 });
      throw error;
    }
    return sendJson(response, 201, input);
  }

  const match = url.pathname.match(/^\/api\/students\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (request.method === "PUT") {
      const input = validateStudent({ ...(await readJson(request)), id });
      const current = await db.send(new GetItemCommand({ TableName: TABLE_NAME, Key: { id: { S: id } } }));
      if (!current.Item) throw Object.assign(new Error("学生が見つかりません"), { statusCode: 404 });
      const item = { ...input, attendance: Number(current.Item.attendance?.N || 100), color: current.Item.color?.S || "#eeeaff", ink: current.Item.ink?.S || "#7558d8" };
      await db.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
      return sendJson(response, 200, item);
    }
    if (request.method === "DELETE") {
      await db.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { id } }));
      response.writeHead(204);
      return response.end();
    }
  }

  sendJson(response, 404, { message: "該当するAPIがありません" });
}

const mimeTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url);
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!["index.html", "styles.css", "app.js"].includes(relative)) return sendJson(response, 404, { message: "Not found" });
    const filePath = path.join(APP_DIR, relative);
    const content = await fs.promises.readFile(filePath);
    response.writeHead(200, { "content-type": mimeTypes[path.extname(filePath)], "content-length": content.length });
    response.end(content);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, error.statusCode || 500, { message: error.statusCode ? error.message : "サーバーでエラーが発生しました" });
    else response.end();
  }
});

ensureTable().then(() => {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Student site: http://127.0.0.1:${PORT}`);
    console.log(`DynamoDB endpoint: ${process.env.AWS_ENDPOINT_URL} (table: ${TABLE_NAME})`);
  });
}).catch((error) => {
  console.error("Could not initialize DynamoDB in AWS Emulator:", error);
  process.exitCode = 1;
});
