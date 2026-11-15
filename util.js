// === KONFIGURATION ===
const OWNER = "varguello";
const REPO = "adhoc-laden";
const PATH = "saeulen.json";
// =====================

let saeulenData = [];
let editingId = null;

// Magic-Link-Empfänger für ?token=... oder #token=...
(function checkMagicLink() {
  const hash = window.location.hash;
  if (hash.startsWith("#token=")) {
    const token = decodeURIComponent(hash.replace("#token=", "")).trim();
    if (token) {
      localStorage.setItem("gh_lade_token", token);
      history.replaceState(null, "", window.location.pathname);
      alert("Einrichtung abgeschlossen! Token wurde gespeichert.");
    }
  }
})();

function getToken() {
  let token = localStorage.getItem("gh_lade_token");
  if (!token) {
    token = prompt(
      "Bitte GitHub Personal Access Token eingeben (für Schreibrechte):",
    );
    if (token !== null && token.trim() !== "") {
      token = token.trim();
      localStorage.setItem("gh_lade_token", token);
    } else {
      return null; // Benutzer hat abgebrochen
    }
  }
  return token;
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

// 1. NEU: Prüft Token BEVOR das Formular aufgeklappt wird
function toggleForm() {
  const box = document.getElementById("form-box");
  const isVisible = box.style.display === "block";

  if (isVisible) {
    cancelForm();
  } else {
    if (!getToken()) return; // Abbrechen, wenn kein Token eingegeben wurde

    resetForm();
    box.style.display = "block";
  }
}

function cancelForm() {
  resetForm();
  document.getElementById("form-box").style.display = "none";
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

// 2. BEARBEITEN: Prüft Token BEVOR das Formular für den Edit geöffnet wird
function editSaeule(id) {
  if (!getToken()) return; // Abbrechen, wenn kein Token eingegeben wurde

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

// LADEN: Ganz normal statisch per fetch (Ohne Token)
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

// SPEICHERN: Mit robuster Authentifizierungs-Prüfung (401/403)
async function saveToGitHub(commitMsg) {
  const token = localStorage.getItem("gh_lade_token");
  if (!token) return;

  setStatus("Verbinde mit GitHub...");

  try {
    const getRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`,
      {
        headers: { Authorization: `token ${token}` },
      },
    );

    // Nur bei echten Auth-Fehlern (401 oder 403) wird das Token verworfen
    if (getRes.status === 401 || getRes.status === 403) {
      localStorage.removeItem("gh_lade_token");
      alert(
        "Das GitHub Token ist ungültig, abgelaufen oder hat keine Schreibrechte (" +
          getRes.status +
          "). Es wurde aus dem Speicher entfernt.",
      );
      throw new Error("Ungültiges oder abgelaufenes Token");
    }

    if (!getRes.ok)
      throw new Error(
        "GitHub-Fehler (" + getRes.status + "). Bitte später erneut versuchen.",
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

    if (putRes.status === 401 || putRes.status === 403) {
      localStorage.removeItem("gh_lade_token");
      alert(
        "Das GitHub Token ist ungültig oder abgelaufen (" +
          putRes.status +
          "). Es wurde aus dem Speicher entfernt.",
      );
      throw new Error("Ungültiges Token");
    }

    if (!putRes.ok)
      throw new Error("Speichern fehlgeschlagen (" + putRes.status + ")");

    await loadData();
    setStatus("Erfolgreich gespeichert!");
    setTimeout(() => setStatus(""), 2000);
  } catch (err) {
    // Netzwerkfehler oder Server-Glitch -> Token bleibt sicher erhalten!
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

// 3. LÖSCHEN: Prüft Token BEVOR die Sicherheitsabfrage oder Löschung startet
async function deleteSaeule(id) {
  if (!getToken()) return; // Abbrechen, wenn kein Token eingegeben wurde
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
    const badgeText = item.type === "DC" ? "DC (Schnell)" : "AC (Langsam)";
    const badgeClass = item.type === "DC" ? "badge-dc" : "badge-ac";
    const imgHtml = item.img
      ? `<img class="saeule-img" src="${item.img}" alt="${item.name}">`
      : "";
    const descHtml = item.desc ? `<div class="desc">${item.desc}</div>` : "";

    container.innerHTML += `
      <details>
        <summary>
          <span>${item.name}</span>
          <span class="badge ${badgeClass}">${badgeText}</span>
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
