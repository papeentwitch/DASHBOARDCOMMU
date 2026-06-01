const SUPABASE_REST = "https://aslnjgujopcdczeulhys.supabase.co/rest/v1";
const SUPABASE_KEY = "sb_publishable_Ul9Xek8TdT6e_2MR8srcTQ_yzn2qhYg";

const $ = id => document.getElementById(id);
let state = { games: [], ownership: [] };

const IS_ADMIN = location.hash === "#admin-papeen";

async function supabase(path, options = {}) {
  const res = await fetch(`${SUPABASE_REST}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("Supabase error:", txt);
    alert("Erreur Supabase : " + txt);
    throw new Error(txt);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function load() {
  const games = await supabase("/games?select=*");
  const possessions = await supabase("/possessions?select=*");

  state.games = games.map(g => ({
    id: g.id,
    name: g.Nom || g.name,
    platforms: g.Plateformes || g.platform || "PC"
  })).filter(g => g.name);

  state.ownership = possessions.map(p => {
    const game = state.games.find(g => g.id === p.game_id);
    return {
      id: p.id,
      game_id: p.game_id,
      name: game ? game.name : "",
      pseudo: p.pseudo
    };
  }).filter(o => o.name);

  render();
}

function clean(s) {
  return (s || "").trim();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[m]));
}

function ownersFor(name) {
  return state.ownership.filter(o => o.name === name);
}

async function addGameToDb(name, platform = "PC") {
  name = clean(name);
  platform = clean(platform) || "PC";
  if (!name) return;

  const existing = state.games.find(g => g.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const inserted = await supabase("/games", {
    method: "POST",
    body: JSON.stringify({
      name,
      platform,
      Nom: name,
      Plateformes: platform
    })
  });

  return inserted[0];
}

async function ownGame(name, pseudo) {
  pseudo = clean(pseudo);

  if (!pseudo) {
    alert("Mets ton pseudo d’abord.");
    return;
  }

  const game = state.games.find(g => g.name === name);
  if (!game) return;

  const already = state.ownership.find(o => o.name === name && o.pseudo === pseudo);
  if (already) return;

  await supabase("/possessions", {
    method: "POST",
    body: JSON.stringify({
      game_id: game.id,
      pseudo
    })
  });

  await load();
}

async function removeOwnGame(name, pseudo) {
  pseudo = clean(pseudo);

  if (!pseudo) {
    alert("Mets ton pseudo d’abord.");
    return;
  }

  const own = state.ownership.find(o => o.name === name && o.pseudo === pseudo);

  if (!own) {
    alert("Ce pseudo n’est pas inscrit sur ce jeu.");
    return;
  }

  await supabase(`/possessions?id=eq.${own.id}`, {
    method: "DELETE"
  });

  await load();
}

function render() {
  const q = $("search") ? $("search").value.toLowerCase() : "";
  const pf = $("platformFilter") ? $("platformFilter").value : "";
  const grid = $("gamesGrid");
  if (!grid) return;

  grid.innerHTML = "";

  const platforms = [...new Set(state.games.map(g => g.platforms || "PC"))].sort();

  if ($("platformFilter")) {
    $("platformFilter").innerHTML =
      '<option value="">Toutes</option>' +
      platforms.map(p => `<option ${p === pf ? "selected" : ""}>${p}</option>`).join("");
  }

  const shown = state.games
    .filter(g =>
      (!q || g.name.toLowerCase().includes(q)) &&
      (!pf || g.platforms === pf)
    )
    .sort((a, b) =>
      ownersFor(b.name).length - ownersFor(a.name).length ||
      a.name.localeCompare(b.name)
    );

  for (const g of shown) {
    const node = $("gameTemplate").content.cloneNode(true);

    node.querySelector("h3").textContent = g.name;
    node.querySelector(".platform").textContent = g.platforms || "PC";

    const owners = ownersFor(g.name);
    const pseudo = clean($("pseudo") ? $("pseudo").value : "");
    const userOwns = pseudo && owners.some(o => o.pseudo === pseudo);

    node.querySelector(".count").textContent = owners.length;

    node.querySelector(".owners").innerHTML = owners.length
      ? owners.map(o => `<span class="chip">${escapeHtml(o.pseudo)}</span>`).join("")
      : '<span class="chip">Personne pour le moment</span>';

    const btn = node.querySelector(".ownBtn");

    if (userOwns) {
      btn.textContent = "Retirer mon pseudo";
      btn.classList.add("owned");
      btn.onclick = async () => {
        await removeOwnGame(g.name, pseudo);
      };
    } else {
      btn.textContent = "J’ai ce jeu";
      btn.onclick = async () => {
        await ownGame(g.name, clean($("pseudo").value));
      };
    }

    grid.appendChild(node);
  }

  const players = [...new Set(state.ownership.map(o => o.pseudo))];

  if ($("gameCount")) $("gameCount").textContent = state.games.length;
  if ($("playerCount")) $("playerCount").textContent = players.length;
  if ($("ownedCount")) $("ownedCount").textContent = state.ownership.length;

  const top = [...state.games]
    .sort((a, b) => ownersFor(b.name).length - ownersFor(a.name).length)
    .slice(0, 8);

  if ($("topGames")) {
    $("topGames").innerHTML = top.map(g =>
      `<div class="top-item"><b>${escapeHtml(g.name)}</b><span>${ownersFor(g.name).length} joueurs</span></div>`
    ).join("");
  }
}

async function importPlayniteCsv(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);

  const separator = lines[0].includes(";") ? ";" : ",";

  const headers = lines[0]
    .split(separator)
    .map(h => h.trim().replace(/^"|"$/g, ""));
  const nomIndex = headers.indexOf("Nom");
  const plateformesIndex = headers.indexOf("Plateformes");

  if (nomIndex === -1) {
    alert("Colonne 'Nom' introuvable dans le CSV Playnite.");
    return;
  }

  let count = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]
      .split(separator)
      .map(c => c.trim().replace(/^"|"$/g, ""));
    const name = cols[nomIndex];
    const platform = plateformesIndex >= 0 ? cols[plateformesIndex] : "PC";

    if (name) {
      await addGameToDb(name, platform || "PC");
      count++;
    }
  }

  alert(count + " jeux importés depuis Playnite.");
  await load();
}

function createAdminPanel() {
  if (!IS_ADMIN) return;

  const panel = document.createElement("section");
  panel.className = "admin-panel";
  panel.innerHTML = `
    <h2>Administration PAPEEN</h2>
    <p>Import CSV Playnite visible uniquement avec le lien admin.</p>
    <input type="file" id="playniteCsvInput" accept=".csv">
    <button id="importPlayniteCsvBtn">Importer le CSV Playnite</button>
  `;

  document.body.prepend(panel);

  $("importPlayniteCsvBtn").onclick = async () => {
    const file = $("playniteCsvInput").files[0];

    if (!file) {
      alert("Choisis d’abord ton fichier CSV Playnite.");
      return;
    }

    await importPlayniteCsv(file);
  };
}

if ($("addGame")) {
  $("addGame").onclick = async () => {
    const name = clean($("newGame").value);
    const platform = clean($("newPlatform").value) || "PC";

    if (!name) return;

    await addGameToDb(name, platform);

    $("newGame").value = "";
    $("newPlatform").value = "";

    await load();
  };
}

if ($("search")) $("search").oninput = render;
if ($("platformFilter")) $("platformFilter").onchange = render;

if ($("pseudo")) {
  $("pseudo").value = localStorage.getItem("papeen_pseudo") || "";
  $("pseudo").oninput = () => {
    localStorage.setItem("papeen_pseudo", $("pseudo").value);
    render();
  };
}

if ($("copyDiscord")) {
  $("copyDiscord").onclick = () => {
    const top = [...state.games]
      .sort((a, b) => ownersFor(b.name).length - ownersFor(a.name).length)
      .slice(0, 10);

    const txt =
      "🎮 Top jeux de la commu PAPEEN\n" +
      top.map((g, i) => `${i + 1}. ${g.name} — ${ownersFor(g.name).length} joueurs`).join("\n");

    navigator.clipboard.writeText(txt);
    alert("Résumé copié pour Discord.");
  };
}

if ($("setupPanel")) {
  $("setupPanel").style.display = "none";
}

createAdminPanel();
load();
