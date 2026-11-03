
const ETAPAS=[
 ["Berçário",10],["Maternal I",15],["Maternal II",15],["Jardim I",20],["Jardim II",20],
 ["1º ano",20],["2º ano",25],["3º ano",25],["4º ano",25],["5º ano",25],
 ["6º ano",30],["7º ano",30],["8º ano",30],["9º ano",30]];
const LIM=Object.fromEntries(ETAPAS);
const NOMES=ETAPAS.map(e=>e[0]);
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const plural=(n,s,p)=>n===1?s:p;

/* ===== CONFIGURAÇÃO: preencha com os dados do seu projeto Supabase ===== */
const SUPABASE_URL="https://ruaakzhqcrrwtbgdvjia.supabase.co";     
const SUPABASE_KEY="sb_publishable_hnA2Lr2eHZeIhlMRPHNazQ_PCUlMXq3"; 
/* ======================================================================= */
let sb=null, editor=false, usuario=null;
let escolas={};           // id -> dados
let selecionada=null;
let ano=(new Date()).getFullYear();
const saveTimers={};

function normEtapa(t){
  const s=String(t||"").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[°ºo]\s*/g,"º ");
  const map={"bercario":"Berçário","maternal i":"Maternal I","maternal ii":"Maternal II","maternal 1":"Maternal I","maternal 2":"Maternal II",
   "jardim i":"Jardim I","jardim ii":"Jardim II","jardim 1":"Jardim I","jardim 2":"Jardim II"};
  const raw=String(t||"").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ");
  if(map[raw]) return map[raw];
  const m=raw.match(/^(\d)\s*[°ºo]?\s*ano/); if(m) return m[1]+"º ano";
  return null;
}

/* ---------- Cálculo ---------- */
function calcular(e){
  const atual={};
  NOMES.forEach(n=>atual[n]={turmas:0,alunos:0,cap:0,acima:[],lista:[]});
  (e.turmas||[]).forEach(t=>{const a=atual[t.etapa]; if(!a) return; a.turmas++; a.alunos+=t.alunos; a.cap+=LIM[t.etapa]; a.lista.push(t.alunos); if(t.alunos>LIM[t.etapa]) a.acima.push(t.alunos);});
  const prev=e.turmasPrevistas||{};
  const proj=[]; let saem=null;
  NOMES.forEach((n,i)=>{
    const turmas=(prev[n]!=null)?prev[n]:atual[n].turmas;
    const anterior=i>0?NOMES[i-1]:null;
    const vindos=anterior?atual[anterior].alunos:0;
    if(turmas>0){
      const cap=turmas*LIM[n], vagas=cap-vindos;
      proj.push({etapa:n,turmas,cap,vindos,de:anterior&&atual[anterior].turmas?anterior:null,vagas,status:vagas>0?"vagas":vagas<0?"espera":"lotada"});
    } else if(vindos>0 && anterior){
      saem=saem||[]; saem.push({de:anterior,para:n,qtd:vindos});
    }
  });
  const ult=NOMES[NOMES.length-1]; if(atual[ult].alunos>0){saem=saem||[];saem.push({de:ult,para:"Ensino Médio",qtd:atual[ult].alunos});}
  const etapasAtuais=NOMES.filter(n=>atual[n].turmas>0).map(n=>{const a=atual[n];const d=a.cap-a.alunos;return {etapa:n,...a,saldo:d,status:d>0?"vagas":d<0?"espera":"lotada"};});
  const totAtual=etapasAtuais.reduce((s,a)=>s+a.turmas,0);
  const totProj=proj.reduce((s,p)=>s+p.turmas,0);
  return {atual:etapasAtuais,proj,saem,totAtual,totProj};
}

