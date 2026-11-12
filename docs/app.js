const SUPABASE_CONFIG = window.VEDRONGA_SUPABASE_CONFIG;
const db = window.supabase?.createClient(SUPABASE_CONFIG?.url || "", SUPABASE_CONFIG?.publishableKey || "");

const seedPosts = [
  { id: "seed-1", remote: false, author: "Janer Vega", initials: "JV", category: "foto", created: "Trabajo de VEDRONGA", title: "Una mirada a nuestro territorio", body: "Cada vuelo nos enseña una nueva forma de apreciar los lugares que conocemos. ¿Qué paisaje de Colombia te gustaría ver desde el aire?", image: "img/img1.JPG", likes: 8, comments: [] },
  { id: "seed-2", remote: false, author: "Comunidad VEDRONGA", initials: "CV", category: "historia", created: "Para quienes están comenzando", title: "Volar también es aprender", body: "La preparación, el cuidado y el respeto por el entorno hacen parte de cada vuelo. Comparte aquí tus experiencias y consejos para que sigamos aprendiendo en comunidad.", image: "", likes: 5, comments: [] },
  { id: "seed-3", remote: false, author: "Janer Vega", initials: "JV", category: "foto", created: "Portafolio VEDRONGA", title: "Rutas que cuentan historias", body: "Desde arriba aparecen caminos, formas y paisajes que a veces pasan desapercibidos. Esta es una de nuestras perspectivas favoritas.", image: "img/img2.JPG", likes: 3, comments: [] }
];

let activeFilter = "all";
let approvedPosts = [];
let posts = [...seedPosts];
let currentUser = null;
let isAdmin = false;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MEDIA_BUCKET = "community-media";

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function initials(name) { return String(name || "V").trim().split(/\s+/).slice(0, 2).map(word => word[0] || "").join("").toUpperCase(); }
function friendlyError(error) { return error?.message || "Ocurrió un problema. Intenta de nuevo."; }
function setCommunityStatus(message) { document.getElementById("communityStatus").textContent = message; }

function mediaFor(post) {
  const photos = post.photoUrls?.length ? post.photoUrls : (post.image ? [post.image] : []);
  const video = post.videoUrl || "";
  const count = photos.length + (video ? 1 : 0);
  if (!count) return "";
  return `<div class="post-attachments ${count === 1 ? "single" : ""}">${photos.map((src, index) => `<img src="${escapeHTML(src)}" alt="Foto ${index + 1} de ${escapeHTML(post.author)}" loading="lazy">`).join("")}${video ? `<video src="${escapeHTML(video)}" controls preload="metadata" aria-label="Video de ${escapeHTML(post.author)}"></video>` : ""}</div>`;
}

function renderFeed() {
  posts = [...approvedPosts, ...seedPosts];
  const shown = posts.filter(post => activeFilter === "all" || post.category === activeFilter);
  const feed = document.getElementById("feed");
  document.getElementById("emptyState").hidden = shown.length > 0;
  feed.innerHTML = shown.map(post => {
    const actions = post.remote
      ? `<button type="button" data-comments="${escapeHTML(post.id)}">Comentar · ${post.comments.length}</button><button type="button" data-report-post="${escapeHTML(post.id)}">Reportar</button>`
      : `<span class="sample-post-note">Contenido de muestra</span>`;
    const comments = post.remote
      ? `<div class="comments" id="comments-${escapeHTML(post.id)}" hidden>${post.comments.map(comment => `<p class="comment"><b>${escapeHTML(comment.author)}</b> ${escapeHTML(comment.body)} <button type="button" class="inline-report" data-report-comment="${escapeHTML(comment.id)}">Reportar</button></p>`).join("")}${currentUser ? `<form class="comment-form" data-comment-form="${escapeHTML(post.id)}"><input name="comment" maxlength="700" placeholder="Escribe un comentario…" aria-label="Escribe un comentario" required><button type="submit">Enviar</button></form><small class="review-hint">Tu comentario aparecerá después de la revisión.</small>` : `<button type="button" class="comment-login" data-login-comment>Ingresa para comentar</button>`}</div>`
      : "";
    return `<article class="post-card" id="post-${escapeHTML(post.id)}"><div class="post-content"><div class="post-meta"><span class="post-avatar">${escapeHTML(post.initials || initials(post.author))}</span><span>${escapeHTML(post.author)}<br>${escapeHTML(post.created)}</span><span class="post-tag">${post.category === "foto" ? "Fotografía" : "Historia"}</span></div><h4>${escapeHTML(post.title)}</h4><p>${escapeHTML(post.body)}</p>${mediaFor(post)}<div class="post-actions">${actions}</div>${comments}</div></article>`;
  }).join("");
}

