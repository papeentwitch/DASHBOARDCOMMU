const SUPABASE_REST = "https://aslnjgujopcdczeulhys.supabase.co/rest/v1";
const SUPABASE_KEY = "sb_publishable_Ul9Xek8TdT6e_2MR8srcTQ_yzn2qhYg";

const $ = id => document.getElementById(id);
let state = { games: [], ownership: [] };

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
    name: g.name,
    platforms: g.platform || "PC"
  }));

  state.ownership = possessions.map(p => {
    const game = state.games.find(g => g.id === p.game_id);
    return {
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
  return state.ownership
    .filter(o => o.name === name)
    .map(o => o.pseudo);
}

async function addGameToDb(name, platform = "PC") {
  name = clean(name);
  if (!name) return;

  const existing = state.games.find(g => g.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const inserted = await supabase("/games", {
    method: "POST",
    body: JSON.stringify({ name, platform })
  });

  return inserted[0];
}

async function ownGame(name, pseudo) {
  pseudo = clean(pseudo);
  if (!pseudo) {
    alert("Mets ton pseudo d’abord.");
    return;
  }

  let game = state.games.find(g => g.name === name);
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
    node.querySelector(".count").textContent = owners.length;

    node.querySelector(".owners").innerHTML = owners.length
      ? owners.map(o => `<span class="chip">${escapeHtml(o)}</span>`).join("")
      : '<span class="chip">Personne pour le moment</span>';

    const btn = node.querySelector(".ownBtn");
    const pseudo = clean($("pseudo") ? $("pseudo").value : "");

    if (pseudo && owners.includes(pseudo)) {
      btn.textContent = "Déjà ajouté";
      btn.classList.add("owned");
    }

    btn.onclick = async () => {
      const pseudoNow = clean($("pseudo").value);
      await ownGame(g.name, pseudoNow);
    };

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

if ($("seedGames")) {
  $("seedGames").onclick = async () => {
    const games = window.INITIAL_GAMES || [];

    for (const g of games) {
      await addGameToDb(g.name, g.platforms || g.platform || "PC");
    }

    alert("Jeux importés.");
    await load();
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

load();