function observacoes(e,c,anoP){
  const out=[];
  const comp=+e.capacidadeTurmas||0;
  if(comp){
    const livreA=comp-c.totAtual, livreP=comp-c.totProj;
    let t=`A escola comporta ${comp} turmas${e.salas?` (${e.salas} salas em 2 turnos)`:""} e funciona hoje com ${c.totAtual}. `;
    if(livreA>0) t+=`Existe${livreA>1?"m":""} ${livreA} ${plural(livreA,"sala/turno livre","salas/turnos livres")}.`;
    else if(livreA<0) t+=`Funciona com ${-livreA} ${plural(-livreA,"turma","turmas")} além da capacidade.`;
    else t+="Não há sala livre.";
    if(c.totProj!==c.totAtual) t+=` Para ${anoP} estão previstas ${c.totProj} turmas${livreP>0?`, ficando ${livreP} ${plural(livreP,"sala/turno livre","salas/turnos livres")}`:livreP<0?`, ${-livreP} acima da capacidade`:", ocupando todas as salas"}.`;
    out.push({tipo:"info",texto:t});
  }
  c.atual.forEach(a=>{ if(a.acima.length) out.push({tipo:"espera",texto:`${a.etapa} (situação atual): ${a.acima.length} de ${a.turmas} ${plural(a.turmas,"turma","turmas")} acima do limite de ${LIM[a.etapa]} alunos (${a.acima.join(" e ")}).`}); });
  c.proj.forEach(p=>{
    if(p.status==="espera") out.push({tipo:"espera",texto:`${p.etapa} (${anoP}): capacidade de ${p.cap} e ${p.vindos} alunos previstos. Ultrapassa em ${-p.vagas}; a turma necessita de lista de espera.`});
    else if(p.status==="vagas") out.push({tipo:"vagas",texto:`${p.etapa} (${anoP}): capacidade de ${p.cap} e ${p.vindos} alunos previstos, ${p.vagas} ${plural(p.vagas,"vaga","vagas")}. A turma não possui demanda suficiente, portanto não tem lista de espera.`});
    else out.push({tipo:"lotada",texto:`${p.etapa} (${anoP}): capacidade de ${p.cap} e ${p.vindos} alunos previstos. Turma completa, sem vagas e sem excedente.`});
  });
  const livre=comp?comp-c.totProj:0;
  const falta=c.proj.filter(p=>p.status==="espera").sort((a,b)=>a.vagas-b.vagas);
  if(livre>0 && falta.length){
    const f=falta[0];
    out.push({tipo:"info",texto:`Sugestão: com a sala livre, abrir mais 1 turma de ${f.etapa} elimina o excedente de ${-f.vagas} e abre ${LIM[f.etapa]+f.vagas} ${plural(LIM[f.etapa]+f.vagas,"vaga","vagas")}.`,acao:f.etapa});
  }
  (c.saem||[]).forEach(s=>out.push({tipo:"info",texto:`${s.qtd} alunos do ${s.de} concluem a etapa oferecida pela escola e seguem para o ${s.para} em outra unidade.`}));
  return out;
}

/* ---------- Render: escolas ---------- */
function ordenadas(){return Object.entries(escolas).sort((a,b)=>a[1].nome.localeCompare(b[1].nome,"pt-BR"));}
function statusGeral(e){const c=calcular(e); if(c.proj.some(p=>p.status==="espera")) return "espera"; if(c.proj.some(p=>p.status==="vagas")) return "vagas"; return "lotada";}

function renderLista(){
  const L=ordenadas();
  $("#countLabel").textContent=`${L.length} ${plural(L.length,"escola","escolas")} em ${ano}`;
  const box=$("#schoolList");
  if(!L.length){box.innerHTML=`<div class="empty" style="padding:16px">Nenhuma escola em ${ano}. Importe as turmas ou cadastre uma escola.</div>`;return;}
  box.innerHTML=L.map(([id,e])=>`<button data-id="${esc(id)}" aria-current="${id===selecionada}"><span><span>${esc(e.nome)}</span><small>INEP ${esc(e.inep||"—")} · ${(e.turmas||[]).length} turmas</small></span><span class="dot ${statusGeral(e)}" title="${{espera:"Possui lista de espera",vagas:"Possui vagas",lotada:"Sem vagas"}[statusGeral(e)]}"></span></button>`).join("");
  box.querySelectorAll("button").forEach(b=>b.onclick=()=>{selecionada=b.dataset.id;renderLista();renderEscola();});
}