async function signedMediaUrl(path) {
  const { data, error } = await db.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

async function loadApprovedPosts() {
  if (!db) {
    setCommunityStatus("No se pudo iniciar la conexión segura con la comunidad.");
    renderFeed();
    return;
  }
  const { data: rows, error } = await db.from("community_posts").select("id, user_id, author_name, title, body, category, created_at").eq("status", "approved").order("created_at", { ascending: false });
  if (error) {
    setCommunityStatus("La comunidad no pudo conectarse. Revisa la configuración de Supabase y vuelve a cargar la página.");
    renderFeed();
    return;
  }
  if (!rows?.length) {
    approvedPosts = [];
    setCommunityStatus("Las nuevas publicaciones y comentarios se muestran únicamente después de que VEDRONGA los apruebe.");
    renderFeed();
    return;
  }
  const ids = rows.map(row => row.id);
  const [{ data: commentRows, error: commentError }, { data: mediaRows, error: mediaError }] = await Promise.all([
    db.from("community_comments").select("id, post_id, author_name, body, created_at").in("post_id", ids).eq("status", "approved").order("created_at"),
    db.from("community_media").select("id, post_id, storage_path, media_type").in("post_id", ids)
  ]);
  if (commentError || mediaError) {
    setCommunityStatus("No se pudieron cargar todos los elementos aprobados. Actualiza la página para volver a intentarlo.");
    approvedPosts = [];
    renderFeed();
    return;
  }
  const commentsByPost = new Map();
  (commentRows || []).forEach(row => {
    if (!commentsByPost.has(row.post_id)) commentsByPost.set(row.post_id, []);
    commentsByPost.get(row.post_id).push({ id: row.id, author: row.author_name, body: row.body });
  });
  const mediaByPost = new Map();
  for (const media of mediaRows || []) {
    try {
      const url = await signedMediaUrl(media.storage_path);
      if (!mediaByPost.has(media.post_id)) mediaByPost.set(media.post_id, []);
      mediaByPost.get(media.post_id).push({ url, type: media.media_type });
    } catch { /* Un archivo que no pueda abrirse no impide mostrar las otras publicaciones. */ }
  }
  approvedPosts = rows.map(row => {
    const attachments = mediaByPost.get(row.id) || [];
    return {
      id: row.id, remote: true, author: row.author_name, initials: initials(row.author_name), category: row.category,
      created: new Date(row.created_at).toLocaleDateString("es-CO"), title: row.title, body: row.body,
      photoUrls: attachments.filter(item => item.type === "photo").map(item => item.url),
      videoUrl: attachments.find(item => item.type === "video")?.url || "",
      comments: commentsByPost.get(row.id) || []
    };
  });
  setCommunityStatus("Las nuevas publicaciones y comentarios se muestran únicamente después de que VEDRONGA los apruebe.");
  renderFeed();
}

const feed = document.getElementById("feed");
const accountDialog = document.getElementById("accountDialog");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const accountMessage = document.getElementById("accountMessage");
const loginTab = document.getElementById("tabLogin");
const registerTab = document.getElementById("tabRegister");
const openLoginButton = document.getElementById("openLogin");
const openRegisterButton = document.getElementById("openRegister");
const logoutButton = document.getElementById("logoutButton");
const moderationPanel = document.getElementById("moderationPanel");
const moderationQueue = document.getElementById("moderationQueue");
const moderationMessage = document.getElementById("moderationMessage");

function setAccountMode(mode) {
  const isLogin = mode === "login";
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  loginTab.classList.toggle("active", isLogin);
  registerTab.classList.toggle("active", !isLogin);
  loginTab.setAttribute("aria-selected", String(isLogin));
  registerTab.setAttribute("aria-selected", String(!isLogin));
  accountMessage.textContent = isLogin ? "Ingresa para comentar y enviar contenido a revisión." : "Tu cuenta te permitirá participar en la comunidad. Las publicaciones se revisan antes de mostrarse.";
}

async function updateSignedInState(user) {
  currentUser = user || null;
  isAdmin = false;
  if (currentUser && db) {
    const { data, error } = await db.rpc("is_community_admin");
    isAdmin = !error && data === true;
  }
  openLoginButton.hidden = !!currentUser;
  openRegisterButton.hidden = !!currentUser;
  logoutButton.hidden = !currentUser;
  moderationPanel.hidden = !isAdmin;
  if (currentUser) {
    const name = currentUser.user_metadata?.display_name || currentUser.email || "Cuenta";
    openLoginButton.textContent = name;
    document.getElementById("postForm").elements.author.value = currentUser.user_metadata?.display_name || "";
    accountMessage.textContent = isAdmin ? "Sesión de administrador activa. Puedes revisar la cola de moderación." : "Sesión iniciada. Tus publicaciones y comentarios esperan aprobación.";
  } else {
    openLoginButton.textContent = "Ingresar";
  }
  renderFeed();
  if (isAdmin) await refreshModerationQueue();
}

if (db) {
  db.auth.getSession().then(({ data }) => updateSignedInState(data.session?.user || null));
  db.auth.onAuthStateChange((_event, session) => setTimeout(() => updateSignedInState(session?.user || null), 0));
} else {
  setCommunityStatus("No se pudo iniciar Supabase. Revisa el archivo de configuración de la página.");
}

document.getElementById("openLogin").addEventListener("click", () => {
  if (currentUser) return;
  setAccountMode("login"); accountDialog.showModal();
});
document.getElementById("openRegister").addEventListener("click", () => { setAccountMode("register"); accountDialog.showModal(); });
loginTab.addEventListener("click", () => setAccountMode("login"));
registerTab.addEventListener("click", () => setAccountMode("register"));
document.getElementById("closeAccount").addEventListener("click", () => accountDialog.close());
accountDialog.addEventListener("click", event => { if (event.target === accountDialog) accountDialog.close(); });

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!db) { accountMessage.textContent = "La conexión con el servidor no está configurada."; return; }
  const email = loginForm.elements.email.value.trim();
  const password = loginForm.elements.password.value;
  const { error } = await db.auth.signInWithPassword({ email, password });
  accountMessage.textContent = error ? friendlyError(error) : "Ingresaste correctamente.";
  if (!error) setTimeout(() => accountDialog.close(), 600);
});

registerForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!db) { accountMessage.textContent = "La conexión con el servidor no está configurada."; return; }
  const name = registerForm.elements.name.value.trim();
  const email = registerForm.elements.email.value.trim();
  const password = registerForm.elements.password.value;
  const accountType = registerForm.elements.accountType.value;
  const { data, error } = await db.auth.signUp({
    email, password,
    options: { data: { display_name: name, account_type: accountType }, emailRedirectTo: window.location.href.split("#")[0] }
  });
  accountMessage.textContent = error ? friendlyError(error) : (data.session ? "Cuenta creada. Ya puedes participar; tu contenido pasará por revisión." : "Revisa tu correo y confirma la cuenta para poder participar.");
});

logoutButton.addEventListener("click", async () => {
  if (!db) return;
  const { error } = await db.auth.signOut();
  accountMessage.textContent = error ? friendlyError(error) : "Cerraste sesión.";
});

feed.addEventListener("click", async event => {
  const commentButton = event.target.closest("[data-comments]");
  if (commentButton) {
    const area = document.getElementById(`comments-${commentButton.dataset.comments}`);
    area.hidden = !area.hidden;
    if (!area.hidden) area.querySelector("input,button")?.focus();
    return;
  }
  if (event.target.closest("[data-login-comment]")) {
    setAccountMode("login"); accountMessage.textContent = "Ingresa para escribir un comentario."; accountDialog.showModal(); return;
  }
  const reportButton = event.target.closest("[data-report-post], [data-report-comment]");
  if (reportButton) {
    if (!currentUser) { setAccountMode("login"); accountMessage.textContent = "Ingresa para reportar contenido."; accountDialog.showModal(); return; }
    const isComment = reportButton.hasAttribute("data-report-comment");
    const details = window.prompt(isComment ? "Cuéntanos brevemente por qué reportas este comentario:" : "Cuéntanos brevemente por qué reportas esta publicación:");
    if (!details?.trim()) return;
    const targetId = isComment ? reportButton.dataset.reportComment : reportButton.dataset.reportPost;
    const { error } = await db.from("community_reports").insert({ reporter_id: currentUser.id, target_type: isComment ? "comment" : "post", target_id: targetId, reason: "other", details: details.trim().slice(0, 500) });
    window.alert(error ? friendlyError(error) : "Gracias. Tu reporte quedó registrado para revisión.");
  }
});

