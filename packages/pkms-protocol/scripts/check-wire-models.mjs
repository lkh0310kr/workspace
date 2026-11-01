import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const openapi = read("openapi.yaml");
const tsSource = ts.createSourceFile("types.ts", read("src/types.ts"), ts.ScriptTarget.Latest, true);
const swift = readFileSync(fileURLToPath(new URL("../../apps/ios/PKMSProtocolModels.swift", root)), "utf8");
const realtime = JSON.parse(read("realtime.schema.json"));

function parseOpenApiSchemas(source) {
  const lines = source.split(/\r?\n/);
  const schemaIndex = lines.findIndex((line) => line === "  schemas:");
  if (schemaIndex < 0) throw new Error("OpenAPI components.schemas section is missing");
  const schemas = new Map();
  let current = null;
  let inProperties = false;
  for (const line of lines.slice(schemaIndex + 1)) {
    if (/^  [^ ]/.test(line)) break;
    const schemaMatch = line.match(/^    ([A-Za-z][A-Za-z0-9]*):\s*$/);
    if (schemaMatch) { current = { fields: new Set(), required: new Set() }; schemas.set(schemaMatch[1], current); inProperties = false; continue; }
    if (!current) continue;
    if (/^      required:\s*\[/.test(line)) {
      for (const name of line.match(/\[([^\]]*)\]/)?.[1].split(",").map((part) => part.trim()) ?? []) if (name) current.required.add(name);
      continue;
    }
    if (/^      properties:\s*$/.test(line)) { inProperties = true; continue; }
    if (inProperties) {
      const propertyMatch = line.match(/^        ([A-Za-z][A-Za-z0-9]*):/);
      if (propertyMatch) current.fields.add(propertyMatch[1]);
      else if (/^      [^ ]/.test(line)) inProperties = false;
    }
  }
  return schemas;
}

function tsModel(name) {
  const declaration = tsSource.statements.find((item) => ts.isInterfaceDeclaration(item) && item.name.text === name);
  if (!declaration) throw new Error(`TypeScript interface ${name} is missing`);
  const fields = new Set(); const required = new Set();
  for (const member of declaration.members) {
    if (!ts.isPropertySignature(member) || !member.name || !ts.isIdentifier(member.name)) continue;
    fields.add(member.name.text);
    if (!member.questionToken) required.add(member.name.text);
  }
  return { fields, required };
}

function swiftModel(name) {
  const start = swift.search(new RegExp(`struct ${name}(?:\\s|:)`));
  if (start < 0) throw new Error(`Swift struct ${name} is missing`);
  const open = swift.indexOf("{", start); let depth = 1; let end = open + 1;
  for (; end < swift.length && depth; end++) { if (swift[end] === "{") depth++; else if (swift[end] === "}") depth--; }
  const body = swift.slice(open + 1, end - 1);
  const fields = new Set(); const required = new Set();
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^\s{4}(?:let|var)\s+`?([A-Za-z][A-Za-z0-9]*)`?\s*:\s*([^{}=]+)$/);
    if (!match) continue;
    fields.add(match[1]);
    if (!match[2].trim().endsWith("?")) required.add(match[1]);
  }
  return { fields, required };
}

function compare(label, expected, actual) {
  const missing = [...expected].filter((field) => !actual.has(field));
  const extra = [...actual].filter((field) => !expected.has(field));
  if (missing.length || extra.length) throw new Error(`${label}: missing [${missing.join(", ")}], extra [${extra.join(", ")}]`);
}

const schemas = parseOpenApiSchemas(openapi);
const httpModels = [
  ["User", "PkmsUser", "PKMSUser"],
  ["Repository", "PkmsRepository", "PKMSRepository"],
  ["Workspace", "PkmsWorkspace", "PKMSWorkspace"],
  ["FileRecord", "PkmsFile", "PKMSFile"],
  ["SyncStatus", "PkmsSyncStatus", "PKMSSyncStatus"],
];
for (const [schemaName, tsName, swiftName] of httpModels) {
  const schema = schemas.get(schemaName);
  if (!schema) throw new Error(`OpenAPI schema ${schemaName} is missing`);
  compare(`OpenAPI ${schemaName} fields vs ${tsName}`, schema.fields, tsModel(tsName).fields);
  compare(`OpenAPI ${schemaName} required fields vs ${tsName}`, schema.required, tsModel(tsName).required);
  compare(`OpenAPI ${schemaName} fields vs ${swiftName}`, schema.fields, swiftModel(swiftName).fields);
  compare(`OpenAPI ${schemaName} required fields vs ${swiftName}`, schema.required, swiftModel(swiftName).required);
}

const peer = realtime.$defs?.peer;
if (!peer?.properties || !Array.isArray(peer.required)) throw new Error("Realtime peer schema is missing");
const peerFields = new Set(Object.keys(peer.properties));
const peerRequired = new Set(peer.required);
for (const [label, model] of [["PkmsPeer", tsModel("PkmsPeer")], ["PKMSPeer", swiftModel("PKMSPeer")]]) {
  compare(`Realtime peer fields vs ${label}`, peerFields, model.fields);
  compare(`Realtime peer required fields vs ${label}`, peerRequired, model.required);
}

console.log(`Wire models match OpenAPI HTTP schemas (${httpModels.length}) and Realtime peer schema.`);
