import * as Y from "yjs";
import type { Env, WorkspaceRecord } from "./env";
import { accountStore } from "./SupabaseAccountStore";
import { json } from "./crypto";
import { SupabaseError, supabaseRequest, supabaseRpc } from "./supabase";
import { computeLinkEdits } from "./linkRewrite";

const MAX_MARKDOWN_BYTES = 512 * 1024;
const MAX_GIT_FILE_BYTES = 50 * 1024 * 1024;
const encoder = new TextEncoder();
type FileRow = { file_id: string; path: string; parent_path: string; kind: "markdown"|"asset"|"folder"; content: string|null; object_key: string|null; size: number; sha: string|null; previous_path: string|null; revision: number; deleted: boolean; dirty: boolean };
type WorkspaceRow = { workspace_id: string; owner_login: string; repository: string; branch: string; server_revision: number; github_status: WorkspaceRecord["githubStatus"]; github_head: string|null; mirrored_head?: string|null; github_message: string|null; last_github_commit_at: string|null; flush_due_at: string|null; lease_token?: string };
type GitHubTree = { sha: string; tree: Array<{path:string;mode:string;type:string;sha:string;size?:number}>; truncated: boolean };
class GitHubError extends Error { constructor(readonly status:number){super(`github_${status}`)} }
const b64=(value:Uint8Array)=>{let s="";for(const b of value)s+=String.fromCharCode(b);return btoa(s)};
const fromB64=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const validPath=(p:string)=>p.length>0&&p.length<=1024&&!p.startsWith("/")&&!p.includes("\\")&&p.split("/").every(x=>x&&x!=="."&&x!==".."&&![...x].some(c=>c.charCodeAt(0)<32));
const parent=(p:string)=>{const i=p.lastIndexOf("/");return i<0?"":p.slice(0,i)};
const isMarkdown=(p:string)=>/\.md$/i.test(p);

