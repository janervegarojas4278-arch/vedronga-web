const seedPosts = [
  { id: "seed-1", author: "Janer Vega", initials: "JV", category: "foto", created: "Trabajo de VEDRONGA", title: "Una mirada a nuestro territorio", body: "Cada vuelo nos enseña una nueva forma de apreciar los lugares que conocemos. ¿Qué paisaje de Colombia te gustaría ver desde el aire?", image: "img/img1.JPG", likes: 8, liked: false, comments: [] },
  { id: "seed-2", author: "Comunidad VEDRONGA", initials: "CV", category: "historia", created: "Para quienes están comenzando", title: "Volar también es aprender", body: "La preparación, el cuidado y el respeto por el entorno hacen parte de cada vuelo. Comparte aquí tus experiencias y consejos para que sigamos aprendiendo en comunidad.", image: "", likes: 5, liked: false, comments: [] },
  { id: "seed-3", author: "Janer Vega", initials: "JV", category: "foto", created: "Portafolio VEDRONGA", title: "Rutas que cuentan historias", body: "Desde arriba aparecen caminos, formas y paisajes que a veces pasan desapercibidos. Esta es una de nuestras perspectivas favoritas.", image: "img/img2.JPG", likes: 3, liked: false, comments: [] }
];
const STORAGE_KEY = "vedrongaCommunityV1";
const MEDIA_DB_NAME = "vedrongaCommunityMedia";
let activeFilter = "all";
let posts = loadPosts();
function loadPosts() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return (saved ? JSON.parse(saved) : seedPosts).map(post => ({ ...post, comments: post.comments || [], photoUrls: [], videoUrl: "" }));
  } catch { return seedPosts.map(post => ({ ...post, photoUrls: [], videoUrl: "" })); }
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts.map(({ photoUrls, videoUrl, ...post }) => post)));
    return true;
  } catch { return false; }
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function initials(name) { return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase(); }
function mediaFor(post) {
  const photos = post.photoUrls?.length ? post.photoUrls : (post.image ? [post.image.replace(/img(\d+)\.jpg$/i, "img$1.JPG")] : []);
  const video = post.videoUrl || "";
  const count = photos.length + (video ? 1 : 0);
  if (!count) return "";
  return `<div class="post-attachments ${count === 1 ? "single" : ""}">${photos.map((src, index) => `<img src="${escapeHTML(src)}" alt="Foto ${index + 1} de ${escapeHTML(post.author)}" loading="lazy">`).join("")}${video ? `<video src="${escapeHTML(video)}" controls preload="metadata" aria-label="Video de ${escapeHTML(post.author)}"></video>` : ""}</div>`;
}
function renderFeed() {
  const shown = posts.filter(post => activeFilter === "all" || post.category === activeFilter);
  document.getElementById("emptyState").hidden = shown.length > 0;
  document.getElementById("feed").innerHTML = shown.map(post => `<article class="post-card" id="post-${escapeHTML(post.id)}"><div class="post-content"><div class="post-meta"><span class="post-avatar">${escapeHTML(post.initials || initials(post.author))}</span><span>${escapeHTML(post.author)}<br>${escapeHTML(post.created)}</span><span class="post-tag">${post.category === "foto" ? "Fotografía" : "Historia"}</span></div><h4>${escapeHTML(post.title)}</h4><p>${escapeHTML(post.body)}</p>${mediaFor(post)}<div class="post-actions"><button type="button" data-like="${escapeHTML(post.id)}" class="${post.liked ? "liked" : ""}" aria-label="Me gusta">${post.liked ? "♥" : "♡"} Me gusta · ${post.likes}</button><button type="button" data-comments="${escapeHTML(post.id)}">Comentar · ${post.comments.length}</button></div><div class="comments" id="comments-${escapeHTML(post.id)}" hidden>${post.comments.map(comment => `<p class="comment"><b>${escapeHTML(comment.author)}</b> ${escapeHTML(comment.body)}</p>`).join("")}<form class="comment-form" data-comment-form="${escapeHTML(post.id)}"><input name="comment" maxlength="240" placeholder="Escribe un comentario…" aria-label="Escribe un comentario" required><button type="submit">Enviar</button></form></div></div></article>`).join("");
}
function openMediaDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("Este navegador no permite guardar archivos localmente.")); return; }
    const request = indexedDB.open(MEDIA_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento local."));
  });
}
function saveMedia(key, blob) {
  return openMediaDatabase().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite"); transaction.objectStore("files").put(blob, key);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { const error = transaction.error; db.close(); reject(error); };
    transaction.onabort = () => { const error = transaction.error; db.close(); reject(error); };
  }));
}
function readMedia(key) {
  return openMediaDatabase().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readonly"); const request = transaction.objectStore("files").get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  }));
}
function deleteMedia(key) {
  return openMediaDatabase().then(db => new Promise(resolve => {
    const transaction = db.transaction("files", "readwrite"); transaction.objectStore("files").delete(key);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); resolve(); };
  }));
}
async function restorePostMedia() {
  let changed = false;
  for (const post of posts) {
    for (const key of post.photoKeys || []) {
      try { const blob = await readMedia(key); if (blob) { post.photoUrls.push(URL.createObjectURL(blob)); changed = true; } } catch { /* Mantiene visible el resto de la publicación. */ }
    }
    if (post.videoKey) {
      try { const blob = await readMedia(post.videoKey); if (blob) { post.videoUrl = URL.createObjectURL(blob); changed = true; } } catch { /* Mantiene visible el resto de la publicación. */ }
    }
  }
  if (changed) renderFeed();
}

