import * as vscode from "vscode";
import { Reply } from "./conversation";
import { Analysis, DetectedIssue } from "./types";

export type BuddyViewMessage = { type: "ask"; text: string } | { type: "verify" } | { type: "clear" };

export class BuddyView implements vscode.WebviewViewProvider {
  static readonly viewType = "buddy.view";
  private view?: vscode.WebviewView;
  onMessage?: (m: BuddyViewMessage) => void;

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((m: BuddyViewMessage) => this.onMessage?.(m));
    view.onDidDispose(() => { if (this.view === view) this.view = undefined; });
  }

  focus() { this.view?.show?.(true); }
  status(text: string) { this.post({ type: "status", text }); }
  issue(issue: DetectedIssue, analysis?: Analysis) { this.post({ type: "issue", issue, analysis }); }
  reply(r: Reply) { this.post({ type: "reply", ...r }); }
  error(text: string) { this.post({ type: "error", text }); }
  fixed(text: string) { this.post({ type: "fixed", text }); }
  private post(m: unknown) { this.view?.webview.postMessage(m); }

  private html(w: vscode.Webview) {
    const nonce = Math.random().toString(36).slice(2);
    return `<!doctype html><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${w.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'">
<style>
body{font-family:var(--vscode-font-family);padding:10px;color:var(--vscode-foreground)}
h3{margin:0 0 6px}.status{opacity:.7;font-size:11px;margin-bottom:8px}
#chat{height:55vh;overflow:auto}.m{padding:8px;margin:6px 0;border-radius:6px;white-space:pre-wrap}
.y{background:var(--vscode-input-background)}.b{background:var(--vscode-editor-inactiveSelectionBackground)}
#row{display:flex;gap:5px}input{flex:1;padding:7px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border)}
button{padding:6px 8px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;border-radius:4px}#issue{padding:7px;background:var(--vscode-textBlockQuote-background);display:none}
</style>
<h3>🤖 AI Coding Buddy</h3><div class="status" id="s">Ready. Talk or type.</div>
<div id="issue"></div><div id="chat"></div>
<div style="display:flex;gap:5px;margin:6px 0"><button id="mic">🎙 Talk</button><button id="speak">🔊 Speak</button><button id="verify">✓ Verify Fix</button><button id="clear">Clear</button></div>
<form id="row"><input id="q" placeholder="Ask Buddy..."><button>Send</button></form>
<script nonce="${nonce}">
const v=acquireVsCodeApi(),c=document.getElementById("chat"),q=document.getElementById("q"),s=document.getElementById("s"),mic=document.getElementById("mic"),speakBtn=document.getElementById("speak");
let voices=[];
function loadVoices(){voices=speechSynthesis.getVoices();return voices}
loadVoices();
speechSynthesis.onvoiceschanged=loadVoices;
function speak(t){
  if(!("speechSynthesis" in window)||!t)return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(t);
  u.lang="en-IN";
  u.rate=0.95;
  u.pitch=1;
  const preferred=voices.find(x=>/^en-IN$/i.test(x.lang))||voices.find(x=>/^en/i.test(x.lang));
  if(preferred)u.voice=preferred;
  u.onstart=()=>s.textContent="🔊 Speaking...";
  u.onend=()=>s.textContent="Ready.";
  u.onerror=()=>s.textContent="Ready. (Voice playback unavailable)";
  speechSynthesis.speak(u);
}
function add(cls,t,d){let x=document.createElement("div");x.className="m "+cls;x.textContent=t+(d?"\n\n"+d:"");c.appendChild(x);c.scrollTop=c.scrollHeight}
function ask(t){if(!t.trim())return;add("y",t);q.value="";s.textContent="🤔 Investigating...";v.postMessage({type:"ask",text:t})}
document.getElementById("row").onsubmit=e=>{e.preventDefault();ask(q.value)};
speakBtn.onclick=()=>{const msgs=c.querySelectorAll(".b");const last=msgs[msgs.length-1];if(last)speak(last.textContent||"")};
document.getElementById("verify").onclick=()=>{s.textContent="🔎 Checking diagnostics...";v.postMessage({type:"verify"})};
document.getElementById("clear").onclick=()=>{c.innerHTML="";v.postMessage({type:"clear"})};
window.onmessage=e=>{let m=e.data;if(m.type==="status")s.textContent=m.text;if(m.type==="reply"){add("b",m.spoken,m.detail);speak(m.spoken);s.textContent="Ready."}if(m.type==="error"){add("b","Error: "+m.text);s.textContent="Error"}if(m.type==="fixed"){add("b",m.text);speak(m.text);s.textContent="Verified"}if(m.type==="issue"){let i=m.issue;let z=document.getElementById("issue");z.style.display="block";z.textContent=i.severity.toUpperCase()+": "+i.title+" — "+(i.file||"terminal")+(i.line?":"+i.line:"");if(m.analysis){add("b",m.analysis.spoken,m.analysis.example||m.analysis.explanation);speak(m.analysis.spoken)}}};
let SR=window.SpeechRecognition||window.webkitSpeechRecognition,rec;
mic.onclick=()=>{if(!SR){s.textContent="Mic unavailable in this VS Code webview. Type instead.";return}if(rec){rec.stop();rec=null;return}if("speechSynthesis" in window)speechSynthesis.cancel();rec=new SR();rec.lang="en-IN";rec.interimResults=true;let heard="";rec.onresult=e=>{heard=Array.from(e.results).map(r=>r[0].transcript).join("");s.textContent="🎙 "+heard};rec.onerror=e=>{s.textContent="Mic error: "+e.error};rec.onend=()=>{rec=null;if(heard.trim())ask(heard);else s.textContent="Ready."};rec.start();s.textContent="🎙 Listening...";
};
</script>`;
  }
}
