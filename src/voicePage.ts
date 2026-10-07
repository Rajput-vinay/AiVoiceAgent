export const VOICE_PAGE = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Buddy Voice</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;background:#1e1e1e;color:#ddd}
  button,select,input{font-size:15px;padding:8px 12px;border-radius:6px;border:1px solid #555;background:#2d2d2d;color:#ddd}
  #mic{width:100%;padding:18px;margin:12px 0;font-size:17px}
  #mic.on{background:#a1260d;border-color:#f14c4c}
  #status{opacity:.7;margin:8px 0;min-height:20px}
  #log div{margin:10px 0;line-height:1.5}
  .you b{color:#4fc1ff}.buddy b{color:#89d185}
  pre{background:#111;padding:8px;overflow:auto;white-space:pre-wrap;font-size:13px}
  #f{display:flex;gap:8px;margin-top:12px}#txt{flex:1}
</style></head><body>
<h2>🤖 Buddy Voice</h2>
<button id="start">▶ Start (audio enable karo)</button>
<select id="lang">
  <option value="en-IN">Mic: English / Hinglish (en-IN)</option>
  <option value="hi-IN">Mic: Hindi (hi-IN)</option>
</select>
<button id="mic">🎙️ Hold to talk (ya Space dabaye rakho)</button>
<div id="status">Pehle Start dabao.</div>
<div id="log"></div>
<form id="f"><input id="txt" placeholder="ya yahan type karo..." autocomplete="off"><button>Send</button></form>
<script>
var T = new URLSearchParams(location.search).get('t');
var logEl = document.getElementById('log');
var statusEl = document.getElementById('status');
var mic = document.getElementById('mic');
var langSel = document.getElementById('lang');
var txt = document.getElementById('txt');

function setStatus(s){ statusEl.textContent = s; }

function add(who, text, detail){
  var d = document.createElement('div'); d.className = who;
  var b = document.createElement('b'); b.textContent = (who === 'you' ? 'You: ' : 'Buddy: ');
  d.appendChild(b); d.appendChild(document.createTextNode(text));
  if (detail){ var p = document.createElement('pre'); p.textContent = detail; d.appendChild(p); }
  logEl.appendChild(d); window.scrollTo(0, document.body.scrollHeight);
}

function speak(text){
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-IN';
  var v = speechSynthesis.getVoices().filter(function(x){ return x.lang === 'en-IN' || x.lang === 'en_IN'; })[0];
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

async function ask(text){
  add('you', text); setStatus('🤔 Buddy soch raha hai...');
  try {
    var r = await fetch('/ask?t=' + T, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text }) });
    var j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    add('buddy', j.spoken, j.detail); speak(j.spoken);
  } catch (e) { add('buddy', 'Error: ' + e.message); }
  setStatus('Ready.');
}

var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
var rec = null, heard = '', listening = false;

function startListen(){
  if (!SR){ setStatus('Is browser me speech recognition nahi hai. Chrome ya Edge use karo.'); return; }
  if (listening) return;
  if (window.speechSynthesis) speechSynthesis.cancel(); // interrupt Buddy when you start talking
  rec = new SR(); rec.lang = langSel.value; rec.interimResults = true; rec.continuous = true; heard = '';
  rec.onresult = function(e){
    var s = ''; for (var i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
    heard = s; setStatus('🎙️ ' + s);
  };
  rec.onerror = function(e){ setStatus('Mic error: ' + e.error); };
  rec.onend = function(){
    listening = false; mic.classList.remove('on');
    var t = heard.trim(); heard = '';
    if (t) ask(t); else setStatus('Ready.');
  };
  listening = true; mic.classList.add('on'); rec.start();
}
function stopListen(){ if (rec && listening) rec.stop(); }

mic.addEventListener('mousedown', startListen);
mic.addEventListener('mouseup', stopListen);
mic.addEventListener('mouseleave', stopListen);
mic.addEventListener('touchstart', function(e){ e.preventDefault(); startListen(); });
mic.addEventListener('touchend', stopListen);
document.addEventListener('keydown', function(e){
  if (e.code === 'Space' && !e.repeat && document.activeElement !== txt){ e.preventDefault(); startListen(); }
});
document.addEventListener('keyup', function(e){
  if (e.code === 'Space' && document.activeElement !== txt){ e.preventDefault(); stopListen(); }
});

document.getElementById('f').addEventListener('submit', function(e){
  e.preventDefault(); var t = txt.value.trim(); if (t){ txt.value = ''; ask(t); }
});

document.getElementById('start').addEventListener('click', function(){
  // A click is required once, otherwise the browser blocks audio.
  speak('Buddy ready hai.'); this.style.display = 'none'; setStatus('Ready. Space dabaye rakho aur bolo.');
});

var es = new EventSource('/events?t=' + T);
es.onmessage = function(e){
  var m = JSON.parse(e.data);
  if (m.type === 'speak'){ add('buddy', m.text); speak(m.text); }
};
es.onerror = function(){ setStatus('VS Code se connection toot gaya. Page refresh karo ya "Buddy: Open Voice" dobara chalao.'); };
</script></body></html>`;