function tabelaAtual(c){
  if(!c.atual.length) return `<div class="empty">Nenhuma turma cadastrada.</div>`;
  const t=c.atual.reduce((s,a)=>({turmas:s.turmas+a.turmas,alunos:s.alunos+a.alunos,cap:s.cap+a.cap}),{turmas:0,alunos:0,cap:0});
  return `<div class="tablewrap"><table><thead><tr><th>Etapa</th><th class="n">Turmas</th><th>Alunos por turma</th><th class="n">Alunos</th><th class="n">Limite</th><th class="n">Capacidade</th><th class="n">Saldo</th><th>Situação</th></tr></thead><tbody>
  ${c.atual.map(a=>`<tr><td>${a.etapa}</td><td class="n">${a.turmas}</td><td><div class="chips">${a.lista.map(x=>`<span class="chip ${x>LIM[a.etapa]?"over":""}">${x}</span>`).join("")}</div></td><td class="n">${a.alunos}</td><td class="n">${LIM[a.etapa]}</td><td class="n">${a.cap}</td><td class="n ${a.saldo<0?"neg":a.saldo>0?"pos":""}">${a.saldo>0?"+":""}${a.saldo}</td><td>${pill(a.status,a.saldo)}</td></tr>`).join("")}
  </tbody><tfoot><tr><td>Total</td><td class="n">${t.turmas}</td><td></td><td class="n">${t.alunos}</td><td></td><td class="n">${t.cap}</td><td class="n">${t.cap-t.alunos}</td><td></td></tr></tfoot></table></div>`;
}
function pill(st,v){return st==="espera"?`<span class="pill espera">Lista de espera (${-v})</span>`:st==="vagas"?`<span class="pill vagas">Sem lista de espera</span>`:`<span class="pill lotada">Completa</span>`;}

function tabelaProj(c,editavel){
  if(!c.proj.length) return `<div class="empty">Sem turmas previstas.</div>`;
  const t=c.proj.reduce((s,p)=>({turmas:s.turmas+p.turmas,cap:s.cap+p.cap,vindos:s.vindos+p.vindos,vagas:s.vagas+Math.max(p.vagas,0),exc:s.exc+Math.max(-p.vagas,0)}),{turmas:0,cap:0,vindos:0,vagas:0,exc:0});
  return `<div class="tablewrap"><table><thead><tr><th>Etapa</th><th class="n">Turmas</th><th class="n">Capacidade</th><th>Vêm de</th><th class="n">Alunos previstos</th><th class="n">Vagas</th><th>Situação</th></tr></thead><tbody>
  ${c.proj.map(p=>`<tr><td>${p.etapa}</td><td class="n">${editavel?`<input type="number" min="0" max="20" value="${p.turmas}" data-prev="${esc(p.etapa)}" id="prev-${NOMES.indexOf(p.etapa)}" aria-label="Turmas de ${esc(p.etapa)}">`:p.turmas}</td><td class="n">${p.cap}</td><td>${p.de||"Novas matrículas"}</td><td class="n">${p.vindos}</td><td class="n ${p.vagas<0?"neg":p.vagas>0?"pos":""}">${p.vagas}</td><td>${pill(p.status,p.vagas)}</td></tr>`).join("")}
  </tbody><tfoot><tr><td>Total</td><td class="n">${t.turmas}</td><td class="n">${t.cap}</td><td></td><td class="n">${t.vindos}</td><td class="n">${t.vagas}${t.exc?` <span class="neg">(−${t.exc})</span>`:""}</td><td></td></tr></tfoot></table></div>`;
}