feed.addEventListener("submit", async event => {
  const form = event.target.closest("[data-comment-form]");
  if (!form) return;
  event.preventDefault();
  if (!currentUser) { setAccountMode("login"); accountDialog.showModal(); return; }
  const body = form.elements.comment.value.trim();
  if (!body) return;
  const displayName = currentUser.user_metadata?.display_name || currentUser.email?.split("@")[0] || "Usuario";
  const { error } = await db.from("community_comments").insert({ post_id: form.dataset.commentForm, user_id: currentUser.id, author_name: displayName, body });
  if (error) { moderationMessage.textContent = friendlyError(error); return; }
  form.reset();
  window.alert("Tu comentario quedó pendiente de revisión. Se mostrará cuando sea aprobado.");
});

document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach(item => item.classList.toggle("active", item === button));
  renderFeed();
}));

const postDialog = document.getElementById("postDialog");
const postForm = document.getElementById("postForm");
const photoInput = document.getElementById("photoFiles");
const videoInput = document.getElementById("videoFile");
const formError = document.getElementById("formError");
const mediaPreview = document.getElementById("mediaPreview");
let previewUrls = [];

document.getElementById("openPost").addEventListener("click", () => {
  if (!currentUser) { setAccountMode("login"); accountMessage.textContent = "Ingresa o crea una cuenta para enviar contenido a revisión."; accountDialog.showModal(); return; }
  postDialog.showModal();
});
document.getElementById("closeDialog").addEventListener("click", () => postDialog.close());
postDialog.addEventListener("click", event => { if (event.target === postDialog) postDialog.close(); });

function refreshMediaPreview() {
  previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = [];
  const photos = Array.from(photoInput.files || []); const video = videoInput.files?.[0];
  formError.textContent = photos.length > 5 ? "Puedes seleccionar hasta cinco fotos." : "";
  mediaPreview.innerHTML = photos.slice(0, 5).map((file, index) => { const url = URL.createObjectURL(file); previewUrls.push(url); return `<img src="${url}" alt="Vista previa de la foto ${index + 1}">`; }).join("") + (video ? `<div class="video-preview-name">▷ Video: ${escapeHTML(video.name)} · máximo 2 minutos y 50 MB</div>` : "");
}
photoInput.addEventListener("change", refreshMediaPreview);
videoInput.addEventListener("change", refreshMediaPreview);

function videoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const player = document.createElement("video"); player.preload = "metadata";
    player.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(player.duration); };
    player.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No pudimos leer la duración del video. Prueba con un archivo MP4 o WebM.")); };
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