async function accessToken(env:Env,login:string):Promise<string>{
  const res=await accountStore(env,login).fetch("https://account/credentials/access-token");
  if(!res.ok)throw new Error("github_authorization_failed");
  return (await res.json() as {accessToken:string}).accessToken;
}
async function github(token:string,path:string,init:RequestInit={}):Promise<Response>{
  const headers=new Headers(init.headers);headers.set("Authorization",`Bearer ${token}`);headers.set("Accept",headers.get("Accept")??"application/vnd.github+json");headers.set("X-GitHub-Api-Version","2022-11-28");headers.set("User-Agent","PKMS-Cloud/1.0");
  const res=await fetch(`https://api.github.com${path}`,{...init,headers});if(!res.ok){const detail=await res.clone().json().catch(()=>({})) as {message?:unknown};console.error(JSON.stringify({level:"error",event:"github.request.failed",method:init.method??"GET",route:path.replace(/[0-9a-f]{40}/g,":sha").slice(0,120),status:res.status,message:typeof detail.message==="string"?detail.message.slice(0,200):undefined}));throw new GitHubError(res.status);}return res;
}
async function row(env:Env,id:string,login:string):Promise<WorkspaceRow|null>{
  const q=new URLSearchParams({workspace_id:`eq.${id}`,owner_login:`eq.${login.toLowerCase()}`,select:"*",limit:"1"});
  const a=await supabaseRequest(env,`/rest/v1/pkms_workspaces?${q}`);return ((await a.json() as WorkspaceRow[])[0]??null);
}
async function files(env:Env,id:string,filter:Record<string,string>,select="*"):Promise<FileRow[]>{
  const q=new URLSearchParams({workspace_id:`eq.${id}`,select,...filter});const r=await supabaseRequest(env,`/rest/v1/pkms_files?${q}`);return r.json() as Promise<FileRow[]>;
}
async function upsertFiles(env:Env,items:Record<string,unknown>[],onStage?:(stage:string)=>void):Promise<void>{
  if(!items.length)return;
  const ids=items.map(item=>String(item.file_id));
  const members=ids.map(id=>`"${id.replaceAll("\\","\\\\").replaceAll('"','\\"')}"`).join(",");
  const q=new URLSearchParams({select:"file_id",workspace_id:`eq.${String(items[0].workspace_id)}`,file_id:`in.(${members})`});
  onStage?.("file_cache_existing_lookup");
  const existingResponse=await supabaseRequest(env,`/rest/v1/pkms_files?${q}`);
  const existing=new Set((await existingResponse.json() as Array<{file_id:string}>).map(item=>item.file_id));
  const missing=items.filter(item=>!existing.has(String(item.file_id)));
  if(!missing.length)return;
  onStage?.("file_cache_insert");
  await supabaseRequest(env,"/rest/v1/pkms_files?on_conflict=workspace_id,file_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(missing)});
}
function fileRecord(f:FileRow){return {id:f.file_id,path:f.path,kind:f.kind,revision:f.revision,...(f.kind!=="folder"?{size:f.size,...(f.kind==="asset"?{contentType:"application/octet-stream"}:{})}:{})};}
async function publishRealtime(env:Env,workspaceId:string,message:Record<string,unknown>):Promise<void>{
  const endpoint=`${env.SUPABASE_URL.replace(/\/$/,"")}/realtime/v1/api/broadcast`;
  const response=await fetch(endpoint,{method:"POST",headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({messages:[{topic:`pkms:${workspaceId}`,event:"protocol",payload:message,private:true}]})});
  if(!response.ok)console.error(JSON.stringify({event:"realtime.broadcast.failed",status:response.status}));
}

export async function handleVaultRequest(env:Env,login:string,workspaceId:string,request:Request,requestId?:string):Promise<Response>{
  const url=new URL(request.url);const workspace=await row(env,workspaceId,login);const p=url.pathname;
  if(p==="/initialize"&&request.method==="POST")return initialize(env,login,workspaceId,await request.json() as {repository:string;branch:string;accountLogin:string});
  if(!workspace)return json({error:"not_found"},{status:404});
  if(p==="/diagnostics/realtime"&&request.method==="POST"){
    const body=await request.json().catch(()=>({})) as {status?:unknown;errorType?:unknown;errorCode?:unknown;closeCode?:unknown;wasClean?:unknown;connectionState?:unknown;transportClass?:unknown;clientId?:unknown;tokenRole?:unknown;issuerMatches?:unknown;loginMatches?:unknown;subjectPresent?:unknown};
    const statuses=new Set(["SUBSCRIBED","CHANNEL_ERROR","TIMED_OUT","CLOSED","CONNECT_ERROR","SYSTEM_ERROR","SOCKET_CREATED","SOCKET_OPEN","SOCKET_CLOSE","SOCKET_ERROR","SOCKET_FRAME","TOKEN_CHECK","TOKEN_SOURCE"]);
    const status=typeof body.status==="string"&&statuses.has(body.status)?body.status:"INVALID_STATUS";
    if(status==="SOCKET_FRAME"||status==="TOKEN_SOURCE")return new Response(null,{status:204});
    const safe=(value:unknown)=>typeof value==="string"&&/^[A-Za-z0-9_.:-]{1,64}$/.test(value)?value:undefined;
    const closeCode=typeof body.closeCode==="number"&&Number.isInteger(body.closeCode)&&body.closeCode>=1000&&body.closeCode<=4999?body.closeCode:undefined;
    const success=status==="SUBSCRIBED"||status==="SOCKET_CREATED"||status==="SOCKET_OPEN"||status==="TOKEN_CHECK";
    const event=status==="SUBSCRIBED"?"realtime.channel.subscribed":status==="SYSTEM_ERROR"?"realtime.channel.system_error":status==="SOCKET_CREATED"?"realtime.socket.created":status==="SOCKET_OPEN"?"realtime.socket.opened":status==="SOCKET_CLOSE"?"realtime.socket.closed":status==="SOCKET_ERROR"?"realtime.socket.error":status==="TOKEN_CHECK"?"realtime.token.checked":"realtime.channel.failed";
    const connectionState=typeof body.connectionState==="string"&&new Set(["connecting","open","closing","closed"]).has(body.connectionState)?body.connectionState:undefined;
    console[success?"log":"error"](JSON.stringify({time:new Date().toISOString(),level:success?"info":"error",requestId:requestId??"missing",event,status,errorType:safe(body.errorType),errorCode:safe(body.errorCode),closeCode,wasClean:typeof body.wasClean==="boolean"?body.wasClean:undefined,connectionState,transportClass:safe(body.transportClass),clientId:safe(body.clientId),tokenRole:safe(body.tokenRole),issuerMatches:typeof body.issuerMatches==="boolean"?body.issuerMatches:undefined,loginMatches:typeof body.loginMatches==="boolean"?body.loginMatches:undefined,subjectPresent:typeof body.subjectPresent==="boolean"?body.subjectPresent:undefined}));
    return new Response(null,{status:204});
  }
  if(p==="/snapshot"&&request.method==="GET"){
    const list=await files(env,workspaceId,{deleted:"eq.false",order:"path.asc",...(url.searchParams.has("afterRevision")?{revision:`gt.${Number(url.searchParams.get("afterRevision"))}`}:{})},"file_id,path,kind,size,revision");
    return json({workspaceId,revision:Number(workspace.server_revision),files:list.map(fileRecord),hasMore:false,nextRevision:Number(workspace.server_revision),afterRevision:Number(url.searchParams.get("afterRevision")??0)});
  }
  if(p==="/directory"&&request.method==="GET")return directory(env,login,workspace,url.searchParams.get("path")??"",requestId);
  if(p==="/sync-status"&&request.method==="GET")return syncStatus(env,workspace);
  if(p==="/mirror"&&request.method==="POST")return mirror(env,login,workspace,requestId);
  if(p==="/flush"&&request.method==="POST"){
    const claimed=await supabaseRpc<WorkspaceRow|null>(env,"pkms_claim_workspace",{p_workspace_id:workspaceId});if(!claimed?.lease_token)return json({error:"flush_in_progress",message:"GitHub backup is already running."},{status:409,headers:{"Retry-After":"10"}});
    try{await flushWorkspace(env,workspaceId,login,claimed.lease_token);const fresh=await row(env,workspaceId,login);return fresh?syncStatus(env,fresh):json({error:"not_found"},{status:404});}
    catch(error){await markFlushFailure(env,claimed,error);return json({error:"github_sync_failed",message:error instanceof GitHubError?`GitHub returned HTTP ${error.status}. Retrying automatically.`:"GitHub backup failed. Retrying automatically."},{status:502});}
  }
  if(p==="/operations"&&request.method==="POST")return applyOperation(env,workspace,await request.json() as Record<string,unknown>);
  const updates=p.match(/^\/files\/([^/]+)\/updates$/);
  if(updates&&request.method==="GET")return readDocument(env,workspace,decodeURIComponent(updates[1]),url.searchParams.get("stateVector"));
  if(updates&&request.method==="POST")return writeDocument(env,workspace,decodeURIComponent(updates[1]),await request.json() as Record<string,unknown>);
  const fileMatch=p.match(/^\/files\/([^/]+)$/);
  if(fileMatch&&request.method==="GET")return url.searchParams.get("metadata")==="1"
    ?getFileMetadata(env,workspaceId,decodeURIComponent(fileMatch[1]))
    :getFile(env,workspaceId,decodeURIComponent(fileMatch[1]));
  const assetMatch=p.match(/^\/assets\/([^/]+)$/);
  if(assetMatch&&request.method==="GET")return getAsset(env,workspaceId,decodeURIComponent(assetMatch[1]));
  if(p==="/upload"&&request.method==="POST")return upload(env,workspace,request);
  if(p==="/stream"&&request.headers.get("Upgrade")==="websocket")return json({error:"realtime_migration_in_progress",message:"Live sync is temporarily unavailable. Your saved changes remain available."},{status:503,headers:{"Retry-After":"10"}});
  return json({error:"not_found"},{status:404});
}

async function initialize(env:Env,login:string,id:string,body:{repository:string;branch:string;accountLogin:string}):Promise<Response>{
  if(login.toLowerCase()!=="lkh0310kr"||body.accountLogin.toLowerCase()!==login.toLowerCase())return json({error:"account_not_allowed"},{status:403});
  if(!/^[^/]+\/[^/]+$/.test(body.repository)||!body.branch)return json({error:"invalid_repository"},{status:400});
  const existing=await row(env,id,login);if(existing)return json({ok:true,alreadyInitialized:true});
  try{
    const token=await accessToken(env,login);const [owner,repo]=body.repository.split("/");const branch=body.branch.split("/").map(encodeURIComponent).join("/");
    const ref=await(await github(token,`/repos/${owner}/${repo}/git/ref/heads/${branch}`)).json() as {object:{sha:string}};
    const commit=await(await github(token,`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`)).json() as {tree:{sha:string}};
    await supabaseRpc(env,"pkms_initialize_workspace",{p_workspace_id:id,p_owner_login:login,p_repository:body.repository,p_branch:body.branch,p_head:ref.object.sha,p_tree_sha:commit.tree.sha});
    return json({ok:true,lazy:true});
  }catch(error){return json({error:"github_import_failed",message:error instanceof GitHubError?`GitHub returned HTTP ${error.status}. Retry the connection.`:"Repository initialization failed. Retry the connection."},{status:502});}
}

async function directory(env:Env,login:string,w:WorkspaceRow,path:string,requestId?:string):Promise<Response>{
  if(path&&!validPath(path))return json({error:"invalid_path"},{status:400});
  const dq=new URLSearchParams({workspace_id:`eq.${w.workspace_id}`,path:`eq.${path}`,select:"tree_sha,loaded",limit:"1"});
  const dr=await supabaseRequest(env,`/rest/v1/pkms_directories?${dq}`);const d=(await dr.json() as Array<{tree_sha:string;loaded:boolean}>)[0];if(!d)return json({error:"directory_not_found"},{status:404});
  if(!d.loaded){
    let stage="access_token";
    try{
      const token=await accessToken(env,login);const [owner,repo]=w.repository.split("/");
      stage="github_tree";
      const tree=await(await github(token,`/repos/${owner}/${repo}/git/trees/${d.tree_sha}`)).json() as GitHubTree;
      if(tree.truncated)return json({error:"directory_too_large",message:"This folder is too large to display in one request."},{status:413});
      const inserts:Record<string,unknown>[]=[];const dirs:Record<string,unknown>[]=[];
      for(const e of tree.tree){if(!validPath(e.path))continue;const p=path?`${path}/${e.path}`:e.path;
        if(e.type==="tree"){inserts.push({workspace_id:w.workspace_id,file_id:`folder-${p}`,path:p,parent_path:parent(p),kind:"folder",size:0,sha:null,revision:0,deleted:false,dirty:false});dirs.push({workspace_id:w.workspace_id,path:p,tree_sha:e.sha,loaded:false});}
        else if(e.type==="blob"&&["100644","100755","120000"].includes(e.mode)){const fid=await stableId(w.repository,p);inserts.push({workspace_id:w.workspace_id,file_id:fid,path:p,parent_path:parent(p),kind:isMarkdown(p)?"markdown":"asset",size:e.size??0,sha:e.sha,revision:0,deleted:false,dirty:false});}
      }
      stage="file_cache_upsert";
      await upsertFiles(env,inserts,value=>{stage=value;});
      if(dirs.length){stage="directory_cache_upsert";await supabaseRequest(env,"/rest/v1/pkms_directories?on_conflict=workspace_id,path",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(dirs)});}
      stage="mark_directory_loaded";
      await supabaseRequest(env,`/rest/v1/pkms_directories?workspace_id=eq.${encodeURIComponent(w.workspace_id)}&path=eq.${encodeURIComponent(path)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({loaded:true})});
    }catch(error){
      const fields={time:new Date().toISOString(),level:"error",requestId:requestId??"missing",event:"directory.load.failed",stage,errorType:error instanceof Error?error.name:"UnknownError",...(error instanceof GitHubError?{upstream:"github",upstreamStatus:error.status}:error instanceof SupabaseError?{upstream:"supabase",upstreamStatus:error.status,upstreamCode:error.code}:{})};
      console.error(JSON.stringify(fields));
      return json({error:"directory_load_failed",message:error instanceof GitHubError?`GitHub returned HTTP ${error.status}. Try again shortly.`:"Could not load this folder. Try again shortly."},{status:502});
    }
  }
  const q=new URLSearchParams({workspace_id:`eq.${w.workspace_id}`,parent_path:`eq.${path}`,deleted:"eq.false",select:"file_id,path,kind,revision,size",order:"path.asc"});
  const r=await supabaseRequest(env,`/rest/v1/pkms_files?${q}`);const list=await r.json() as FileRow[];
  return json({path,files:list.map(fileRecord),cached:true});
}
async function stableId(repository:string,path:string):Promise<string>{const digest=await crypto.subtle.digest("SHA-256",encoder.encode(`${repository}\0${path}`));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,32);}
async function syncStatus(env:Env,w:WorkspaceRow):Promise<Response>{
  const q=new URLSearchParams({workspace_id:`eq.${w.workspace_id}`,dirty:"eq.true",select:"file_id",limit:"1000"});const r=await supabaseRequest(env,`/rest/v1/pkms_files?${q}`);
  return json({serverRevision:Number(w.server_revision),githubStatus:w.github_status,githubHead:w.github_head,lastGitHubCommitAt:w.last_github_commit_at,nextGitHubFlushAt:w.flush_due_at?Date.parse(w.flush_due_at):null,pendingFiles:(await r.json() as unknown[]).length,message:w.github_message});
}

const MIRROR_NOTES_PER_CALL=600;const MIRROR_GRAPHQL_BATCH=50;const MIRROR_TREE_BATCH=2000;
const chunk=<T,>(items:T[],size:number)=>{const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out;};
/** Seed state for a note that has never been edited. Persisted once, so every client shares the same Yjs structs. */
function seedState(content:string):string{const doc=new Y.Doc();if(content)doc.getText("markdown").insert(0,content);return b64(Y.encodeStateAsUpdate(doc));}
async function githubBlobTexts(token:string,owner:string,repo:string,shas:string[]):Promise<Map<string,string>>{
  const fields=shas.map((sha,i)=>`b${i}:object(oid:"${sha}"){... on Blob{text isTruncated isBinary byteSize}}`).join(" ");
  const res=await fetch("https://api.github.com/graphql",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","User-Agent":"pkms-cloud"},body:JSON.stringify({query:`query($owner:String!,$name:String!){repository(owner:$owner,name:$name){${fields}}}`,variables:{owner,name:repo}})});
  if(!res.ok)throw new GitHubError(res.status);
  const data=await res.json() as {data?:{repository?:Record<string,{text:string|null;isTruncated:boolean;isBinary:boolean;byteSize:number}|null>};errors?:unknown[]};
  const repository=data.data?.repository;if(!repository)throw new GitHubError(502);
  const out=new Map<string,string>();
  shas.forEach((sha,i)=>{const blob=repository[`b${i}`];if(blob&&typeof blob.text==="string"&&!blob.isTruncated&&!blob.isBinary&&encoder.encode(blob.text).byteLength===blob.byteSize)out.set(sha,blob.text);});
  return out;
}
/** Mirrors GitHub into Supabase in bounded steps: tree first, then note bodies; the caller repeats until `complete`. */
async function mirror(env:Env,login:string,w:WorkspaceRow,requestId?:string):Promise<Response>{
  let stage="precheck";
  try{
    const [owner,repo]=w.repository.split("/");
    if(!w.mirrored_head){
      // The tree is cached only against a clean, fully backed-up workspace so it cannot collide with unsynced local moves.
    const dirty=await(await supabaseRequest(env,`/rest/v1/pkms_files?${new URLSearchParams({workspace_id:`eq.${w.workspace_id}`,dirty:"eq.true",select:"file_id",limit:"1"})}`)).json() as unknown[];
    if(dirty.length||w.github_status==="pending"||w.github_status==="failed")return json({status:"deferred",reason:"unsynced_changes"});
      stage="github_head";
      const token=await accessToken(env,login);const branch=w.branch.split("/").map(encodeURIComponent).join("/");
      const ref=await(await github(token,`/repos/${owner}/${repo}/git/ref/heads/${branch}`)).json() as {object:{sha:string}};
      if(w.github_head&&ref.object.sha!==w.github_head)return json({status:"deferred",reason:"external_change"});
      stage="github_tree";
      const commit=await(await github(token,`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`)).json() as {tree:{sha:string}};
      const tree=await(await github(token,`/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`)).json() as GitHubTree;
      if(tree.truncated)return json({status:"unsupported",reason:"tree_too_large"});
      const fileRows:Record<string,unknown>[]=[];const dirRows:Record<string,unknown>[]=[];
      for(const e of tree.tree){if(!validPath(e.path))continue;
        if(e.type==="tree"){fileRows.push({fileId:`folder-${e.path}`,path:e.path,parentPath:parent(e.path),kind:"folder",size:0,sha:null});dirRows.push({path:e.path,treeSha:e.sha});}
        else if(e.type==="blob"&&["100644","100755","120000"].includes(e.mode))fileRows.push({fileId:await stableId(w.repository,e.path),path:e.path,parentPath:parent(e.path),kind:isMarkdown(e.path)?"markdown":"asset",size:e.size??0,sha:e.sha});}
      stage="mirror_tree";
      for(const [i,batch] of chunk(fileRows,MIRROR_TREE_BATCH).entries())await rpcVoid(env,"pkms_mirror_tree",{p_workspace_id:w.workspace_id,p_files:batch,p_dirs:i===0?dirRows:[]});
      await rpcVoid(env,"pkms_mark_mirrored",{p_workspace_id:w.workspace_id,p_head:ref.object.sha});
      return json({status:"progress",phase:"tree",files:fileRows.length});
    }
    // Once mirrored, the database is authoritative; later GitHub changes are handled by the existing external-change flow.
    stage="select_notes";
    const q=new URLSearchParams({workspace_id:`eq.${w.workspace_id}`,deleted:"eq.false",dirty:"eq.false",kind:"eq.markdown",content:"is.null",sha:"not.is.null",size:`lte.${MAX_MARKDOWN_BYTES}`,select:"file_id,sha",order:"path.asc",limit:String(MIRROR_NOTES_PER_CALL)});
    const pending=await(await supabaseRequest(env,`/rest/v1/pkms_files?${q}`)).json() as Array<{file_id:string;sha:string}>;
    if(!pending.length)return json({status:"complete"});
    const token=await accessToken(env,login);
    stage="github_blobs";let mirrored=0;
    for(const group of chunk(pending,MIRROR_GRAPHQL_BATCH)){
      const texts=await githubBlobTexts(token,owner,repo,group.map(n=>n.sha));
      const items=group.flatMap(n=>{const content=texts.get(n.sha);return content===undefined?[]:[{fileId:n.file_id,sha:n.sha,content,state:seedState(content)}];});
      if(items.length){
        stage="mirror_content";
        // Postgres text cannot hold NUL; such notes stay lazily loaded instead of blocking the whole batch.
        const storable=items.filter(item=>!item.content.includes("\u0000"));
        try{mirrored+=await supabaseRpc<number>(env,"pkms_mirror_content",{p_workspace_id:w.workspace_id,p_items:storable});}
        catch(batchError){
          // Isolate the rejected note(s) so one bad file cannot stall the mirror.
          for(const item of storable){try{mirrored+=await supabaseRpc<number>(env,"pkms_mirror_content",{p_workspace_id:w.workspace_id,p_items:[item]});}catch(itemError){console.error(JSON.stringify({level:"error",event:"mirror.note.skipped",fileId:item.fileId,bytes:item.content.length,...(itemError instanceof SupabaseError?{upstreamStatus:itemError.status,upstreamCode:itemError.code}:{})}));}}
        }
        stage="github_blobs";}
    }
    return json({status:mirrored?"progress":"stalled",phase:"content",mirrored,more:pending.length===MIRROR_NOTES_PER_CALL});
  }catch(error){
    console.error(JSON.stringify({time:new Date().toISOString(),level:"error",requestId:requestId??"missing",event:"mirror.failed",stage,errorType:error instanceof Error?error.name:"UnknownError",...(error instanceof GitHubError?{upstreamStatus:error.status}:{}),...(error instanceof SupabaseError?{upstreamStatus:error.status,upstreamCode:error.code}:{})}));
    return json({error:"mirror_failed",message:"Could not mirror the repository yet. It will retry."},{status:502});
  }
}

const MAX_LINK_NOTES=100;
type MoveSnapshot={file:{path:string;kind:FileRow["kind"]};files:string[];paths:Set<string>};
const rpcVoid=async(env:Env,name:string,args:Record<string,unknown>)=>{await supabaseRequest(env,`/rest/v1/rpc/${name}`,{method:"POST",body:JSON.stringify(args)});};
async function pagedRows<T>(env:Env,base:URLSearchParams):Promise<T[]>{
  const out:T[]=[];
  for(let offset=0;;offset+=1000){const q=new URLSearchParams(base);q.set("limit","1000");q.set("offset",String(offset));const page=await(await supabaseRequest(env,`/rest/v1/pkms_files?${q}`)).json() as T[];out.push(...page);if(page.length<1000)return out;}
}
/** Captures the pre-move tree so links can be resolved against the paths as they were. */
async function moveSnapshot(env:Env,w:WorkspaceRow,fileId:string):Promise<MoveSnapshot|null>{
  const rows=await pagedRows<{file_id:string;path:string;kind:FileRow["kind"]}>(env,new URLSearchParams({workspace_id:`eq.${w.workspace_id}`,deleted:"eq.false",select:"file_id,path,kind",order:"path.asc"}));
  const file=rows.find(r=>r.file_id===fileId);if(!file)return null;
  const files=rows.filter(r=>r.kind!=="folder"&&(file.kind==="folder"?r.path.startsWith(`${file.path}/`):r.file_id===fileId)).map(r=>r.path);
  return {file,files,paths:new Set(rows.filter(r=>r.kind!=="folder").map(r=>r.path))};
}
async function rewriteLinksAfterMove(env:Env,w:WorkspaceRow,before:MoveSnapshot,fileId:string,dest:string):Promise<{updated:number;truncated?:boolean}>{
  const from=before.file.path;if(dest===from)return {updated:0};
  const moves=new Map(before.files.map(path=>[path,dest+path.slice(from.length)]));const reverse=new Map([...moves].map(([oldPath,newPath])=>[newPath,oldPath]));
  const names=[...new Set(before.files.map(path=>path.slice(path.lastIndexOf("/")+1).replace(/\.md$/i,"")))];
  const select="file_id,path,content";const base=new URLSearchParams({workspace_id:`eq.${w.workspace_id}`,deleted:"eq.false",kind:"eq.markdown",content:"not.is.null",select});
  let candidates:Array<{file_id:string;path:string}>;
  if(before.file.kind!=="folder"&&names.length<=40&&!names.some(n=>/["\\]/.test(n))){
    const q=new URLSearchParams(base);q.set("or",`(${names.map(n=>`content.ilike."*${n.replaceAll("%","\\%").replaceAll("_","\\_")}*"`).join(",")},file_id.eq."${fileId}")`);
    candidates=await pagedRows(env,q);
  }else candidates=await pagedRows(env,base);
  let updated=0;let truncated=false;
  for(const note of candidates){
    if(updated>=MAX_LINK_NOTES){truncated=true;break;}
    const current=await supabaseRpc<{file:FileRow;stateUpdate:string;updates:Array<{update:string}>}>(env,"pkms_read_document",{p_workspace_id:w.workspace_id,p_file_id:note.file_id});
    if(!current?.file||current.file.kind!=="markdown")continue;
    const doc=new Y.Doc({guid:note.file_id});if(current.stateUpdate)Y.applyUpdate(doc,fromB64(current.stateUpdate));for(const x of current.updates)Y.applyUpdate(doc,fromB64(x.update));
    const text=doc.getText("markdown");const content=text.toString();if(!content)continue;
    const edits=computeLinkEdits({content,oldSource:reverse.get(note.path)??note.path,newSource:note.path,moves,paths:before.paths});
    if(!edits.length)continue;
    const vector=Y.encodeStateVector(doc);
    doc.transact(()=>{for(const e of [...edits].sort((a,b)=>b.start-a.start)){text.delete(e.start,e.end-e.start);if(e.text)text.insert(e.start,e.text);}});
    const res=await writeDocument(env,w,note.file_id,{operationId:crypto.randomUUID(),update:b64(Y.encodeStateAsUpdate(doc,vector))});
    if(res.ok)updated++;
  }
  return truncated?{updated,truncated}:{updated};
}
async function applyOperation(env:Env,w:WorkspaceRow,b:Record<string,unknown>):Promise<Response>{
  const op=b.operation as Record<string,unknown>|undefined;const id=String(b.operationId??"");if(!op||!id)return json({error:"invalid_operation"},{status:400});
  if(op.type==="create-file"&&typeof op.content==="string"){const doc=new Y.Doc();if(op.content)doc.getText("markdown").insert(0,op.content);b.initialState=b64(Y.encodeStateAsUpdate(doc));}
  try{
    const before=op.type==="move"&&typeof op.fileId==="string"?await moveSnapshot(env,w,op.fileId).catch(()=>null):null;
    const result=await supabaseRpc<Record<string,unknown>>(env,"pkms_apply_operation",{p_workspace_id:w.workspace_id,p_operation_id:id,p_base_revision:Number(b.baseRevision??0),p_client_id:String(b.clientId??"offline"),p_operation:op,p_initial_state_b64:b.initialState??null});await publishRealtime(env,w.workspace_id,{...result,type:"operation"});
    if(before&&!result.duplicate){
      const dest=typeof result.conflictCopyPath==="string"?result.conflictCopyPath:String(op.toPath);
      const links=await rewriteLinksAfterMove(env,w,before,String(op.fileId),dest).catch((error)=>{console.error(JSON.stringify({level:"error",event:"links.rewrite.failed",errorType:error instanceof Error?error.name:"UnknownError"}));return {updated:0,failed:true};});
      return json({...result,links});
    }
    return json(result);}
  catch(error){const code=error instanceof Error&&error.message.includes("invalid_path")?"invalid_path":error instanceof Error&&error.message.includes("workspace_not_found")?"workspace_not_found":"operation_failed";return json({error:code},{status:code==="invalid_path"?400:409});}
}
async function readDocument(env:Env,w:WorkspaceRow,fileId:string,vector:string|null):Promise<Response>{
  try{
    const data=await supabaseRpc<{file:FileRow;stateUpdate:string;compactedRevision:number;updates:Array<{revision:number;update:string}>}>(env,"pkms_read_document",{p_workspace_id:w.workspace_id,p_file_id:fileId});
    if(!data?.file||data.file.kind!=="markdown")return json({error:"not_found"},{status:404});
    if(data.file.size>MAX_MARKDOWN_BYTES)return json({error:"file_too_large",maxBytes:MAX_MARKDOWN_BYTES},{status:413});
    const doc=new Y.Doc({guid:fileId});if(data.stateUpdate)Y.applyUpdate(doc,fromB64(data.stateUpdate));for(const u of data.updates)Y.applyUpdate(doc,fromB64(u.update));
    if(!doc.getText("markdown").length&&!data.file.content&&data.file.sha){const token=await accessToken(env,w.owner_login);const [owner,repo]=w.repository.split("/");const raw=await(await github(token,`/repos/${owner}/${repo}/git/blobs/${data.file.sha}`,{headers:{Accept:"application/vnd.github.raw+json"}})).arrayBuffer();if(raw.byteLength!==data.file.size)return json({error:"github_file_size_mismatch"},{status:502});const content=new TextDecoder("utf-8",{fatal:true}).decode(raw);doc.getText("markdown").insert(0,content);await supabaseRequest(env,"/rest/v1/pkms_files?workspace_id=eq."+encodeURIComponent(w.workspace_id)+"&file_id=eq."+encodeURIComponent(fileId),{method:"PATCH",body:JSON.stringify({content})});}
    const update=vector?Y.encodeStateAsUpdate(doc,fromB64(vector)):Y.encodeStateAsUpdate(doc);return json({fileId,update:b64(update),protocolVersion:1,revision:data.file.revision});
  }catch{return json({error:"document_load_failed",message:"Could not load this document. Try again shortly."},{status:502});}
}
async function writeDocument(env:Env,w:WorkspaceRow,fileId:string,b:Record<string,unknown>):Promise<Response>{
  const operationId=String(b.operationId??"");if(!operationId||typeof b.update!=="string")return json({error:"invalid_document_update"},{status:400});
  try{
    const current=await supabaseRpc<{file:FileRow;stateUpdate:string;updates:Array<{update:string}>}>(env,"pkms_read_document",{p_workspace_id:w.workspace_id,p_file_id:fileId});if(!current?.file||current.file.kind!=="markdown")return json({error:"not_found"},{status:404});
    const doc=new Y.Doc({guid:fileId});if(current.stateUpdate)Y.applyUpdate(doc,fromB64(current.stateUpdate));for(const x of current.updates)Y.applyUpdate(doc,fromB64(x.update));Y.applyUpdate(doc,fromB64(b.update));
    const content=doc.getText("markdown").toString();const size=encoder.encode(content).byteLength;if(size>MAX_MARKDOWN_BYTES)return json({error:"markdown_too_large",maxBytes:MAX_MARKDOWN_BYTES},{status:413});
    const result=await supabaseRpc<Record<string,unknown>>(env,"pkms_append_document_update",{p_workspace_id:w.workspace_id,p_file_id:fileId,p_operation_id:operationId,p_update_b64:b.update,p_content:content,p_size:size});
    const ack={type:"ack",...result,fileId};await publishRealtime(env,w.workspace_id,{type:"document-update",operationId,fileId,update:b.update,acceptedRevision:result.acceptedRevision});return json(ack);
  }catch{return json({error:"document_update_failed",message:"The change could not be saved. Retry shortly."},{status:409});}
}
async function getFile(env:Env,id:string,fileId:string):Promise<Response>{const q=new URLSearchParams({workspace_id:`eq.${id}`,file_id:`eq.${fileId}`,deleted:"eq.false",select:"file_id,path,kind,content,size,sha,revision",limit:"1"});const r=await supabaseRequest(env,`/rest/v1/pkms_files?${q}`);const f=(await r.json() as FileRow[])[0];return f?json({id:f.file_id,path:f.path,kind:f.kind,revision:f.revision,content:f.content,contentType:f.kind==="markdown"?"text/markdown; charset=utf-8":"application/octet-stream",size:f.size,sha256:f.sha}):json({error:"not_found"},{status:404});}
async function getFileMetadata(env:Env,id:string,fileId:string):Promise<Response>{const q=new URLSearchParams({workspace_id:`eq.${id}`,file_id:`eq.${fileId}`,deleted:"eq.false",select:"file_id,path,kind,size,sha,revision",limit:"1"});const r=await supabaseRequest(env,`/rest/v1/pkms_files?${q}`);const f=(await r.json() as FileRow[])[0];return f?json({id:f.file_id,path:f.path,kind:f.kind,revision:f.revision,contentType:f.kind==="markdown"?"text/markdown; charset=utf-8":"application/octet-stream",size:f.size,sha256:f.sha}):json({error:"not_found"},{status:404});}
async function getAsset(env:Env,id:string,fileId:string):Promise<Response>{const q=new URLSearchParams({workspace_id:`eq.${id}`,file_id:`eq.${fileId}`,deleted:"eq.false",kind:"eq.asset",select:"path,size,sha,object_key",limit:"1"});const r=await supabaseRequest(env,`/rest/v1/pkms_files?${q}`);const f=(await r.json() as Array<Pick<FileRow,"path"|"size"|"sha"|"object_key">>)[0];if(!f)return json({error:"not_found"},{status:404});if(f.size>MAX_GIT_FILE_BYTES)return json({error:"file_too_large",maxBytes:MAX_GIT_FILE_BYTES},{status:413});
  if(f.object_key){const object=await env.ASSET_BUCKET.get(f.object_key);if(object){const h=new Headers();object.writeHttpMetadata(h);h.set("Content-Length",String(object.size));h.set("Content-Disposition",`inline; filename*=UTF-8''${encodeURIComponent(f.path.split("/").at(-1)??"download")}`);h.set("Cache-Control","private, max-age=60");return new Response(object.body,{headers:h});}}
  if(!f.sha)return json({error:"asset_missing"},{status:404});const wq=new URLSearchParams({workspace_id:`eq.${id}`,select:"repository,owner_login",limit:"1"});const wr=await supabaseRequest(env,`/rest/v1/pkms_workspaces?${wq}`);const w=(await wr.json() as Array<{repository:string;owner_login:string}>)[0];if(!w)return json({error:"not_found"},{status:404});const [owner,repo]=w.repository.split("/");const token=await accessToken(env,w.owner_login);const blob=await github(token,`/repos/${owner}/${repo}/git/blobs/${f.sha}`,{headers:{Accept:"application/vnd.github.raw+json"}});return new Response(blob.body,{headers:{"Content-Length":String(f.size),"Content-Type":"application/octet-stream","Content-Disposition":`inline; filename*=UTF-8''${encodeURIComponent(f.path.split("/").at(-1)??"download")}`,"Cache-Control":"private, max-age=60"}});
}
async function upload(env:Env,w:WorkspaceRow,request:Request):Promise<Response>{
  const form=await request.formData();
  const file=form.get("file");
  const path=String(form.get("path")??"");
  if(!(file instanceof File)||!validPath(path))return json({error:"invalid_upload"},{status:400});
  if(file.size>MAX_GIT_FILE_BYTES)return json({error:"file_too_large",maxBytes:MAX_GIT_FILE_BYTES},{status:413});
  const fileId=String(form.get("fileId")??crypto.randomUUID());
  const key=`${w.workspace_id}/${fileId}`;
  const fixed=new FixedLengthStream(file.size);
  const uploadPromise=env.ASSET_BUCKET.put(key,fixed.readable,{httpMetadata:{contentType:file.type||"application/octet-stream"}});
  try{await file.stream().pipeTo(fixed.writable);await uploadPromise;}
  catch(error){await uploadPromise.catch(()=>{});await env.ASSET_BUCKET.delete(key).catch(()=>{});throw error;}
  try{
    const result=await supabaseRpc<Record<string,unknown>>(env,"pkms_apply_asset_upload",{
      p_workspace_id:w.workspace_id,p_operation_id:crypto.randomUUID(),p_base_revision:Number(w.server_revision),
      p_client_id:String(form.get("clientId")??"upload"),p_path:path,p_file_id:fileId,p_object_key:key,p_size:file.size,
    });
    await publishRealtime(env,w.workspace_id,{...result,type:"operation",path:result.conflictCopyPath??path});
    return json({...result,path:result.conflictCopyPath??path},{status:201});
  }catch{
    const check=new URLSearchParams({workspace_id:`eq.${w.workspace_id}`,file_id:`eq.${fileId}`,select:"file_id",limit:"1"});
    const exists=await supabaseRequest(env,`/rest/v1/pkms_files?${check}`).then(r=>r.json() as Promise<unknown[]>).then(rows=>rows.length>0).catch(()=>true);
    if(!exists)await env.ASSET_BUCKET.delete(key).catch(()=>{});
    return json({error:"upload_failed",message:"The attachment could not be saved."},{status:409});
  }
}

export async function flushWorkspace(env:Env,id:string,login:string,leaseToken:string):Promise<void>{
  const w=await row(env,id,login);if(!w)return;
  const capturedRevision=Number(w.server_revision);const changed=await files(env,id,{dirty:"eq.true",revision:`lte.${capturedRevision}`,order:"revision.asc"});
  const token=await accessToken(env,login);const [owner,repo]=w.repository.split("/");const branch=w.branch.split("/").map(encodeURIComponent).join("/");const refPath=`/repos/${owner}/${repo}/git/ref/heads/${branch}`;
  const ref=await(await github(token,refPath)).json() as {object:{sha:string}};
  if(ref.object.sha!==w.github_head){
    if(!await recoverPreviousPkmsCommit(token,owner,repo,login,w,changed,ref.object.sha)){
      await supabaseRpc(env,"pkms_finish_flush",{p_workspace_id:id,p_lease_token:leaseToken,p_captured_revision:Number(w.server_revision),p_new_head:ref.object.sha,p_files:[],p_github_status:"external-change",p_message:"GitHub branch changed outside PKMS. Automatic push is paused to protect those changes."});return;
    }
  }
  if(!changed.length){await supabaseRpc(env,"pkms_finish_flush",{p_workspace_id:id,p_lease_token:leaseToken,p_captured_revision:Number(w.server_revision),p_new_head:ref.object.sha,p_files:[]});return;}
  const base=await(await github(token,`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`)).json() as {tree:{sha:string}};const revision=capturedRevision;const tree:Array<{path:string;mode:string;type:"blob";sha:string|null}>=[];const blobSha=new Map<string,string>();
  for(const f of changed){if(f.kind==="folder")continue;/* Where the file lives on GitHub: only a file that already has a blob sha is there, at its original path. Deleting anything else makes the trees API fail (BadObjectState). */const origin=f.sha?(f.previous_path??f.path):null;if(origin&&(f.deleted||origin!==f.path))tree.push({path:origin,mode:"100644",type:"blob",sha:null});if(f.deleted)continue;/* Never-loaded files (moved before opening) have no local body: re-point the existing blob instead of uploading an empty one. */if(f.sha&&(f.kind==="markdown"?f.content==null:!f.object_key)){tree.push({path:f.path,mode:"100644",type:"blob",sha:f.sha});blobSha.set(f.file_id,f.sha);continue;}let bytes:Uint8Array;if(f.kind==="markdown")bytes=encoder.encode(f.content??"");else{if(!f.object_key)continue;const object=await env.ASSET_BUCKET.get(f.object_key);if(!object)throw new Error("asset_missing");bytes=new Uint8Array(await object.arrayBuffer());}if(bytes.byteLength>MAX_GIT_FILE_BYTES)throw new Error("file_too_large");const blob=await(await github(token,`/repos/${owner}/${repo}/git/blobs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:b64(bytes),encoding:"base64"})})).json() as {sha:string};blobSha.set(f.file_id,blob.sha);tree.push({path:f.path,mode:"100644",type:"blob",sha:blob.sha});}
  let newHead=ref.object.sha;
  if(tree.length){const created=await(await github(token,`/repos/${owner}/${repo}/git/trees`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({base_tree:base.tree.sha,tree})})).json() as {sha:string};const commit=await(await github(token,`/repos/${owner}/${repo}/git/commits`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:"Sync PKMS workspace",tree:created.sha,parents:[ref.object.sha]})})).json() as {sha:string};await github(token,`/repos/${owner}/${repo}/git/refs/heads/${branch}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({sha:commit.sha,force:false})});newHead=commit.sha;}
  const completed=changed.map(f=>({fileId:f.file_id,revision:f.revision,deleted:f.deleted,sha:blobSha.get(f.file_id)??undefined}));
  await supabaseRpc(env,"pkms_finish_flush",{p_workspace_id:id,p_lease_token:leaseToken,p_captured_revision:revision,p_new_head:newHead,p_files:completed});
  for(const f of changed)if(f.object_key)await env.ASSET_BUCKET.delete(f.object_key);
}
async function recoverPreviousPkmsCommit(token:string,owner:string,repo:string,login:string,w:WorkspaceRow,changed:FileRow[],remoteHead:string):Promise<boolean>{
  if(!w.github_head||!changed.length)return false;
  const response=await github(token,`/repos/${owner}/${repo}/commits/${remoteHead}`);
  const commit=await response.json() as {commit?:{message?:string};author?:{login?:string|null};parents?:Array<{sha:string}>;files?:Array<{filename:string;status:string;sha:string|null;previous_filename?:string}>};
  const committed=commit.files;
  if(commit.commit?.message?.trim()!=="Sync PKMS workspace"||commit.author?.login?.toLowerCase()!==login.toLowerCase()||commit.parents?.length!==1||commit.parents[0].sha!==w.github_head||!committed||committed.length>=300){
    console.warn("github_flush_recovery_skipped",{reason:"commit_metadata_mismatch",changedFileCount:changed.length,remoteFileCount:committed?.length??-1});return false;
  }
  const paths=new Set<string>();
  for(const item of committed){paths.add(item.filename);if(item.previous_filename)paths.add(item.previous_filename);}
  const expectedPaths=new Set<string>();
  for(const file of changed){if(file.kind==="folder")continue;expectedPaths.add(file.path);if(file.previous_path)expectedPaths.add(file.previous_path);}
  if([...paths].some(path=>!expectedPaths.has(path))){
    console.warn("github_flush_recovery_skipped",{reason:"remote_paths_not_pending",changedFileCount:changed.length,remoteFileCount:committed.length});return false;
  }
  return true;
}
async function markFlushFailure(env:Env,w:WorkspaceRow,error:unknown):Promise<void>{
  if(!w.lease_token)return;
  const external=error instanceof GitHubError&&error.status===409;
  const message=external?"GitHub branch changed outside PKMS. Automatic push is paused to protect those changes.":error instanceof GitHubError?`GitHub sync failed (HTTP ${error.status}). Retrying automatically.`:"GitHub sync failed. Retrying automatically.";
  await supabaseRpc(env,"pkms_fail_flush",{p_workspace_id:w.workspace_id,p_lease_token:w.lease_token,p_message:message,p_external_change:external}).catch(()=>{});
}
export async function flushDueWorkspaces(env:Env):Promise<void>{
  const due=await supabaseRpc<WorkspaceRow[]>(env,"pkms_claim_due_workspaces",{p_limit:20});
  for(const w of due??[]){if(!w.lease_token)continue;try{await flushWorkspace(env,w.workspace_id,w.owner_login,w.lease_token);}catch(error){await markFlushFailure(env,w,error);}}
}

/** Cron step: advances each workspace's GitHub mirror by one bounded chunk, so it completes without a client open. */
export async function mirrorDueWorkspaces(env:Env):Promise<void>{
  const list=await(await supabaseRequest(env,`/rest/v1/pkms_workspaces?${new URLSearchParams({select:"*",limit:"20"})}`)).json() as WorkspaceRow[];
  for(const w of list)await mirror(env,w.owner_login,w,"cron").catch(()=>undefined);
}