function renderEscola(){
  const v=$("#schoolView");
  const e=escolas[selecionada];
  if(!e){v.innerHTML=`<div class="panel empty">Selecione uma escola na lista ou importe as turmas para começar.</div>`;return;}
  const c=calcular(e), anoP=ano+1, obs=observacoes(e,c,anoP);
  const temOverride=e.turmasPrevistas&&Object.keys(e.turmasPrevistas).length;
  v.innerHTML=`
  <div class="schoolhead">
    <div><div class="eyebrow">INEP ${esc(e.inep||"não informado")}</div><h2>${esc(e.nome)}</h2></div>
    <div class="fields">
      <label for="f-nome">Nome<input id="f-nome" value="${esc(e.nome)}" style="width:220px"></label>
      <label for="f-inep">Código INEP<input id="f-inep" value="${esc(e.inep||"")}" style="width:110px"></label>
      <label for="f-salas">Salas<input id="f-salas" type="number" min="0" value="${e.salas??""}"></label>
      <label for="f-cap">Comporta (turmas)<input id="f-cap" type="number" min="0" value="${e.capacidadeTurmas??""}"></label>
    </div>
  </div>

  <section class="block">
    <h3>Situação atual · ${ano}</h3>
    <p class="sub">Turmas e matrículas de hoje, comparadas ao limite da resolução.</p>
    ${tabelaAtual(c)}
  </section>

  <section class="block">
    <h3>Projeção · ${anoP}</h3>
    <p class="sub">Cada aluno avança uma etapa. Vagas = capacidade − alunos que sobem. Ajuste o nº de turmas para simular o uso das salas livres.${temOverride?` <button class="ghost" id="btnResetPrev" style="color:var(--accent)">Voltar às turmas atuais</button>`:""}</p>
    ${tabelaProj(c,true)}
  </section>

  <section class="block">
    <h3>Observações</h3>
    <p class="sub">Entram no documento do Ministério Público.</p>
    <ul class="obs">${obs.map(o=>`<li class="${o.tipo}">${esc(o.texto)}${o.acao?`<button class="act edit-only" data-abrir="${esc(o.acao)}">Aplicar</button>`:""}</li>`).join("")}</ul>
  </section>

  <details class="edit panel edit-only">
    <summary>Editar turmas de ${ano} (${(e.turmas||[]).length})</summary>
    <div class="editlist" style="margin-top:12px">
      ${(e.turmas||[]).map((t,i)=>`<div class="editrow"><span class="idx">${i+1}</span>
        <select data-i="${i}" data-k="etapa" id="t-etapa-${i}" aria-label="Etapa da turma ${i+1}">${NOMES.map(n=>`<option ${n===t.etapa?"selected":""}>${n}</option>`).join("")}</select>
        <input type="number" min="0" data-i="${i}" data-k="alunos" value="${t.alunos}" id="t-alunos-${i}" aria-label="Alunos da turma ${i+1}"> <span class="status">alunos</span>
        <button class="ghost" data-del="${i}" aria-label="Remover turma ${i+1}">Remover</button></div>`).join("")}
    </div>
    <div class="row" style="margin-top:10px"><button id="btnAddTurma">+ Turma</button><span style="flex:1"></span><button class="ghost" id="btnDelEscola">Excluir escola</button></div>
    <div id="confirmDel" hidden class="row" style="margin-top:8px"><span>Excluir <b>${esc(e.nome)}</b> de ${ano}?</span><button id="btnDelSim" style="color:var(--bad);border-color:var(--bad)">Excluir</button><button id="btnDelNao">Cancelar</button></div>
  </details>`;

  if(!editor){v.querySelectorAll("input,select").forEach(i=>i.disabled=true);v.querySelector(".fields").hidden=true;}
  const upd=(patch)=>{Object.assign(e,patch);agendarSalvar(selecionada);renderLista();renderEscola();};
  const bindField=(id,key,num)=>{const el=$("#"+id);el.onchange=()=>{let val=el.value.trim();if(num) val=val===""?null:Math.max(0,parseInt(val)||0);upd({[key]:val});};};
  bindField("f-nome","nome");bindField("f-inep","inep");bindField("f-salas","salas",true);bindField("f-cap","capacidadeTurmas",true);
  v.querySelectorAll("[data-prev]").forEach(inp=>inp.onchange=()=>{const n=inp.dataset.prev;const tp={...(e.turmasPrevistas||{})};const val=Math.max(0,parseInt(inp.value)||0);if(val===c.atual.find(a=>a.etapa===n)?.turmas) delete tp[n]; else tp[n]=val;upd({turmasPrevistas:tp});});
  const rp=$("#btnResetPrev"); if(rp) rp.onclick=()=>upd({turmasPrevistas:{}});
  v.querySelectorAll("[data-abrir]").forEach(b=>b.onclick=()=>{const n=b.dataset.abrir;const p=c.proj.find(x=>x.etapa===n);const tp={...(e.turmasPrevistas||{})};tp[n]=p.turmas+1;upd({turmasPrevistas:tp});toast(`Mais 1 turma de ${n} prevista para ${anoP}`);});
  v.querySelectorAll(".editrow [data-k]").forEach(el=>el.onchange=()=>{const i=+el.dataset.i;const ts=e.turmas.map(t=>({...t}));ts[i][el.dataset.k]=el.dataset.k==="alunos"?Math.max(0,parseInt(el.value)||0):el.value;upd({turmas:ts});keepOpen();});
  v.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{const ts=e.turmas.filter((_,i)=>i!==+b.dataset.del);upd({turmas:ts});keepOpen();});
  $("#btnAddTurma").onclick=()=>{upd({turmas:[...(e.turmas||[]),{etapa:"Berçário",alunos:0}]});keepOpen();};
  $("#btnDelEscola").onclick=()=>{$("#confirmDel").hidden=false;};
  $("#btnDelNao").onclick=()=>{$("#confirmDel").hidden=true;};
  $("#btnDelSim").onclick=async()=>{const id=selecionada;delete escolas[id];selecionada=ordenadas()[0]?.[0]||null;renderLista();renderEscola();const {error}=await sb.from("escolas").delete().eq("id",id);msgSync(error?"Não foi possível excluir: "+error.message:"Escola excluída.");};
}
function keepOpen(){const d=document.querySelector("details.edit");if(d)d.open=true;}