async function uploadPendingPost({ author, title, body, category, photos, video }) {
  const { data: post, error: postError } = await db.from("community_posts").insert({ user_id: currentUser.id, author_name: author, title, body, category }).select("id").single();
  if (postError) throw postError;
  const postId = post.id;
  const uploadedPaths = [];
  try {
    const media = [];
    for (let index = 0; index < photos.length; index++) {
      const blob = await compressPhoto(photos[index]);
      if (blob.size > MAX_FILE_BYTES) throw new Error("Una foto supera el límite de 50 MB incluso después de comprimirla.");
      media.push({ blob, media_type: "photo", mime_type: "image/jpeg", extension: "jpg" });
    }
    if (video) {
      const videoExtensions = { "video/mp4": "mp4", "video/webm": "webm" };
      if (!videoExtensions[video.type]) throw new Error("Por ahora el video debe estar en formato MP4 o WebM.");
      media.push({ blob: video, media_type: "video", mime_type: video.type, extension: videoExtensions[video.type] });
    }
    for (let index = 0; index < media.length; index++) {
      const item = media[index];
      if (item.blob.size > MAX_FILE_BYTES) throw new Error("Cada archivo debe pesar máximo 50 MB en el plan gratuito.");
      const path = `${currentUser.id}/${postId}/${crypto.randomUUID()}-${index + 1}.${item.extension}`;
      const { error: rowError } = await db.from("community_media").insert({ post_id: postId, user_id: currentUser.id, storage_path: path, media_type: item.media_type, mime_type: item.mime_type });
      if (rowError) throw rowError;
      const { error: uploadError } = await db.storage.from(MEDIA_BUCKET).upload(path, item.blob, { contentType: item.mime_type, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
    }
    return postId;
  } catch (error) {
    if (uploadedPaths.length) await db.storage.from(MEDIA_BUCKET).remove(uploadedPaths);
    await db.from("community_posts").delete().eq("id", postId);
    throw error;
  }
}

postForm.addEventListener("submit", async event => {
  event.preventDefault(); formError.textContent = "";
  if (!currentUser) { formError.textContent = "Inicia sesión antes de enviar contenido."; return; }
  const author = postForm.elements.author.value.trim();
  const title = postForm.elements.title.value.trim();
  const body = postForm.elements.body.value.trim();
  const photos = Array.from(photoInput.files || []);
  const video = videoInput.files?.[0] || null;
  if (photos.length > 5) { formError.textContent = "Puedes adjuntar hasta cinco fotos."; return; }
  if (video && !["video/mp4", "video/webm"].includes(video.type)) { formError.textContent = "Por ahora el video debe estar en formato MP4 o WebM."; return; }
  if (video) {
    if (video.size > MAX_FILE_BYTES) { formError.textContent = "El video supera 50 MB. Comprímelo antes de enviarlo."; return; }
    try { if (await videoDuration(video) > 120) { formError.textContent = "El video supera los dos minutos."; return; } }
    catch (problem) { formError.textContent = friendlyError(problem); return; }
  }
  const submitButton = postForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    await uploadPendingPost({ author, title, body, category: postForm.elements.category.value, photos, video });
    postForm.reset(); refreshMediaPreview(); postDialog.close();
    setCommunityStatus("Tu contenido se envió a revisión. Solo aparecerá en la comunidad después de ser aprobado.");
    if (isAdmin) await refreshModerationQueue();
  } catch (problem) {
    formError.textContent = friendlyError(problem);
  } finally {
    submitButton.disabled = false;
  }
});

async function refreshModerationQueue() {
  if (!isAdmin || !db) return;
  moderationMessage.textContent = "Cargando contenido pendiente…";
  const [{ data: pendingPosts, error: postsError }, { data: pendingComments, error: commentsError }, { data: openReports, error: reportsError }] = await Promise.all([
    db.from("community_posts").select("id, user_id, author_name, title, body, category, created_at").eq("status", "pending").order("created_at"),
    db.from("community_comments").select("id, post_id, user_id, author_name, body, created_at").eq("status", "pending").order("created_at"),
    db.from("community_reports").select("id, reporter_id, target_type, target_id, reason, details, created_at").eq("status", "open").order("created_at")
  ]);
  if (postsError || commentsError || reportsError) { moderationMessage.textContent = friendlyError(postsError || commentsError || reportsError); return; }
  const postIds = (pendingPosts || []).map(post => post.id);
  const { data: mediaRows, error: mediaError } = postIds.length ? await db.from("community_media").select("post_id, storage_path, media_type").in("post_id", postIds) : { data: [], error: null };
  if (mediaError) { moderationMessage.textContent = friendlyError(mediaError); return; }
  const attachments = new Map();
  for (const media of mediaRows || []) {
    try {
      const url = await signedMediaUrl(media.storage_path);
      if (!attachments.has(media.post_id)) attachments.set(media.post_id, []);
      attachments.get(media.post_id).push({ url, type: media.media_type });
    } catch { /* El administrador puede rechazar o revisar el texto aunque un archivo no cargue. */ }
  }
  const postTitles = new Map((pendingPosts || []).map(post => [post.id, post.title]));
  const postCards = (pendingPosts || []).map(post => {
    const files = (attachments.get(post.id) || []).map(item => item.type === "photo" ? `<img src="${escapeHTML(item.url)}" alt="Archivo pendiente de ${escapeHTML(post.author_name)}">` : `<video src="${escapeHTML(item.url)}" controls preload="metadata"></video>`).join("");
    return `<article class="moderation-card"><div class="moderation-content"><span class="moderation-label">PUBLICACIÓN · ${escapeHTML(post.category)}</span><h4>${escapeHTML(post.title)}</h4><p><b>${escapeHTML(post.author_name)}</b> · ${escapeHTML(new Date(post.created_at).toLocaleString("es-CO"))}</p><p>${escapeHTML(post.body)}</p><div class="moderation-media">${files}</div><div class="moderation-actions"><button class="button button-dark" data-review="approve-post" data-id="${escapeHTML(post.id)}">Aprobar</button><button class="button button-reject" data-review="reject-post" data-id="${escapeHTML(post.id)}">Rechazar</button></div></div></article>`;
  }).join("");
  const commentCards = (pendingComments || []).map(comment => `<article class="moderation-card"><div class="moderation-content"><span class="moderation-label">COMENTARIO · EN ${escapeHTML(postTitles.get(comment.post_id) || "publicación aprobada")}</span><p><b>${escapeHTML(comment.author_name)}</b> · ${escapeHTML(new Date(comment.created_at).toLocaleString("es-CO"))}</p><p>${escapeHTML(comment.body)}</p><div class="moderation-actions"><button class="button button-dark" data-review="approve-comment" data-id="${escapeHTML(comment.id)}">Aprobar</button><button class="button button-reject" data-review="reject-comment" data-id="${escapeHTML(comment.id)}">Rechazar</button></div></div></article>`).join("");
  const postReportIds = (openReports || []).filter(report => report.target_type === "post").map(report => report.target_id);
  const commentReportIds = (openReports || []).filter(report => report.target_type === "comment").map(report => report.target_id);
  const [{ data: reportedPosts }, { data: reportedComments }] = await Promise.all([
    postReportIds.length ? db.from("community_posts").select("id, author_name, title, body").in("id", postReportIds) : { data: [] },
    commentReportIds.length ? db.from("community_comments").select("id, author_name, body").in("id", commentReportIds) : { data: [] }
  ]);
  const postReportMap = new Map((reportedPosts || []).map(row => [row.id, row]));
  const commentReportMap = new Map((reportedComments || []).map(row => [row.id, row]));
  const reasonNames = { insult: "insulto", harassment: "acoso", sexual: "contenido sexual", violence: "violencia", privacy: "privacidad", spam: "spam", other: "otro" };
  const reportCards = (openReports || []).map(report => {
    const target = report.target_type === "post" ? postReportMap.get(report.target_id) : commentReportMap.get(report.target_id);
    const description = target ? `${target.author_name}: ${report.target_type === "post" ? target.title : target.body}` : "El contenido reportado ya no está disponible.";
    const removeAction = target ? `<button class="button button-reject" data-review="remove-${report.target_type}" data-id="${escapeHTML(report.target_id)}" data-report-id="${escapeHTML(report.id)}">Retirar contenido</button>` : "";
    return `<article class="moderation-card"><div class="moderation-content"><span class="moderation-label">REPORTE · ${escapeHTML(reasonNames[report.reason] || "otro")}</span><p>${escapeHTML(description)}</p><p>${escapeHTML(report.details || "Sin detalles adicionales")}</p><p>Recibido: ${escapeHTML(new Date(report.created_at).toLocaleString("es-CO"))}</p><div class="moderation-actions">${removeAction}<button class="button button-dark" data-review="resolve-report" data-id="${escapeHTML(report.id)}">Cerrar reporte</button></div></div></article>`;
  }).join("");
  moderationQueue.innerHTML = postCards + commentCards + reportCards;
  moderationMessage.textContent = `Pendientes: ${(pendingPosts || []).length} publicaciones, ${(pendingComments || []).length} comentarios y ${(openReports || []).length} reportes.`;
}

document.getElementById("refreshModeration").addEventListener("click", refreshModerationQueue);

const quoteForm = document.getElementById("quoteForm");
const quoteFiles = document.getElementById("quoteFiles");
const quoteFileList = document.getElementById("quoteFileList");
const quoteResult = document.getElementById("quoteResult");
const quotePreview = document.getElementById("quotePreview");
const quoteWhatsApp = document.getElementById("quoteWhatsApp");
const quoteEmail = document.getElementById("quoteEmail");
const downloadQuoteButton = document.getElementById("downloadQuote");
let latestQuoteText = "";

quoteFiles.addEventListener("change", () => {
  const selected = [...quoteFiles.files];
  const pdfs = selected.filter(file => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
  if (pdfs.length !== selected.length) {
    quoteFileList.textContent = "Selecciona únicamente archivos PDF. Vuelve a elegir los documentos.";
    quoteFiles.value = "";
    return;
  }
  quoteFileList.textContent = pdfs.length ? `PDF seleccionados: ${pdfs.map(file => file.name).join(", ")}` : "Aún no has seleccionado documentos.";
});

quoteForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!isAdmin || !currentUser) return;
  const form = new FormData(quoteForm);
  const name = String(form.get("clientName") || "").trim();
  const email = String(form.get("clientEmail") || "").trim();
  const phone = String(form.get("clientPhone") || "").trim();
  if (!email && !phone) {
    quoteResult.hidden = false;
    quotePreview.textContent = "Escribe el correo o el WhatsApp del cliente para preparar el envío.";
    return;
  }
  const service = String(form.get("service") || "").trim();
  const schedule = String(form.get("schedule") || "").trim();
  const details = String(form.get("details") || "").trim();
  const rawPrice = String(form.get("price") || "").trim();
  const priceNumber = Number(rawPrice.replace(/[^0-9]/g, ""));
  const price = rawPrice ? (priceNumber ? priceNumber.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }) : rawPrice) : "Por definir";
  const validity = String(form.get("validity") || "").trim();
  const docs = [...quoteFiles.files].map(file => file.name);
  latestQuoteText = [
    `Hola ${name}, te comparto la cotización de VEDRONGA.`, "",
    `Servicio: ${service}`,
    schedule ? `Lugar y fecha: ${schedule}` : "",
    details ? `Alcance: ${details}` : "",
    `Valor: ${price}`,
    validity ? `Vigencia: ${validity}` : "",
    docs.length ? `Documentos que adjuntaré: ${docs.join(", ")}` : "",
    "", "Quedo atento a tus comentarios.", "Janer Vega · VEDRONGA"
  ].filter(Boolean).join("\n");
  quotePreview.textContent = latestQuoteText;
  quoteResult.hidden = false;
  const encodedMessage = encodeURIComponent(latestQuoteText);
  let phoneDigits = phone.replace(/\D/g, "");
  if (phoneDigits.length === 10 && phoneDigits.startsWith("3")) phoneDigits = `57${phoneDigits}`;
  quoteWhatsApp.hidden = !phoneDigits;
  if (phoneDigits) quoteWhatsApp.href = `https://wa.me/${phoneDigits}?text=${encodedMessage}`;
  quoteEmail.hidden = !email;
  if (email) quoteEmail.href = `mailto:${email}?subject=${encodeURIComponent(`Cotización VEDRONGA · ${service}`)}&body=${encodedMessage}`;
  downloadQuoteButton.disabled = false;
});

