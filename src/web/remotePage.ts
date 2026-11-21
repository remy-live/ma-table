// La page « Mon retour » servie par la tablette, pour un musicien sans l'appli.
// Elle demande l'état toutes les 0,7 s et envoie ses gestes ; la tablette ne
// laisse toucher QUE le retour de ce musicien (et ce que ses droits permettent).
export const REMOTE_PAGE = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Mon retour</title>
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none}
body{margin:0;background:#0B0D10;color:#E8EAED;font:15px/1.3 system-ui,-apple-system,Roboto,sans-serif}
header{padding:16px 14px 8px;display:flex;align-items:center;gap:10px}
h1{font-size:22px;margin:0;flex:1}
.sub{color:#9AA3AD;font-size:12px}
.card{background:#15181C;border:1px solid #2A2F36;border-radius:16px;margin:8px 12px;padding:12px}
.big{display:flex;gap:8px}
.big button{flex:1;height:64px;border-radius:14px;border:0;font-size:17px;font-weight:800}
.moi{background:#34D399;color:#052E1F}.autres{background:#F59E0B;color:#1F1300}
.row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #22262B}
.src{padding:8px 0;border-bottom:1px solid #22262B}.src:last-child{border-bottom:0}.top{display:flex;align-items:center;gap:8px;margin-bottom:4px}.ctl{display:flex;align-items:center;gap:8px}
.more{width:100%;height:40px;margin-top:6px;border-radius:12px;border:1px solid #3A4048;background:#1E2227;color:#E8EAED;font-weight:700}
.row:last-child{border-bottom:0}
.dot{width:9px;height:9px;border-radius:5px;flex:none}
.name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700}
.me .name{color:#34D399}
.db{width:58px;text-align:right;color:#9AA3AD;font-size:13px;font-variant-numeric:tabular-nums}
.pm{width:44px;height:40px;border-radius:12px;border:1px solid #3A4048;background:#1E2227;color:#E8EAED;font-size:22px;font-weight:800}
input[type=range]{flex:1;accent-color:#34D399;height:32px}
.k{color:#9AA3AD;font-size:11px;font-weight:700;letter-spacing:.8px;margin:2px 0 6px}
.tog{width:100%;height:46px;border-radius:12px;border:2px solid #34D399;background:#13261E;color:#E8EAED;font-weight:700}
.tog.off{border-color:#EF4444;background:#2A1416}
.err{color:#FCA5A5;text-align:center;padding:30px 20px;font-weight:700}
</style></head><body>
<header><div style="flex:1"><h1 id="t">Mon retour</h1><div class="sub" id="s">connexion…</div></div></header>
<div id="app"></div>
<script>
var q=new URLSearchParams(location.search),K=q.get('k')||'',busy=0,st=null,drag=null;
function api(p){return fetch('/api/'+p+(p.indexOf('?')<0?'?':'&')+'k='+encodeURIComponent(K),{method:p.indexOf('state')==0?'GET':'POST',cache:'no-store'}).then(function(r){return r.json()})}
function txt(d){return d<-40?'coupé':(d>0?'+':'')+Math.round(d)+' dB'}
function act(a){busy=Date.now();api('do?'+a).then(function(s){if(s&&s.ok!==false)draw(s)}).catch(function(){})}
function row(s){return '<div class="src'+(s.me?' me':'')+'"><div class="top"><span class="dot" style="background:'+s.color+'"></span><span class="name">'+esc(s.label)+'</span><span class="db">'+txt(s.db)+'</span></div><div class="ctl">'+
'<button class="pm" onclick="act(\\'a=shift&i='+s.i+'&db=-2\\')">−</button>'+
'<input type="range" min="-40" max="10" step="1" value="'+Math.max(-40,s.db)+'" oninput="drag=1;this.parentNode.parentNode.querySelector(\\'.db\\').textContent=txt(+this.value)" onchange="drag=0;act(\\'a=set&i='+s.i+'&db=\\'+this.value)">'+
'<button class="pm" onclick="act(\\'a=shift&i='+s.i+'&db=2\\')">+</button></div></div>'}
var all=0;function shown(s){return all||s.me||s.db>-40||!/^(Voie|Entrée|Ch) ?\\d+$/i.test(s.label)}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function draw(s){st=s;document.getElementById('t').textContent=s.name;document.getElementById('s').textContent='AUX '+s.bus+' · tu ne règles que ton retour';
if(drag)return;var h='<div class="card"><div class="big"><button class="moi" onclick="act(\\'a=moi\\')">Plus de moi</button><button class="autres" onclick="act(\\'a=autres\\')">Plus des autres</button></div></div>';
var vis=s.sources.filter(shown);h+='<div class="card"><div class="k">DANS MON CASQUE</div>'+vis.map(row).join('')+(vis.length<s.sources.length||all?'<button class="more" onclick="all=!all;draw(st)">'+(all?'Masquer les voies vides':'Voir toutes les voies ('+s.sources.length+')')+'</button>':'')+'</div>';
h+='<div class="card"><div class="k">VOLUME DE MON CASQUE</div><div class="row"><span class="name">Général</span><input type="range" min="-40" max="10" value="'+Math.max(-40,s.master)+'" oninput="drag=1" onchange="drag=0;act(\\'a=master&db=\\'+this.value)"><span class="db">'+txt(s.master)+'</span></div>';
h+='<button class="tog'+(s.lim?'':' off')+'" '+(s.canLim?'':'disabled')+' onclick="act(\\'a=lim&on='+(s.lim?0:1)+'\\')">Protège-oreilles : '+(s.lim?'actif (−6 dB max)':'coupé')+'</button></div>';
if(s.chans&&s.chans.length){h+='<div class="card"><div class="k">MES VOIES (gain, coupure)</div>'+s.chans.map(function(c){return '<div class="row"><span class="name">'+esc(c.name)+'</span><button class="pm" onclick="act(\\'a=gain&ch='+c.ch+'&db=-1\\')">−</button><span class="db">'+(c.gain>0?'+':'')+c.gain+' dB</span><button class="pm" onclick="act(\\'a=gain&ch='+c.ch+'&db=1\\')">+</button><button class="pm" style="width:70px;font-size:13px;'+(c.on?'':'background:#7F1D1D')+'" onclick="act(\\'a=mute&ch='+c.ch+'\\')">'+(c.on?'Couper':'Coupée')+'</button></div>'}).join('')+'</div>'}
document.getElementById('app').innerHTML=h}
function tick(){if(Date.now()-busy<400||drag)return;api('state').then(function(s){if(s.ok===false){document.getElementById('app').innerHTML='<div class="err">'+esc(s.msg||'Invitation inconnue')+'</div>';return}draw(s)}).catch(function(){document.getElementById('s').textContent='La tablette ne répond plus…'})}
tick();setInterval(tick,700);
</script></body></html>`;