/* ---------- Relatório ---------- */
function construirRelatorio(){
  const anoP=ano+1, L=ordenadas();
  const tot={};
  L.forEach(([,e])=>calcular(e).proj.forEach(p=>{const t=tot[p.etapa]||(tot[p.etapa]={turmas:0,cap:0,vindos:0,vagas:0,exc:0,escolas:[]});t.turmas+=p.turmas;t.cap+=p.cap;t.vindos+=p.vindos;if(p.vagas>0)t.vagas+=p.vagas;if(p.vagas<0){t.exc+=-p.vagas;t.escolas.push(e.nome);}}));
  const etTot=NOMES.filter(n=>tot[n]);
  let h=`<h2>Quadro de vagas e lista de espera · ${anoP}</h2><p class="docsub">Rede Municipal de Ensino · conferência realizada com base nas matrículas de ${ano}</p>`;
  h+=`<p class="meta">Limites por turma conforme a resolução: Berçário 10; Maternal I e II 15; Jardim I e II 20; 1º ano 20; 2º ao 5º ano 25; 6º ao 9º ano 30.</p>`;
  if(!L.length) return h+`<div class="empty">Nenhuma escola cadastrada em ${ano}.</div>`;
  h+=`<h3>Consolidado da rede</h3><div class="tablewrap"><table><thead><tr><th>Etapa</th><th class="n">Turmas</th><th class="n">Capacidade</th><th class="n">Alunos previstos</th><th class="n">Vagas</th><th class="n">Excedente</th><th>Situação</th></tr></thead><tbody>
  ${etTot.map(n=>{const t=tot[n];return `<tr><td>${n}</td><td class="n">${t.turmas}</td><td class="n">${t.cap}</td><td class="n">${t.vindos}</td><td class="n">${t.vagas}</td><td class="n ${t.exc?"neg":""}">${t.exc}</td><td>${t.exc?`<span class="pill espera">Lista de espera em ${t.escolas.length} ${plural(t.escolas.length,"escola","escolas")}</span>`:t.vagas?`<span class="pill vagas">Sem lista de espera</span>`:`<span class="pill lotada">Completa</span>`}</td></tr>`;}).join("")}
  </tbody></table></div>`;
  L.forEach(([,e],i)=>{
    const c=calcular(e), obs=observacoes(e,c,anoP).filter(o=>!o.acao);
    h+=`<h3>${i+1}. ${esc(e.nome)}</h3><p class="meta">Código INEP ${esc(e.inep||"não informado")}${e.salas?` · ${e.salas} salas`:""}${e.capacidadeTurmas?` · comporta ${e.capacidadeTurmas} turmas`:""}</p>`;
    h+=`<div class="eyebrow" style="margin:10px 0 6px">Situação atual · ${ano}</div>`+tabelaAtual(c);
    h+=`<div class="eyebrow" style="margin:14px 0 6px">Previsão de vagas · ${anoP}</div>`+tabelaProj(c,false);
    h+=`<div class="eyebrow" style="margin:14px 0 0">Observações</div><ul>${obs.map(o=>`<li>${esc(o.texto)}</li>`).join("")}</ul>`;
  });
  return h;
}
function renderRelatorio(){$("#docView").innerHTML=construirRelatorio();}

