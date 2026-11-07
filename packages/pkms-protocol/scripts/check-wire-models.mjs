import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const openapi = read("openapi.yaml");
const tsSource = ts.createSourceFile("types.ts", read("src/types.ts"), ts.ScriptTarget.Latest, true);
const swift = readFileSync(fileURLToPath(new URL("../../apps/pkms-ios/PKMSProtocolModels.swift", root)), "utf8");
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
      const propertyMatch = line.match(/^        ([A-Za-z][A-Za-z0-9_]*):/);
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
    const match = line.match(/^\s{4}(?:let|var)\s+`?([A-Za-z][A-Za-z0-9_]*)`?\s*:\s*([^{}=]+)$/);
    const inferred = line.match(/^\s{4}let\s+([A-Za-z][A-Za-z0-9]*)\s*=/);
    if (match) {
      fields.add(match[1]);
      if (!match[2].trim().endsWith("?")) required.add(match[1]);
    } else if (inferred) {
      fields.add(inferred[1]);
      required.add(inferred[1]);
    }
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
  ["SessionResponse", "PkmsSessionResponse", "PKMSSessionResponse"],
  ["User", "PkmsUser", "PKMSUser"],
  ["Repository", "PkmsRepository", "PKMSRepository"],
  ["Workspace", "PkmsWorkspace", "PKMSWorkspace"],
  ["FileRecord", "PkmsFile", "PKMSFile"],
  ["WorkspaceSnapshot", "PkmsWorkspaceSnapshot", "PKMSSnapshot"],
  ["SyncStatus", "PkmsSyncStatus", "PKMSSyncStatus"],
  ["OperationRequest", "PkmsOperationRequest", "PKMSOperationRequest"],
  ["OperationResponse", "PkmsOperationResponse", "PKMSOperationResponse"],
  ["DocumentUpdateRequest", "PkmsDocumentUpdateRequest", "PKMSDocumentUpdate"],
  ["DeviceStart", "PkmsDeviceStart", "PKMSDeviceStart"],
  ["DevicePollResponse", "PkmsDevicePollResponse", "PKMSDevicePoll"],
  ["ApiError", "PkmsApiError", "PKMSAPIError"],
];
for (const [schemaName, tsName, swiftName] of httpModels) {
  const schema = schemas.get(schemaName);
  if (!schema) throw new Error(`OpenAPI schema ${schemaName} is missing`);
  compare(`OpenAPI ${schemaName} fields vs ${tsName}`, schema.fields, tsModel(tsName).fields);
  compare(`OpenAPI ${schemaName} required fields vs ${tsName}`, schema.required, tsModel(tsName).required);
  const swiftFields = swiftModel(swiftName).fields;
  const swiftRequired = swiftModel(swiftName).required;
  if (schemaName === "DocumentUpdateRequest") {
    for (const field of schema.fields) if (!swiftFields.has(field)) throw new Error(`OpenAPI ${schemaName}: Swift ${swiftName} is missing ${field}`);
    for (const field of schema.required) if (!swiftRequired.has(field)) throw new Error(`OpenAPI ${schemaName}: Swift ${swiftName} does not require ${field}`);
  } else {
    compare(`OpenAPI ${schemaName} fields vs ${swiftName}`, schema.fields, swiftFields);
  }
  if (schemaName !== "SessionResponse") {
    if (schemaName !== "DocumentUpdateRequest") compare(`OpenAPI ${schemaName} required fields vs ${swiftName}`, schema.required, swiftRequired);
  }
}

const peer = realtime.$defs?.peer;
if (!peer?.properties || !Array.isArray(peer.required)) throw new Error("Realtime peer schema is missing");
const peerFields = new Set(Object.keys(peer.properties));
const peerRequired = new Set(peer.required);
for (const [label, model] of [["PkmsPeer", tsModel("PkmsPeer")], ["PKMSPeer", swiftModel("PKMSPeer")]]) {
  compare(`Realtime peer fields vs ${label}`, peerFields, model.fields);
  compare(`Realtime peer required fields vs ${label}`, peerRequired, model.required);
}
for (const [schemaName, swiftName] of [["hello", "PKMSHello"], ["documentUpdate", "PKMSDocumentUpdate"], ["operationResult", "PKMSOperationResponse"]]) {
  const schema = realtime.$defs[schemaName];
  compare(`Realtime ${schemaName} fields vs ${swiftName}`, new Set(Object.keys(schema.properties)), swiftModel(swiftName).fields);
  compare(`Realtime ${schemaName} required fields vs ${swiftName}`, new Set(schema.required), swiftModel(swiftName).required);
}

const envelopeNames = realtime.oneOf.map((reference) => reference.$ref.split("/").at(-1));
const envelopes = envelopeNames.map((name) => realtime.$defs[name]);
const realtimeFields = new Set(envelopes.flatMap((definition) => Object.keys(definition.properties ?? {})));
const realtimeModel = tsModel("PkmsRealtimeMessage");
compare("Realtime schema fields vs PkmsRealtimeMessage", realtimeFields, realtimeModel.fields);
const schemaMessageTypes = new Set(envelopes.flatMap((definition) => {
  const value = definition.properties?.type?.const;
  return typeof value === "string" ? [value] : [];
}));
schemaMessageTypes.add("operation");
const typeAlias = tsSource.statements.find((item) => ts.isTypeAliasDeclaration(item) && item.name.text === "PkmsRealtimeMessageType");
if (!typeAlias) throw new Error("TypeScript PkmsRealtimeMessageType is missing");
const tsMessageTypes = new Set(typeAlias.type.kind === ts.SyntaxKind.UnionType
  ? typeAlias.type.types.filter(ts.isLiteralTypeNode).map((node) => node.literal).filter(ts.isStringLiteral).map((node) => node.text)
  : []);
compare("Realtime schema discriminators vs PkmsRealtimeMessageType", schemaMessageTypes, tsMessageTypes);

console.log(`Wire models match OpenAPI HTTP schemas (${httpModels.length}) and Realtime message fields, discriminators, and peer schema.`);
