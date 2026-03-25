import { useState, useEffect, useCallback, useRef } from "react";

// ─── Firebase REST helpers ────────────────────────────────────────────────────
const DB = "https://tournament-app-95290-default-rtdb.asia-southeast1.firebasedatabase.app";
const API_KEY = "AIzaSyBgHDpf9EJsthclTQsSvHIkpTCmYaCi8jI";

async function fbGet(path) {
  try {
    const r = await fetch(`${DB}/${path}.json`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fbSet(path, value) {
  try {
    await fetch(`${DB}/${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
  } catch {}
}

async function fbPatch(path, value) {
  try {
    await fetch(`${DB}/${path}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
  } catch {}
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ADMIN_PIN = "1234";
const POLL_MS   = 1000;

const CARD_W  = 180;
const CARD_H  = 60;
const ROW_H   = 30;
const COL_GAP = 48;
const LABEL_H = 28;
const RED  = "#e8393a";
const GREY = "rgba(0,0,0,0.10)";

// ─── Utilities ────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

function bracketSize(n) {
  if (n <= 4)  return 4;
  if (n <= 8)  return 8;
  if (n <= 16) return 16;
  return 32;
}

function buildBracket(participants) {
  const size     = bracketSize(participants.length);
  const numByes  = size - participants.length;
  const shuffled = [...participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const numMatches     = size / 2;
  const byeMatchIdx    = new Set();
  for (let k = 0; k < numByes; k++)
    byeMatchIdx.add(Math.round(k * numMatches / numByes));

  let pi = 0;
  const firstRound = Array.from({ length: numMatches }, (_, i) => {
    const isBye = byeMatchIdx.has(i);
    const p1 = shuffled[pi++] || null;
    const p2 = isBye ? null : (shuffled[pi++] || null);
    return {
      id: uid(),
      team1: p1?.name || null, flag1: p1?.flag || "",
      team2: isBye ? null : (p2?.name || null),
      flag2: isBye ? "" : (p2?.flag || ""),
      winner: isBye ? 1 : null, bye: isBye,
    };
  });

  const rounds = [firstRound];
  let sz = numMatches;
  while (sz > 1) {
    sz = sz / 2;
    rounds.push(Array.from({ length: sz }, () => ({
      id: uid(), team1: null, flag1: "", team2: null, flag2: "", winner: null, bye: false,
    })));
  }
  return propagate({ rounds, champion: null, championFlag: "" });
}

function propagate(bracket) {
  const b = JSON.parse(JSON.stringify(bracket));

  const resolve = (m) => {
    if (m.winner === 1 && m.team1) return { t: m.team1, f: m.flag1 };
    if (m.winner === 2 && m.team2) return { t: m.team2, f: m.flag2 };
    return null;
  };

  const syncWinner = (m, autoBye) => {
    if (autoBye && m.team1 && !m.team2) { m.winner = 1; m.bye = true; return; }
    if (autoBye && m.team2 && !m.team1) { m.winner = 2; m.bye = true; return; }
    if (!m.team1 && !m.team2) { m.winner = null; return; }
    if (m.winner === 1 && !m.team1) m.winner = null;
    if (m.winner === 2 && !m.team2) m.winner = null;
  };

  for (const m of b.rounds[0]) syncWinner(m, true);
  for (let r = 0; r < b.rounds.length - 1; r++) {
    const cur = b.rounds[r], next = b.rounds[r + 1];
    for (let i = 0; i < next.length; i++) {
      const a1 = resolve(cur[i * 2]), a2 = resolve(cur[i * 2 + 1]);
      next[i].team1 = a1?.t || null; next[i].flag1 = a1?.f || "";
      next[i].team2 = a2?.t || null; next[i].flag2 = a2?.f || "";
      syncWinner(next[i], false);
    }
  }
  const final = b.rounds[b.rounds.length - 1]?.[0];
  if (final) {
    const wf = resolve(final);
    b.champion = wf?.t || null;
    b.championFlag = wf?.f || "";
  }
  return b;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#f5f6fa", surface: "#ffffff",
  border: "#e2e6ef", text: "#1a202c", sub: "#64748b", muted: "#94a3b8",
};
const baseInput = {
  background: "#f8f9fc", border: `1.5px solid ${C.border}`,
  borderRadius: 8, color: C.text, padding: "10px 13px",
  fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, outline: "none", width: "100%",
};
const baseBtn = (accent=false, danger=false) => ({
  background: accent ? RED : danger ? "#fff1f1" : "#f1f4f9",
  border: `1.5px solid ${accent ? RED : danger ? "#fca5a5" : C.border}`,
  borderRadius: 8, color: accent ? "#fff" : danger ? "#dc2626" : C.text,
  padding: "8px 16px", fontFamily: "'Noto Sans JP', sans-serif",
  fontSize: 12, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
  fontWeight: accent ? 600 : 400,
});

// ─── Flag Picker ──────────────────────────────────────────────────────────────
const FLAGS = ["👤","⚽","🏀","🎾","🏓","🏸","🎯","🔥","⭐","👑","🦁","🐯","🦅","🐺","🦊","🐉","🌟","💎","🗡️","🛡️"];
function FlagPicker({ value, onChange }) {
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:6 }}>
      {FLAGS.map(f => (
        <button key={f} onClick={() => onChange(f)} style={{
          background: value===f ? "#fef2f2" : "#f8f9fc",
          border: `1.5px solid ${value===f ? RED : C.border}`,
          borderRadius: 6, padding: "4px 7px", fontSize: 18, cursor:"pointer",
        }}>{f}</button>
      ))}
    </div>
  );
}

// ─── Pin Modal ────────────────────────────────────────────────────────────────
function PinModal({ onSuccess, onCancel }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const submit = () => {
    if (pin === ADMIN_PIN) onSuccess();
    else { setErr(true); setPin(""); setTimeout(() => setErr(false), 1200); }
  };
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999 }}>
      <div style={{ background:"#fff",borderRadius:16,padding:"32px 36px",minWidth:280,textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,0.15)" }}>
        <div style={{fontSize:28,marginBottom:8}}>🔐</div>
        <div style={{fontSize:17,fontWeight:700,color:C.text,marginBottom:4}}>管理者ログイン</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:20}}>PINコードを入力してください</div>
        <input type="password" maxLength={4} value={pin}
          onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
          placeholder="••••"
          style={{ ...baseInput, textAlign:"center", fontSize:22, letterSpacing:8,
            border:`1.5px solid ${err?RED:C.border}`, animation:err?"shake 0.3s ease":"none" }}/>
        <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
        {err && <div style={{color:RED,fontSize:11,marginTop:6}}>PINが違います</div>}
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button onClick={onCancel} style={{...baseBtn(),flex:1}}>キャンセル</button>
          <button onClick={submit}   style={{...baseBtn(true),flex:1}}>ログイン</button>
        </div>
        <div style={{fontSize:10,color:C.muted,marginTop:12}}>デフォルトPIN: 1234</div>
      </div>
    </div>
  );
}