function csv(){
  const anoP=ano+1, rows=[["Escola","INEP","Etapa","Turmas "+anoP,"Capacidade","Alunos previstos","Vagas","Situação"]];
  ordenadas().forEach(([,e])=>calcular(e).proj.forEach(p=>rows.push([e.nome,e.inep||"",p.etapa,p.turmas,p.cap,p.vindos,p.vagas,p.status==="espera"?"Necessita lista de espera":p.status==="vagas"?"Sem lista de espera (demanda insuficiente)":"Completa"])));
  return "﻿"+rows.map(r=>r.map(x=>{x=String(x);return /[;"\n]/.test(x)?`"${x.replace(/"/g,'""')}"`:x;}).join(";")).join("\r\n");
}

/* ---------- Importar ---------- */
function importar(){
  const linhas=$("#pasteBox").value.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const grupos={}, erros=[];
  linhas.forEach((l,i)=>{
    const p=l.split(/\t|;|\s{2,}/).map(s=>s.trim()).filter(Boolean);
    if(p.length<3){erros.push(i+1);return;}
    const alunos=parseInt(p[p.length-1]); const etapa=normEtapa(p[p.length-2]); const nome=p.slice(0,p.length-2).join(" ").toUpperCase();
    if(!etapa||isNaN(alunos)){erros.push(i+1);return;}
    (grupos[nome]=grupos[nome]||[]).push({etapa,alunos});
  });
  let novas=0, atual=0;
  Object.entries(grupos).forEach(([nome,turmas])=>{
    turmas.sort((a,b)=>NOMES.indexOf(a.etapa)-NOMES.indexOf(b.etapa));
    let id=Object.keys(escolas).find(k=>escolas[k].nome.toUpperCase()===nome);
    if(id){escolas[id].turmas=turmas;atual++;}
    else{id=novoId();escolas[id]={nome,inep:"",salas:null,capacidadeTurmas:null,turmas,turmasPrevistas:{}};novas++;}
    agendarSalvar(id,0); selecionada=id;
  });
  $("#importMsg").textContent=(novas||atual)?`${novas} nova(s), ${atual} atualizada(s)`+(erros.length?` · linhas ignoradas: ${erros.join(", ")}`:""):(erros.length?`Nenhuma linha reconhecida (${erros.join(", ")})`:"");
  if(novas||atual){$("#pasteBox").value="";renderLista();renderEscola();}
}

/* ---------- Persistência ---------- */
function msgSync(t){$("#syncMsg").textContent=t;}
function novoId(){return (crypto.randomUUID?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==="x"?r:(r&3|8)).toString(16);}));}
function paraLinha(id,e){return {id,ano,nome:e.nome,inep:e.inep||null,salas:e.salas??null,capacidade_turmas:e.capacidadeTurmas??null,turmas:e.turmas||[],turmas_previstas:e.turmasPrevistas||{},atualizado_em:new Date().toISOString(),atualizado_por:usuario?.email||null};}
function deLinha(r){return {nome:r.nome,inep:r.inep||"",salas:r.salas,capacidadeTurmas:r.capacidade_turmas,turmas:r.turmas||[],turmasPrevistas:r.turmas_previstas||{}};}
function agendarSalvar(id,delay=500){
  if(!sb||!editor) return;
  clearTimeout(saveTimers[id]);
  msgSync("Salvando…");
  saveTimers[id]=setTimeout(async()=>{
    delete saveTimers[id];
    const e=escolas[id]; if(!e) return;
    const {error}=await sb.from("escolas").upsert(paraLinha(id,e));
    if(error) msgSync(error.code==="23505"?`Já existe uma escola chamada "${e.nome}" em ${ano}.`:"Não foi possível salvar: "+error.message);
    else msgSync("Alterações salvas no banco.");
  },delay);
}
async function assinar(){
  escolas={}; selecionada=null; renderLista(); renderEscola();
  if(!sb){msgSync("Banco de dados não configurado: preencha SUPABASE_URL e SUPABASE_KEY no arquivo app.js.");renderRelatorio();return;}
  msgSync("Carregando escolas…");
  const {data,error}=await sb.from("escolas").select("*").eq("ano",ano).order("nome");
  if(error){msgSync("Não foi possível carregar: "+error.message);return;}
  data.forEach(r=>escolas[r.id]=deLinha(r));
  selecionada=ordenadas()[0]?.[0]||null;
  msgSync(data.length?`Dados atualizados às ${new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}.`:"");
  renderLista(); renderEscola(); renderRelatorio();
}
async function atualizarSessao(session){
  usuario=session?.user||null; editor=false;
  if(usuario){const {data}=await sb.rpc("eh_editor");editor=!!data;}
  document.body.classList.toggle("ro",!editor);
  const box=$("#authBox");
  if(!usuario) box.innerHTML=`<span>Modo consulta</span><button id="btnEntrar">Entrar como editor</button>`;
  else box.innerHTML=`<span>${esc(usuario.email)}${editor?" · editor":" · sem permissão de edição"}</span><button id="btnSair">Sair</button>`;
  const be=$("#btnEntrar"); if(be) be.onclick=()=>{$("#loginForm").hidden=false;$("#lgEmail").focus();};
  const bs=$("#btnSair"); if(bs) bs.onclick=async()=>{await sb.auth.signOut();};
  renderLista(); renderEscola();
}

/* ---------- UI geral ---------- */
function toast(t){const el=$("#toast");el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2400);}
function setTab(rel){$("#tab-escolas").setAttribute("aria-selected",!rel);$("#tab-relatorio").setAttribute("aria-selected",rel);$("#view-escolas").hidden=rel;$("#view-relatorio").hidden=!rel;if(rel)renderRelatorio();}
$("#tab-escolas").onclick=()=>setTab(false);
$("#tab-relatorio").onclick=()=>setTab(true);
$("#btnImport").onclick=importar;
$("#btnNova").onclick=()=>{const id=novoId();escolas[id]={nome:"NOVA ESCOLA",inep:"",salas:null,capacidadeTurmas:null,turmas:[],turmasPrevistas:{}};selecionada=id;agendarSalvar(id,0);renderLista();renderEscola();keepOpen();$("#f-nome").focus();};
$("#btnCopy").onclick=async()=>{
  const html=$("#docView").innerHTML.replace(/<span class="pill[^"]*">/g,"<span>");
  const doc=`<div style="font-family:Arial;font-size:11pt">${html.replace(/<table>/g,'<table border="1" cellpadding="4" style="border-collapse:collapse">')}</div>`;
  try{
    if(window.ClipboardItem&&navigator.clipboard.write){await navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([doc],{type:"text/html"}),"text/plain":new Blob([$("#docView").innerText],{type:"text/plain"})})]);}
    else await navigator.clipboard.writeText($("#docView").innerText);
    $("#copyMsg").textContent="Copiado. Cole no Word com Ctrl+V.";
  }catch{const r=document.createRange();r.selectNodeContents($("#docView"));const s=getSelection();s.removeAllRanges();s.addRange(r);$("#copyMsg").textContent="Texto selecionado: use Ctrl+C para copiar.";}
};
$("#btnCsv").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv()],{type:"text/csv;charset=utf-8"}));a.download=`vagas-${ano+1}.csv`;document.body.appendChild(a);a.click();a.remove();};

const sel=$("#anoBase");
for(let a=2024;a<=2035;a++) sel.insertAdjacentHTML("beforeend",`<option value="${a}" ${a===ano?"selected":""}>${a}</option>`);
try{const s=localStorage.getItem("anoBase");if(s){ano=+s;sel.value=s;}}catch{}
const setAno=()=>{$("#anoProj").textContent=ano+1;};
setAno();
sel.onchange=()=>{ano=+sel.value;try{localStorage.setItem("anoBase",ano);}catch{}setAno();assinar();if(!$("#view-relatorio").hidden)renderRelatorio();};

$("#loginForm").onsubmit=async ev=>{ev.preventDefault();$("#lgMsg").textContent="Entrando…";
  const {error}=await sb.auth.signInWithPassword({email:$("#lgEmail").value.trim(),password:$("#lgSenha").value});
  if(error){$("#lgMsg").textContent="E-mail ou senha incorretos.";return;}
  $("#lgMsg").textContent="";$("#lgSenha").value="";$("#loginForm").hidden=true;};
$("#lgCancel").onclick=()=>{$("#loginForm").hidden=true;};

setTab(true);
if(window.supabase&&SUPABASE_URL.startsWith("https://")){
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  sb.auth.onAuthStateChange((_ev,session)=>{setTimeout(()=>atualizarSessao(session),0);});
  sb.auth.getSession().then(({data})=>atualizarSessao(data.session));
}
assinar();