const feed = document.getElementById("feed");
feed.addEventListener("click", event => {
  const likeButton = event.target.closest("[data-like]");
  if (likeButton) { const post = posts.find(item => item.id === likeButton.dataset.like); if (post) { post.liked = !post.liked; post.likes += post.liked ? 1 : -1; persist(); renderFeed(); } return; }
  const commentButton = event.target.closest("[data-comments]");
  if (commentButton) { const area = document.getElementById(`comments-${commentButton.dataset.comments}`); area.hidden = !area.hidden; if (!area.hidden) area.querySelector("input").focus(); }
});
feed.addEventListener("submit", event => {
  const form = event.target.closest("[data-comment-form]"); if (!form) return; event.preventDefault();
  const body = form.elements.comment.value.trim(); if (!body) return;
  const post = posts.find(item => item.id === form.dataset.commentForm); if (!post) return;
  post.comments.push({ author: localStorage.getItem("vedrongaAuthor") || "Visitante", body }); persist(); renderFeed();
  const area = document.getElementById(`comments-${post.id}`); area.hidden = false; area.querySelector("input").focus();
});
document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter; document.querySelectorAll("[data-filter]").forEach(item => item.classList.toggle("active", item === button)); renderFeed();
}));

const postDialog = document.getElementById("postDialog");
const postForm = document.getElementById("postForm");
const photoInput = document.getElementById("photoFiles");
const videoInput = document.getElementById("videoFile");
const formError = document.getElementById("formError");
const mediaPreview = document.getElementById("mediaPreview");
let previewUrls = [];
document.getElementById("openPost").addEventListener("click", () => postDialog.showModal());
document.getElementById("closeDialog").addEventListener("click", () => postDialog.close());
postDialog.addEventListener("click", event => { if (event.target === postDialog) postDialog.close(); });
function refreshMediaPreview() {
  previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = [];
  const photos = Array.from(photoInput.files || []); const video = videoInput.files?.[0];
  formError.textContent = photos.length > 5 ? "Puedes seleccionar hasta cinco fotos. Vuelve a elegir un máximo de cinco." : "";
  mediaPreview.innerHTML = photos.slice(0, 5).map((file, index) => { const url = URL.createObjectURL(file); previewUrls.push(url); return `<img src="${url}" alt="Vista previa de la foto ${index + 1}">`; }).join("") + (video ? `<div class="video-preview-name">▷ Video seleccionado: ${escapeHTML(video.name)} · verificaremos que dure máximo 2 minutos</div>` : "");
}
photoInput.addEventListener("change", refreshMediaPreview);
videoInput.addEventListener("change", refreshMediaPreview);
function videoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const player = document.createElement("video"); player.preload = "metadata";
    player.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(player.duration); };
    player.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No pudimos leer la duración del video. Prueba con otro archivo MP4 o MOV.")); };
    player.src = url;
  });
}
async function compressPhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("Todos los archivos seleccionados como fotos deben ser imágenes.");
  const source = await createImageBitmap(file); const scale = Math.min(1, 1400 / source.width, 1200 / source.height);
  const canvas = document.createElement("canvas"); canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .78));
  if (!blob) throw new Error("No pudimos preparar una de las fotos. Intenta con otro archivo.");
  return blob;
}
postForm.addEventListener("submit", async event => {
  event.preventDefault(); formError.textContent = "";
  const author = postForm.elements.author.value.trim(); const title = postForm.elements.title.value.trim(); const body = postForm.elements.body.value.trim();
  const photos = Array.from(photoInput.files || []); const video = videoInput.files?.[0] || null;
  if (photos.length > 5) { formError.textContent = "Puedes adjuntar hasta cinco fotos."; return; }
  if (photos.some(file => !file.type.startsWith("image/"))) { formError.textContent = "Revisa que todos los archivos seleccionados sean fotos."; return; }
  if (video && !video.type.startsWith("video/")) { formError.textContent = "El archivo adjunto debe ser un video."; return; }
  if (video) { try { if (await videoDuration(video) > 120) { formError.textContent = "El video supera los dos minutos. Selecciona uno más corto."; return; } } catch (problem) { formError.textContent = problem.message; return; } }
  const id = `post-${Date.now()}`; const photoKeys = []; const photoUrls = []; const savedKeys = []; let videoKey = ""; let videoUrl = "";
  try {
    for (let index = 0; index < photos.length; index++) {
      const blob = await compressPhoto(photos[index]); const key = `${id}-foto-${index + 1}`;
      await saveMedia(key, blob); savedKeys.push(key); photoKeys.push(key); photoUrls.push(URL.createObjectURL(blob));
    }
    if (video) { videoKey = `${id}-video`; await saveMedia(videoKey, video); savedKeys.push(videoKey); videoUrl = URL.createObjectURL(video); }
    posts.unshift({ id, author, initials: initials(author), category: postForm.elements.category.value, created: "Ahora", title, body, image: "", photoKeys, photoUrls, videoKey, videoUrl, likes: 0, liked: false, comments: [] });
    try { localStorage.setItem("vedrongaAuthor", author); } catch { /* El nombre puede no guardarse en modo privado. */ }
    if (!persist()) { posts.shift(); throw new Error("No pudimos guardar la publicación en este navegador. Puede faltar espacio disponible."); }
    postForm.reset(); refreshMediaPreview(); postDialog.close(); activeFilter = "all";
    document.querySelectorAll("[data-filter]").forEach(button => button.classList.toggle("active", button.dataset.filter === "all"));
    renderFeed(); document.getElementById("comunidad").scrollIntoView({ behavior: "smooth" });
  } catch (problem) {
    for (const key of savedKeys) await deleteMedia(key);
    formError.textContent = problem.message || "No pudimos guardar los archivos. Prueba con menos fotos o un video más pequeño.";
  }
});

