// === KONFIGURATION ===
const OWNER = "varguello";
const REPO = "adhoc-laden";
const PATH = "saeulen.json";
// =====================

let saeulenData = [];
let editingId = null;

function getToken() {
  let token = localStorage.getItem("gh_lade_token");
  if (!token) {
    token = prompt(
      "Bitte GitHub Personal Access Token eingeben (für Schreibrechte):",
    );
    if (token) localStorage.setItem("gh_lade_token", token.trim());
  }
  return token ? token.trim() : null;
}

function resetToken() {
  if (
    !confirm(
      "Möchtest du das gespeicherte GitHub Token wirklich aus dem Browser-Speicher löschen?",
    )
  ) {
    return;
  }
  localStorage.removeItem("gh_lade_token");
  alert("Token aus dem Browser-Speicher gelöscht.");
}

function toggleForm() {
  const box = document.getElementById("form-box");
  const isVisible = box.style.display === "block";
  if (isVisible) {
    resetForm();
    box.style.display = "none";
  } else {
    resetForm();
    box.style.display = "block";
  }
}

function resetForm() {
  editingId = null;
  document.getElementById("form-title").textContent = "Neue Säule / Anschluss";
  document.getElementById("btn-submit").textContent = "Speichern";
  document.getElementById("inp-name").value = "";
  document.getElementById("inp-type").value = "DC";
  document.getElementById("inp-url").value = "";
  document.getElementById("inp-desc").value = "";
  document.getElementById("inp-img").value = "";
}

function editSaeule(id) {
  const item = saeulenData.find((i) => i.id === id);
  if (!item) return;

  editingId = id;
  document.getElementById("form-title").textContent = `Bearbeite: ${item.name}`;
  document.getElementById("btn-submit").textContent = "Änderungen übernehmen";
  document.getElementById("inp-name").value = item.name;
  document.getElementById("inp-type").value = item.type;
  document.getElementById("inp-url").value = item.url;
  document.getElementById("inp-desc").value = item.desc || "";
  document.getElementById("inp-img").value = "";

  const box = document.getElementById("form-box");
  box.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function encodeBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function compressImage(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxW = 800;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function loadData() {
  setStatus("Lade Daten...");
  try {
    const res = await fetch(`${PATH}?t=${Date.now()}`);
    if (!res.ok)
      throw new Error("Datei konnte nicht geladen werden (" + res.status + ")");
    saeulenData = await res.json();
    renderList();
    setStatus("");
  } catch (err) {
    setStatus("Fehler beim Laden: " + err.message);
  }
}

async function saveToGitHub(commitMsg) {
  const token = getToken();
  if (!token) return alert("Ohne Token kann nicht gespeichert werden.");

  setStatus("Verbinde mit GitHub...");

  try {
    const getRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`,
      {
        headers: { Authorization: `token ${token}` },
      },
    );
    if (!getRes.ok)
      throw new Error(
        "Authentifizierung oder Pfad fehlerhaft (" + getRes.status + ")",
      );
    const fileMeta = await getRes.json();
    const currentSha = fileMeta.sha;

    setStatus("Speichere Änderungen...");

    const putRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: commitMsg,
          content: encodeBase64(JSON.stringify(saeulenData, null, 2)),
          sha: currentSha,
        }),
      },
    );

    if (!putRes.ok)
      throw new Error("Speichern fehlgeschlagen (" + putRes.status + ")");

    await loadData();
    setStatus("Erfolgreich gespeichert!");
    setTimeout(() => setStatus(""), 2000);
  } catch (err) {
    setStatus("Fehler: " + err.message);
  }
}

async function handleSave() {
  const name = document.getElementById("inp-name").value.trim();
  const type = document.getElementById("inp-type").value;
  const url = document.getElementById("inp-url").value.trim();
  const desc = document.getElementById("inp-desc").value.trim();
  const file = document.getElementById("inp-img").files[0];

  if (!name || !url) return alert("Bitte mindestens Name und URL angeben.");

  setStatus("Verarbeite Bild...");
  const newImgBase64 = await compressImage(file);

  if (editingId !== null) {
    const item = saeulenData.find((i) => i.id === editingId);
    if (item) {
      item.name = name;
      item.type = type;
      item.url = url;
      item.desc = desc;
      if (newImgBase64) {
        item.img = newImgBase64;
      }
    }
    await saveToGitHub(`Säule bearbeitet: ${name}`);
  } else {
    saeulenData.push({
      id: Date.now(),
      name,
      type,
      url,
      desc,
      img: newImgBase64,
    });
    await saveToGitHub(`Säule hinzugefügt: ${name}`);
  }

  toggleForm();
}

async function deleteSaeule(id) {
  if (!confirm("Diesen Eintrag wirklich löschen?")) return;
  saeulenData = saeulenData.filter((item) => item.id !== id);
  await saveToGitHub("Säule gelöscht");
}

function renderList() {
  const container = document.getElementById("list");
  container.innerHTML = "";
  if (saeulenData.length === 0) {
    container.innerHTML =
      "<p style='text-align:center;color:#777;'>Noch keine Ladesäulen gespeichert.</p>";
    return;
  }

  saeulenData.forEach((item) => {
    const badgeClass = item.type === "DC" ? "badge-dc" : "badge-ac";
    const imgHtml = item.img
      ? `<img class="saeule-img" src="${item.img}" alt="${item.name}">`
      : "";
    const descHtml = item.desc ? `<div class="desc">${item.desc}</div>` : "";

    container.innerHTML += `
     <details>
       <summary>
         <span>${item.name}</span>
         <span class="badge ${badgeClass}">${item.type}</span>
       </summary>
       ${imgHtml}
       ${descHtml}
       <a class="start-link" href="${item.url}" target="_blank">⚡ Ladevorgang starten</a>
       <div class="btn-actions">
         <button class="btn-edit" onclick="editSaeule(${item.id})">✏️ Bearbeiten</button>
         <button class="btn-del" onclick="deleteSaeule(${item.id})">🗑️ Löschen</button>
       </div>
     </details>
   `;
  });
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

// Initial beim Seitenaufruf laden
loadData();