downloadQuoteButton.addEventListener("click", () => {
  if (!isAdmin || !latestQuoteText) return;
  const printable = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Cotización VEDRONGA</title><style>body{font:16px/1.6 Arial,sans-serif;max-width:760px;margin:50px auto;color:#17271f}h1{font:32px Georgia,serif}pre{white-space:pre-wrap;font:16px/1.7 Arial,sans-serif}button{padding:10px 16px}@media print{button{display:none}body{margin:20mm}}</style><body><button onclick="window.print()">Imprimir o guardar como PDF</button><h1>VEDRONGA · Cotización</h1><pre>${escapeHTML(latestQuoteText)}</pre></body></html>`;
  const url = URL.createObjectURL(new Blob([printable], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `cotizacion-vedronga-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
});

const exportUsersButton = document.getElementById("exportUsers");
const exportUsersMessage = document.getElementById("exportUsersMessage");
function csvCell(value) {
  let safe = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(safe)) safe = `'${safe}`;
  return `"${safe.replaceAll('"', '""')}"`;
}
exportUsersButton.addEventListener("click", async () => {
  if (!isAdmin || !currentUser || !db) return;
  exportUsersButton.disabled = true;
  exportUsersMessage.textContent = "Preparando el reporte…";
  try {
    const { data, error } = await db.rpc("admin_list_community_users");
    if (error) throw error;
    const columns = ["Nombre", "Correo electrónico", "Tipo de cuenta", "Fecha de registro", "Correo confirmado", "Último acceso", "UID"];
    const rows = (data || []).map(user => [
      user.display_name || "", user.email || "", user.account_type || "usuario",
      user.created_at ? new Date(user.created_at).toLocaleString("es-CO") : "",
      user.email_confirmed_at ? "Sí" : "No",
      user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("es-CO") : "Nunca",
      user.user_id
    ]);
    const csv = "\ufeff" + [columns, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `vedronga-usuarios-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    exportUsersMessage.textContent = `Reporte descargado: ${(data || []).length} cuentas. Puedes abrir el archivo CSV con Excel.`;
  } catch (error) {
    exportUsersMessage.textContent = friendlyError(error);
  } finally {
    exportUsersButton.disabled = false;
  }
});
moderationQueue.addEventListener("click", async event => {
  const button = event.target.closest("[data-review]");
  if (!button || !isAdmin || !currentUser) return;
  const action = button.dataset.review;
  const reviewTime = new Date().toISOString();
  button.disabled = true;
  let error = null;
  if (action === "resolve-report") {
    ({ error } = await db.from("community_reports").update({ status: "resolved" }).eq("id", button.dataset.id));
  } else if (action.startsWith("remove-")) {
    const table = action === "remove-post" ? "community_posts" : "community_comments";
    ({ error } = await db.from(table).update({ status: "removed", reviewed_at: reviewTime, reviewed_by: currentUser.id }).eq("id", button.dataset.id));
    if (!error && button.dataset.reportId) ({ error } = await db.from("community_reports").update({ status: "resolved" }).eq("id", button.dataset.reportId));
  } else {
    const isPost = action.endsWith("post");
    const table = isPost ? "community_posts" : "community_comments";
    const status = action.startsWith("approve") ? "approved" : "rejected";
    ({ error } = await db.from(table).update({ status, reviewed_at: reviewTime, reviewed_by: currentUser.id }).eq("id", button.dataset.id));
  }
  if (error) {
    moderationMessage.textContent = friendlyError(error);
    button.disabled = false;
    return;
  }
  moderationMessage.textContent = action.startsWith("approve") ? "Contenido aprobado y visible para la comunidad." : action.startsWith("remove-") ? "Contenido retirado de la comunidad." : action === "resolve-report" ? "Reporte cerrado." : "Contenido rechazado; no se mostrará a los visitantes.";
  await Promise.all([refreshModerationQueue(), loadApprovedPosts()]);
});

document.getElementById("menuToggle").addEventListener("click", event => {
  const mainNav = document.getElementById("mainNav");
  const open = mainNav.classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(open));
  event.currentTarget.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
});
document.getElementById("mainNav").querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
  document.getElementById("mainNav").classList.remove("open");
  document.getElementById("menuToggle").setAttribute("aria-expanded", "false");
}));

const gallery = document.querySelector(".gallery");
const portfolioVideos = document.getElementById("portfolioVideos");
const lightbox = document.getElementById("imageLightbox");
const lightboxImage = document.getElementById("lightboxImage");
const lightboxVideo = document.getElementById("lightboxVideo");
const lightboxCaption = document.getElementById("lightboxCaption");
const zoomLevel = document.getElementById("zoomLevel");
const zoomOut = document.getElementById("zoomOut");
const zoomIn = document.getElementById("zoomIn");
let zoom = 1, panX = 0, panY = 0, dragStart = null;
function updateZoom() { lightboxImage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`; lightboxImage.classList.toggle("zoomed", zoom > 1); zoomLevel.textContent = `${Math.round(zoom * 100)}%`; zoomOut.disabled = zoom <= 1; zoomIn.disabled = zoom >= 4; }
function resetZoom() { zoom = 1; panX = 0; panY = 0; updateZoom(); }
function setZoom(value) { zoom = Math.max(1, Math.min(4, value)); if (zoom === 1) { panX = 0; panY = 0; } updateZoom(); }
function openLightbox(media) {
  const isVideo = media.tagName === "VIDEO";
  resetZoom(); lightbox.classList.toggle("showing-video", isVideo); lightboxImage.hidden = isVideo; lightboxVideo.hidden = !isVideo;
  if (isVideo) lightboxVideo.src = media.dataset.fullSrc || media.currentSrc || media.src;
  else { lightboxVideo.pause(); lightboxVideo.removeAttribute("src"); lightboxVideo.load(); lightboxImage.src = media.currentSrc || media.src; lightboxImage.alt = media.alt; }
  const figure = media.closest(".gallery-item"); lightboxCaption.textContent = figure?.querySelector("figcaption")?.innerText || media.alt || "Video";
  lightbox.showModal(); if (isVideo) lightboxVideo.play().catch(() => {});
}
function enablePortfolioLightbox(container) {
  if (!container) return;
  container.addEventListener("click", event => { const figure = event.target.closest(".gallery-item"); const media = figure?.querySelector("video, img"); if (media) openLightbox(media); });
  container.addEventListener("keydown", event => { const figure = event.target.closest(".gallery-item"); if (figure && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); const media = figure.querySelector("video, img"); if (media) openLightbox(media); } });
}
enablePortfolioLightbox(gallery);
enablePortfolioLightbox(portfolioVideos);
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
loadApprovedPosts();