const menuToggle = document.getElementById("menuToggle"); const mainNav = document.getElementById("mainNav");
menuToggle.addEventListener("click", () => { const open = mainNav.classList.toggle("open"); menuToggle.setAttribute("aria-expanded", String(open)); menuToggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú"); });
mainNav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => { mainNav.classList.remove("open"); menuToggle.setAttribute("aria-expanded", "false"); }));

/* Visor del portafolio: zoom con botones, rueda del ratón y arrastre. */
const gallery = document.querySelector(".gallery"); const lightbox = document.getElementById("imageLightbox");
const lightboxImage = document.getElementById("lightboxImage"); const lightboxVideo = document.getElementById("lightboxVideo"); const lightboxCaption = document.getElementById("lightboxCaption");
const zoomLevel = document.getElementById("zoomLevel"); const zoomOut = document.getElementById("zoomOut"); const zoomIn = document.getElementById("zoomIn");
let zoom = 1, panX = 0, panY = 0, dragStart = null;
function updateZoom() { lightboxImage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`; lightboxImage.classList.toggle("zoomed", zoom > 1); zoomLevel.textContent = `${Math.round(zoom * 100)}%`; zoomOut.disabled = zoom <= 1; zoomIn.disabled = zoom >= 4; }
function resetZoom() { zoom = 1; panX = 0; panY = 0; updateZoom(); }
function setZoom(value) { zoom = Math.max(1, Math.min(4, value)); if (zoom === 1) { panX = 0; panY = 0; } updateZoom(); }
function openLightbox(media) {
  const isVideo = media.tagName === "VIDEO";
  resetZoom();
  lightbox.classList.toggle("showing-video", isVideo);
  lightboxImage.hidden = isVideo;
  lightboxVideo.hidden = !isVideo;
  if (isVideo) {
    lightboxVideo.src = media.dataset.fullSrc || media.currentSrc || media.src;
  } else {
    lightboxVideo.pause();
    lightboxVideo.removeAttribute("src");
    lightboxVideo.load();
    lightboxImage.src = media.currentSrc || media.src;
    lightboxImage.alt = media.alt;
  }
  const figure = media.closest(".gallery-item");
  lightboxCaption.textContent = figure.querySelector("figcaption")?.innerText || media.alt || "Video";
  lightbox.showModal();
  if (isVideo) lightboxVideo.play().catch(() => {});
}
gallery.addEventListener("click", event => {
  const figure = event.target.closest(".gallery-item");
  if (!figure) return;
  const media = figure.querySelector("video, img");
  if (media) openLightbox(media);
});
gallery.addEventListener("keydown", event => {
  const figure = event.target.closest(".gallery-item");
  if (figure && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    const media = figure.querySelector("video, img");
    if (media) openLightbox(media);
  }
});
zoomIn.addEventListener("click", () => setZoom(zoom + .25)); zoomOut.addEventListener("click", () => setZoom(zoom - .25));
document.getElementById("zoomReset").addEventListener("click", resetZoom);
lightboxImage.addEventListener("wheel", event => { event.preventDefault(); setZoom(zoom + (event.deltaY < 0 ? .2 : -.2)); }, { passive: false });
lightboxImage.addEventListener("pointerdown", event => { if (zoom <= 1 || (event.pointerType === "mouse" && event.button !== 0)) return; event.preventDefault(); dragStart = { x: event.clientX, y: event.clientY, panX, panY, pointerId: event.pointerId }; lightboxImage.setPointerCapture(event.pointerId); });
lightboxImage.addEventListener("pointermove", event => { if (!dragStart || event.pointerId !== dragStart.pointerId) return; panX = dragStart.panX + event.clientX - dragStart.x; panY = dragStart.panY + event.clientY - dragStart.y; updateZoom(); });
lightboxImage.addEventListener("pointerup", () => { dragStart = null; }); lightboxImage.addEventListener("pointercancel", () => { dragStart = null; });
document.getElementById("closeLightbox").addEventListener("click", () => lightbox.close());
lightbox.addEventListener("click", event => { if (event.target === lightbox) lightbox.close(); });
lightbox.addEventListener("close", () => { lightboxVideo.pause(); lightboxVideo.removeAttribute("src"); lightboxVideo.load(); lightbox.classList.remove("showing-video"); resetZoom(); });

renderFeed();
restorePostMedia();
/* Interacción visual de los formularios de acceso (sin autenticación real todavía). */
const accountDialog = document.getElementById("accountDialog");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const accountMessage = document.getElementById("accountMessage");
const loginTab = document.getElementById("tabLogin");
const registerTab = document.getElementById("tabRegister");
function setAccountMode(mode) {
  const isLogin = mode === "login";
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  loginTab.classList.toggle("active", isLogin);
  registerTab.classList.toggle("active", !isLogin);
  loginTab.setAttribute("aria-selected", String(isLogin));
  registerTab.setAttribute("aria-selected", String(!isLogin));
  accountMessage.textContent = "Vista de diseño: las cuentas se activarán al conectar el sistema de acceso.";
}
document.getElementById("openLogin").addEventListener("click", () => { setAccountMode("login"); accountDialog.showModal(); });
document.getElementById("openRegister").addEventListener("click", () => { setAccountMode("register"); accountDialog.showModal(); });
loginTab.addEventListener("click", () => setAccountMode("login"));
registerTab.addEventListener("click", () => setAccountMode("register"));
document.getElementById("closeAccount").addEventListener("click", () => accountDialog.close());
accountDialog.addEventListener("click", event => { if (event.target === accountDialog) accountDialog.close(); });
loginForm.addEventListener("submit", event => { event.preventDefault(); accountMessage.textContent = "El diseño del acceso está listo. La contraseña no se envió ni se guardó; falta conectar la autenticación."; });
registerForm.addEventListener("submit", event => { event.preventDefault(); accountMessage.textContent = "El formulario está listo. La cuenta aún no se creó porque falta conectar el registro seguro."; });