// ─── Match Card ───────────────────────────────────────────────────────────────
function MatchCard({ match, onSetWinner, isAdmin }) {
  const isByeAuto = match.bye && match.team1 && !match.team2;
  const canClick  = isAdmin && match.team1 && !isByeAuto;
  return (
    <div style={{
      width:CARD_W, height:CARD_H, borderRadius:10, overflow:"hidden",
      border:`1.5px solid ${C.border}`, background:"#ffffff",
      boxShadow:"0 2px 8px rgba(0,0,0,0.08)",
    }}>
      {[1,2].map(n => {
        const team  = n===1 ? match.team1 : match.team2;
        const flag  = n===1 ? match.flag1 : match.flag2;
        const isW   = match.winner === n;
        const isL   = match.winner && !isW;
        const isBye = match.bye && n===2 && !match.team2;
        return (
          <div key={n} onClick={() => canClick && !isBye && onSetWinner(match.id, isW ? null : n)}
            style={{
              height:ROW_H, display:"flex", alignItems:"center", gap:6, padding:"0 10px",
              cursor: (canClick && !isBye) ? "pointer" : "default",
              background: isW ? "#fef2f2" : "transparent",
              borderBottom: n===1 ? `1px solid ${C.border}` : "none",
              opacity: isL ? 0.35 : isBye ? 0.3 : 1,
              transition:"background 0.15s,opacity 0.15s", userSelect:"none",
            }}>
            <span style={{fontSize:15,lineHeight:1,minWidth:20}}>{flag||""}</span>
            <span style={{
              fontSize:13, fontFamily:"'Noto Sans JP',sans-serif",
              fontWeight:isW?700:400,
              color: isBye?"#cbd5e1" : isW?RED : team?C.text:"#cbd5e1",
              flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
              fontStyle: isBye ? "italic" : "normal",
            }}>{isBye ? "BYE" : team||"—"}</span>
            {isW && !isBye && <span style={{color:RED,fontSize:10,fontWeight:700}}>▶</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Bracket View ─────────────────────────────────────────────────────────────
function BracketView({ bracket, onSetWinner, isAdmin }) {
  if (!bracket?.rounds?.length) return null;
  const rounds = bracket.rounds, numRounds = rounds.length;
  const VGAP0 = 14, TOP = LABEL_H + 4;
  const r0Count = rounds[0].length;
  const r0Ys = Array.from({length: r0Count}, (_,i) => TOP + i*(CARD_H+VGAP0) + CARD_H/2);
  const roundYs = [r0Ys];
  for (let r = 1; r < numRounds; r++) {
    const prev = roundYs[r-1];
    roundYs.push(rounds[r].map((_,i) => (prev[i*2] + prev[i*2+1]) / 2));
  }
  const xs = Array.from({length: numRounds}, (_,i) => i*(CARD_W+COL_GAP));
  const totalW = xs[numRounds-1] + CARD_W + 150;
  const totalH = r0Ys[r0Count-1] + CARD_H/2 + 24;
  const MID = COL_GAP / 2;

  const lines = [];
  for (let r = 0; r < numRounds-1; r++) {
    const srcX = xs[r]+CARD_W, midX = srcX+MID, dstX = xs[r+1];
    for (let i = 0; i < rounds[r+1].length; i++) {
      const m1 = rounds[r][i*2], m2 = rounds[r][i*2+1];
      const cy1 = roundYs[r][i*2], cy2 = roundYs[r][i*2+1], dstY = roundYs[r+1][i];
      const h1 = !!m1.winner, h2 = !!m2.winner, both = h1&&h2;
      lines.push(
        <line key={`h1-${r}-${i}`} x1={srcX} y1={cy1} x2={midX} y2={cy1} stroke={h1?RED:GREY} strokeWidth={h1?3:1.5} strokeLinecap="round"/>,
        <line key={`h2-${r}-${i}`} x1={srcX} y1={cy2} x2={midX} y2={cy2} stroke={h2?RED:GREY} strokeWidth={h2?3:1.5} strokeLinecap="round"/>,
        <line key={`v-${r}-${i}`}  x1={midX} y1={cy1} x2={midX} y2={cy2} stroke={both?RED:GREY} strokeWidth={both?3:1.5}/>,
        <line key={`hd-${r}-${i}`} x1={midX} y1={dstY} x2={dstX} y2={dstY} stroke={both?RED:GREY} strokeWidth={both?3:1.5} strokeLinecap="round"/>,
      );
    }
  }
  const getLbl = (r) => {
    const fe = numRounds-1-r;
    return fe===0?"決勝":fe===1?"準決勝":fe===2?"準々決勝":`第${r+1}回戦`;
  };
  const finalY = roundYs[numRounds-1][0];
  return (
    <div style={{ overflowX:"auto", overflowY:"visible", paddingBottom:20, WebkitOverflowScrolling:"touch" }}>
      <div style={{ position:"relative", width:totalW, height:totalH, minWidth:totalW }}>
        <svg style={{position:"absolute",top:0,left:0,pointerEvents:"none",overflow:"visible"}} width={totalW} height={totalH}>
          {lines}
        </svg>
        {rounds.map((_,r) => (
          <div key={r} style={{
            position:"absolute", top:0, left:xs[r], width:CARD_W,
            textAlign:"center", fontSize:11, fontFamily:"'Noto Sans JP',sans-serif",
            color:C.sub, letterSpacing:1, height:LABEL_H,
            display:"flex", alignItems:"center", justifyContent:"center", fontWeight:600,
          }}>{getLbl(r)}</div>
        ))}
        {rounds.map((ms,r) => ms.map((m,i) => (
          <div key={m.id} style={{position:"absolute", top:roundYs[r][i]-CARD_H/2, left:xs[r]}}>
            <MatchCard match={m} onSetWinner={(id,n)=>onSetWinner(id,n,r)} isAdmin={isAdmin}/>
          </div>
        )))}
        {bracket.champion && (
          <div style={{
            position:"absolute", top:finalY-52, left:xs[numRounds-1]+CARD_W+14,
            background:"linear-gradient(135deg,#fff1f1,#fff8f8)",
            border:"2px solid #fca5a5", borderRadius:14,
            padding:"14px 18px", textAlign:"center",
            animation:"glow 2s ease-in-out infinite alternate",
          }}>
            <style>{`@keyframes glow{from{box-shadow:0 4px 16px rgba(232,57,58,0.15)}to{box-shadow:0 8px 32px rgba(232,57,58,0.35)}}`}</style>
            <div style={{fontSize:26}}>🏆</div>
            <div style={{fontSize:10,color:RED,letterSpacing:3,fontFamily:"'Noto Sans JP',sans-serif",fontWeight:700,marginTop:2}}>優　勝</div>
            <div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:"'Noto Sans JP',sans-serif",marginTop:4,whiteSpace:"nowrap"}}>
              {bracket.championFlag} {bracket.champion}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Member Screen ────────────────────────────────────────────────────────────
function MemberScreen({ members, setMembers, roomId, isAdmin, onGenerate }) {
  const [name, setName]     = useState("");
  const [flag, setFlag]     = useState("👤");
  const [showPick, setShowPick] = useState(false);
  const size = bracketSize(members.length);

  const add = async () => {
    const n = name.trim(); if (!n) return;
    const updated = [...members, { id:uid(), name:n, flag }];
    setMembers(updated);
    await fbSet(`rooms/${roomId}/members`, updated);
    setName(""); setFlag("👤");
  };
  const remove = async (id) => {
    const updated = members.filter(m=>m.id!==id);
    setMembers(updated);
    await fbSet(`rooms/${roomId}/members`, updated);
  };

  return (
    <div style={{maxWidth:520,margin:"0 auto"}}>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:24,marginBottom:20,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:16}}>＋ メンバーを追加</div>
        {isAdmin ? (
          <>
            <div style={{display:"flex",gap:10,marginBottom:8}}>
              <input value={name} onChange={e=>setName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&add()} placeholder="名前を入力..."
                style={{...baseInput,flex:1}}/>
              <button onClick={()=>setShowPick(v=>!v)} style={{...baseBtn(),fontSize:20,padding:"6px 12px"}}>{flag}</button>
            </div>
            {showPick && <FlagPicker value={flag} onChange={f=>{setFlag(f);setShowPick(false);}}/>}
            <button onClick={add} style={{...baseBtn(true),width:"100%",marginTop:10,padding:"10px"}}>追加する</button>
          </>
        ) : (
          <div style={{fontSize:12,color:C.muted,textAlign:"center",padding:"8px 0"}}>👁 閲覧モード — 管理者のみ編集可能</div>
        )}
      </div>

      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:24,marginBottom:20,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontSize:13,fontWeight:700,color:C.text}}>参加メンバー</span>
          <span style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:20,padding:"2px 10px",fontSize:11,color:RED,fontWeight:600}}>{members.length}人</span>
        </div>
        {members.length===0 ? (
          <div style={{textAlign:"center",color:C.muted,fontSize:12,padding:"20px 0"}}>まだメンバーがいません</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {members.map((m,i)=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#f8fafc",border:`1px solid ${C.border}`,borderRadius:8}}>
                <span style={{fontSize:10,color:C.muted,minWidth:20}}>{i+1}</span>
                <span style={{fontSize:18}}>{m.flag}</span>
                <span style={{flex:1,fontSize:13,fontFamily:"'Noto Sans JP',sans-serif",color:C.text,fontWeight:500}}>{m.name}</span>
                {isAdmin && <button onClick={()=>remove(m.id)} style={{...baseBtn(false,true),padding:"3px 10px",fontSize:11}}>削除</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdmin && members.length>=2 && (
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:20,textAlign:"center",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:12,color:C.muted,marginBottom:4}}>
            {members.length}人 → {size}人用ブラケット{members.length<size?`（${size-members.length}人BYE）`:""}
          </div>
          <button onClick={onGenerate} style={{...baseBtn(true),padding:"12px 32px",fontSize:14,letterSpacing:1}}>
            トーナメント生成 →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ members, onStart, onBack }) {
  const [participants, setParticipants] = useState([...members]);
  const [dragIdx, setDragIdx] = useState(null);
  const size = bracketSize(participants.length);

  const shuffle = () => {
    const arr=[...participants];
    for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
    setParticipants(arr);
  };

  return (
    <div style={{maxWidth:520,margin:"0 auto"}}>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:24,marginBottom:20,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:C.text}}>出場順序を確認</div>
          <button onClick={shuffle} style={{...baseBtn(),fontSize:11}}>🔀 シャッフル</button>
        </div>
        <div style={{fontSize:11,color:C.muted,marginBottom:14}}>ドラッグで順番変更できます</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {participants.map((m,i)=>(
            <div key={m.id} draggable
              onDragStart={()=>setDragIdx(i)} onDragOver={e=>e.preventDefault()}
              onDrop={()=>{
                if(dragIdx===null||dragIdx===i)return;
                const arr=[...participants];const[item]=arr.splice(dragIdx,1);arr.splice(i,0,item);
                setParticipants(arr);setDragIdx(null);
              }}
              onDragEnd={()=>setDragIdx(null)}
              style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
                background:"#f8fafc",border:`1.5px solid ${dragIdx===i?RED:C.border}`,borderRadius:8,cursor:"grab"}}>
              <span style={{fontSize:10,color:C.muted,minWidth:20}}>{i+1}</span>
              <span style={{fontSize:16}}>{m.flag}</span>
              <span style={{flex:1,fontSize:13,fontFamily:"'Noto Sans JP',sans-serif",color:C.text,fontWeight:500}}>{m.name}</span>
              <span style={{fontSize:12,color:C.muted}}>⠿</span>
            </div>
          ))}
          {Array.from({length:size-participants.length}).map((_,i)=>(
            <div key={`bye${i}`} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
              background:"#fafafa",border:"1.5px dashed #e2e8f0",borderRadius:8,opacity:0.5}}>
              <span style={{fontSize:10,color:C.muted,minWidth:20}}>{participants.length+i+1}</span>
              <span style={{fontSize:13,color:C.muted,fontStyle:"italic"}}>BYE（不戦勝）</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:12}}>
        <button onClick={onBack} style={{...baseBtn(),flex:1,padding:"11px"}}>← 戻る</button>
        <button onClick={()=>onStart(participants)} style={{...baseBtn(true),flex:2,padding:"11px",fontSize:13}}>トーナメント開始 →</button>
      </div>
    </div>
  );
}

// ─── Room Screen ─────────────────────────────────────────────────────────────
function CreateSection({ onEnter }) {
  const [created, setCreated] = useState(null);
  const [copied,  setCopied]  = useState(false);
  const create = () => setCreated(Math.random().toString(36).slice(2,8).toUpperCase());
  const copy   = () => {
    try { navigator.clipboard.writeText(created); setCopied(true); setTimeout(()=>setCopied(false),2000); } catch {}
  };
  if (created) return (
    <div>
      <div style={{textAlign:"center",marginBottom:16}}>
        <div style={{fontSize:12,color:C.sub,marginBottom:8}}>ルームIDが発行されました</div>
        <div style={{fontSize:28,fontWeight:900,letterSpacing:6,color:C.text,background:"#f8f9fc",border:"2px solid #e2e6ef",borderRadius:12,padding:"14px 20px",marginBottom:8}}>{created}</div>
        <button onClick={copy} style={{padding:"6px 16px",background:copied?"#16a34a":"#f1f4f9",border:`1.5px solid ${copied?"#86efac":"#e2e6ef"}`,borderRadius:8,fontSize:12,cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif",color:copied?"#fff":"#64748b",transition:"all 0.2s"}}>
          {copied ? "✓ コピーしました" : "IDをコピー"}
        </button>
      </div>
      <div style={{fontSize:12,color:C.muted,textAlign:"center",marginBottom:14}}>このIDを参加者に共有してください</div>
      <button onClick={()=>onEnter(created)} style={{width:"100%",padding:"13px",background:RED,border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:700,fontFamily:"'Noto Sans JP',sans-serif",cursor:"pointer"}}>
        このルームに入る →
      </button>
    </div>
  );
  return (
    <div>
      <div style={{fontSize:13,color:C.sub,marginBottom:16}}>
        新しいトーナメントを作成します。<br/>ルームIDが発行されるので参加者に共有してください。
      </div>
      <button onClick={create} style={{width:"100%",padding:"13px",background:RED,border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:700,fontFamily:"'Noto Sans JP',sans-serif",cursor:"pointer"}}>
        新規ルームを作成 →
      </button>
    </div>
  );
}

function RoomScreen({ onEnter }) {
  const [input, setInput] = useState("");
  const [mode,  setMode]  = useState("join");
  const [err,   setErr]   = useState("");
  const join = () => {
    const id = input.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
    if (id.length < 3) { setErr("3文字以上入力してください"); return; }
    onEnter(id);
  };
  return (
    <div style={{minHeight:"100vh",background:"#f5f6fa",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Noto Sans JP',sans-serif"}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontSize:44,marginBottom:8}}>🏆</div>
          <div style={{fontSize:26,fontWeight:900,color:"#1a202c",letterSpacing:"-0.5px"}}>ブラケット</div>
          <div style={{fontSize:12,color:"#94a3b8",marginTop:4,letterSpacing:2}}>TOURNAMENT MANAGER</div>
        </div>
        <div style={{background:"#fff",borderRadius:18,padding:28,boxShadow:"0 4px 24px rgba(0,0,0,0.10)",border:"1px solid #e2e6ef"}}>
          <div style={{display:"flex",gap:6,marginBottom:24,background:"#f1f4f9",borderRadius:10,padding:4}}>
            {[["join","参加する"],["create","新規作成"]].map(([m,label])=>(
              <button key={m} onClick={()=>{setMode(m);setErr("");setInput("");}}
                style={{flex:1,padding:"9px 0",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif",fontSize:13,fontWeight:600,background:mode===m?"#fff":"transparent",color:mode===m?"#1a202c":"#94a3b8",boxShadow:mode===m?"0 1px 4px rgba(0,0,0,0.1)":"none",transition:"all 0.15s"}}>
                {label}
              </button>
            ))}
          </div>
          {mode==="join" ? (
            <>
              <div style={{fontSize:13,color:C.sub,marginBottom:12}}>ルームIDを入力して参加</div>
              <input value={input} onChange={e=>{setInput(e.target.value.toUpperCase());setErr("");}}
                onKeyDown={e=>e.key==="Enter"&&join()} placeholder="例: AB12CD" maxLength={10}
                style={{width:"100%",padding:"12px 14px",fontSize:18,fontFamily:"'Noto Sans JP',sans-serif",letterSpacing:4,textAlign:"center",textTransform:"uppercase",border:"1.5px solid #e2e6ef",borderRadius:10,outline:"none",background:"#f8f9fc",color:"#1a202c",boxSizing:"border-box"}}/>
              {err && <div style={{color:RED,fontSize:12,marginTop:6,textAlign:"center"}}>{err}</div>}
              <button onClick={join} style={{width:"100%",marginTop:14,padding:"13px",background:RED,border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:700,fontFamily:"'Noto Sans JP',sans-serif",cursor:"pointer"}}>
                参加する →
              </button>
            </>
          ) : <CreateSection onEnter={onEnter}/>}
        </div>
        <div style={{textAlign:"center",marginTop:16,fontSize:11,color:"#94a3b8"}}>
          ルームIDが同じ人はリアルタイムで同じトーナメントを共有できます
        </div>
      </div>
    </div>
  );
}

// ─── Room Badge ───────────────────────────────────────────────────────────────
function RoomBadge({ roomId, onLeave }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try { navigator.clipboard.writeText(roomId); setCopied(true); setTimeout(()=>setCopied(false),2000); } catch {}
  };
  return (
    <div style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:10,background:"#fff",border:"1.5px solid #e2e6ef",borderRadius:20,padding:"5px 6px 5px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",flexWrap:"wrap",justifyContent:"center"}}>
      <span style={{fontSize:10,color:C.muted,letterSpacing:1}}>ROOM</span>
      <span style={{fontSize:14,fontWeight:700,color:C.text,letterSpacing:3}}>{roomId}</span>
      <button onClick={copy} style={{background:copied?"#f0fdf4":"#f1f4f9",border:`1px solid ${copied?"#86efac":"#e2e6ef"}`,borderRadius:14,padding:"3px 10px",fontSize:11,color:copied?"#16a34a":"#64748b",cursor:"pointer",fontFamily:"'Noto Sans JP',sans-serif",transition:"all 0.2s",whiteSpace:"nowrap"}}>
        {copied ? "✓ コピー済み" : "IDをコピー"}
      </button>
      <button onClick={onLeave} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,padding:"0 6px"}}>退出</button>
    </div>
  );
}

// ─── Tournament App ───────────────────────────────────────────────────────────
function TournamentApp({ roomId, onLeave }) {
  const [screen,  setScreen]  = useState("members");
  const [members, setMembers] = useState([]);
  const [bracket, setBracket] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [status,  setStatus]  = useState("loading"); // loading | ok | error
  const myWriteRef = useRef(false);
  const lastDataRef = useRef(null);

  // ── ポーリングでFirebaseからリアルタイム同期 ─────────────────────────────
  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const data = await fbGet(`rooms/${roomId}`);
        if (!alive) return;
        const str = JSON.stringify(data);
        // 自分の書き込み直後 or データ変化なし はスキップ
        if (myWriteRef.current || str === lastDataRef.current) {
          setStatus("ok");
          return;
        }
        lastDataRef.current = str;
        if (data?.members !== undefined) setMembers(data.members || []);
        if (data?.bracket !== undefined) setBracket(data.bracket || null);
        if (data?.screen  !== undefined) setScreen(data.screen   || "members");
        setStatus("ok");
      } catch {
        if (alive) setStatus("error");
      }
    };

    load();
    const iv = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [roomId]);

  // ── Firebase書き込み（書き込み中フラグを立てて自己ループ防止） ────────────
  const write = useCallback(async (subPath, value) => {
    myWriteRef.current = true;
    await fbSet(`rooms/${roomId}/${subPath}`, value);
    setTimeout(() => { myWriteRef.current = false; }, 800);
  }, [roomId]);

  const writeRoom = useCallback(async (patch) => {
    myWriteRef.current = true;
    await fbPatch(`rooms/${roomId}`, patch);
    setTimeout(() => { myWriteRef.current = false; }, 800);
  }, [roomId]);

  // ── 勝者設定 ─────────────────────────────────────────────────────────────
  const handleSetWinner = useCallback((matchId, team, roundIdx) => {
    setBracket(prev => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const match = next.rounds[roundIdx].find(m => m.id === matchId);
      if (match) match.winner = team;
      const p = propagate(next);
      write("bracket", p);
      return p;
    });
  }, [write]);

  const goToSetup = () => {
    setScreen("setup");
    write("screen", "setup");
  };

  const startTournament = (participants) => {
    const b = buildBracket(participants);
    setBracket(b);
    writeRoom({ bracket: b, screen: "bracket" });
    setScreen("bracket");
  };

  const resetAll = async () => {
    if (!window.confirm("全データをリセットしますか？")) return;
    const fresh = { members: [], bracket: null, screen: "members" };
    myWriteRef.current = true;
    await fbSet(`rooms/${roomId}`, fresh);
    setTimeout(() => { myWriteRef.current = false; }, 800);
    setMembers([]); setBracket(null); setScreen("members");
  };

  const tabStyle = (active) => ({
    padding:"8px 18px", borderRadius:7, fontSize:12,
    fontFamily:"'Noto Sans JP',sans-serif", cursor:"pointer",
    background: active ? RED : "#f1f4f9",
    border: `1.5px solid ${active ? RED : C.border}`,
    color: active ? "#fff" : C.sub,
    transition:"all 0.15s", fontWeight: active ? 600 : 400,
  });

  const statusDot = status==="ok" ? "#22c55e" : status==="error" ? RED : "#f59e0b";
  const statusTxt = status==="ok" ? "接続中" : status==="error" ? "エラー" : "読み込み中...";

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Noto Sans JP',sans-serif",padding:"20px 16px 48px"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap');
        *{box-sizing:border-box}
        input:focus{border-color:#fca5a5!important;box-shadow:0 0 0 3px rgba(232,57,58,0.1)}
        ::-webkit-scrollbar{height:4px;width:4px;background:#e2e6ef}
        ::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:3px}
        @media(max-width:480px){.tab-nav{flex-wrap:wrap;gap:6px!important;}.tab-nav button{font-size:11px!important;padding:6px 10px!important;}}
      `}</style>

      {showPin && <PinModal onSuccess={()=>{setIsAdmin(true);setShowPin(false);}} onCancel={()=>setShowPin(false)}/>}

      {/* Header */}
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:11,color:C.muted,letterSpacing:4,marginBottom:6,fontWeight:500}}>TOURNAMENT MANAGER</div>
        <div style={{fontSize:32,fontWeight:900,color:C.text,lineHeight:1,letterSpacing:"-0.5px"}}>
          🏆 <span style={{color:RED}}>ブラケット</span>
        </div>
        <RoomBadge roomId={roomId} onLeave={()=>{ if(window.confirm("ルームを退出しますか？\nルームIDで再入室できます。")) onLeave(); }}/>
        <div style={{marginTop:8}}>
          {isAdmin ? (
            <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:20,padding:"4px 14px"}}>
              <span style={{fontSize:11,color:RED}}>🔓 管理者モード</span>
              <button onClick={()=>setIsAdmin(false)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,padding:0}}>ログアウト</button>
            </div>
          ) : (
            <button onClick={()=>setShowPin(true)} style={{...baseBtn(),fontSize:11,padding:"6px 16px",borderRadius:20}}>🔐 管理者ログイン</button>
          )}
        </div>
        <div style={{marginTop:6,fontSize:10,color:statusDot,fontWeight:600}}>
          ● {statusTxt}
        </div>
      </div>

      {/* Tab Nav */}
      <div className="tab-nav" style={{display:"flex",gap:8,justifyContent:"center",marginBottom:24}}>
        <button style={tabStyle(screen==="members")} onClick={()=>{setScreen("members");write("screen","members");}}>
          👥 メンバー{members.length>0?` (${members.length})`:""}
        </button>
        {isAdmin && members.length>=2 && (
          <button style={tabStyle(screen==="setup")} onClick={()=>setScreen("setup")}>⚙️ 組み合わせ</button>
        )}
        {bracket && (
          <button style={tabStyle(screen==="bracket")} onClick={()=>{setScreen("bracket");write("screen","bracket");}}>
            🏆 トーナメント
          </button>
        )}
      </div>

      {/* Screens */}
      {screen==="members" && (
        <MemberScreen members={members} setMembers={setMembers} roomId={roomId} isAdmin={isAdmin} onGenerate={goToSetup}/>
      )}
      {screen==="setup" && isAdmin && (
        <SetupScreen members={members} onStart={startTournament} onBack={()=>setScreen("members")}/>
      )}
      {screen==="bracket" && bracket && (
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,maxWidth:900,margin:"0 auto 16px",padding:"10px 16px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:12,color:C.sub,fontWeight:500}}>
              {members.length}人参加 • {bracket.rounds.length}ラウンド
              {isAdmin?" • ✏️ 編集可能":" • 👁 閲覧モード"}
            </div>
            {isAdmin && (
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setScreen("setup")} style={{...baseBtn(),fontSize:11,padding:"4px 12px"}}>再生成</button>
                <button onClick={resetAll} style={{...baseBtn(false,true),fontSize:11,padding:"4px 12px"}}>リセット</button>
              </div>
            )}
          </div>
          <BracketView bracket={bracket} onSetWinner={handleSetWinner} isAdmin={isAdmin}/>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // セッション中はメモリに保持、リロード時はlocalStorageから復元
  const [roomId, setRoomId] = useState(() => {
    try { return sessionStorage.getItem("trn-room") || null; } catch { return null; }
  });

  const enterRoom = (id) => {
    try { sessionStorage.setItem("trn-room", id); } catch {}
    setRoomId(id);
  };
  const leaveRoom = () => {
    try { sessionStorage.removeItem("trn-room"); } catch {}
    setRoomId(null);
  };

  if (!roomId) return <RoomScreen onEnter={enterRoom}/>;
  return <TournamentApp roomId={roomId} onLeave={leaveRoom}/>;
}
